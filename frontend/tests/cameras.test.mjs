import assert from "node:assert/strict";
import test from "node:test";
import { getLensRecommendation } from "../lib/cameras.ts";

test("visual inheritance, overrides, resize, requirement edits and reset", () => {
  const change = (state, values) => quoteConfigurationReducer(state, { type: "defaults", defaults: { ...state.defaults, ...values } });
  let state = change(initial(), { viewingRange: "far", targetDistanceM: 28 });
  assert.ok(state.cameras.every(c => c.viewingRange === "far" && c.targetDistanceM === 28));
  state = save(state, 0, { viewingRange: "mixed", targetDistanceM: 42 });
  state = change(state, { viewingRange: "medium", targetDistanceM: 8 });
  assert.equal(state.cameras[0].viewingRange, "mixed");
  assert.equal(state.cameras[0].targetDistanceM, 42);
  assert.ok(state.cameras.slice(1).every(c => c.viewingRange === "medium" && c.targetDistanceM === 8));
  state = patch(state, { camera_count: 9, retention_days: 15 });
  assert.equal(state.cameras[8].viewingRange, "medium");
  assert.equal(state.cameras[8].targetDistanceM, 8);
  state = quoteConfigurationReducer(state, { type: "resetCamera", id: "C1" });
  assert.equal(state.cameras[0].viewingRange, "medium");
  assert.equal(state.cameras[0].targetDistanceM, 8);
  assert.equal(state.cameras[0].customized, false);
  state = change(state, { targetDistanceM: undefined });
  assert.ok(state.cameras.every(c => c.targetDistanceM === undefined));
});

test("target distance is optional, finite, nonnegative and independent of cable/API", () => {
  const state = initial();
  for (const targetDistanceM of [-1, NaN, Infinity]) assert.equal(validCameraDefaults({ ...state.defaults, targetDistanceM }), false);
  for (const targetDistanceM of [undefined, 0, 0.5, 1000]) assert.equal(validCameraDefaults({ ...state.defaults, targetDistanceM }), true);
  const customized = save(state, 0, { viewingRange: "far", targetDistanceM: 400 });
  assert.equal(customized.cameras[0].distanceM, 25);
  assert.deepEqual(adaptCameraRequirements(customized.requirements, customized.cameras).payload, requirements);
});

test("four recommendations and review threshold warnings", () => {
  for (const [viewingRange, text] of [["near", "angular"], ["medium", "4–6 mm"], ["far", "6–12 mm"], ["mixed", "separadas"]]) {
    assert.ok(getLensRecommendation({ viewingRange }).text.includes(text));
  }
  assert.ok(getLensRecommendation({ viewingRange: "mixed" }).warnings[0].includes("segunda cámara"));
  for (const viewingRange of ["near", "far"]) {
    assert.equal(getLensRecommendation({ viewingRange, targetDistanceM: 19.9 }).warnings.length, 0);
    assert.equal(getLensRecommendation({ viewingRange, targetDistanceM: 20 }).warnings.length, 1);
  }
  assert.equal(getLensRecommendation({ viewingRange: "medium", targetDistanceM: 100 }).warnings.length, 0);
});
import { adaptCameraRequirements, createQuoteConfiguration, getCameraDefaults, quoteConfigurationReducer, syncCameras, validCameraDefaults } from "../lib/cameras.ts";

const requirements = {
  camera_count: 8, outdoor_camera_count: 3, resolution_mp: 4, retention_days: 30,
  recording_hours_per_day: 24, average_cable_m_per_camera: 25, wired_poe: true,
  extra_material_cost: 1000, labor_cost: 300, margin_percent: 35,
};
const initial = () => createQuoteConfiguration({ ...requirements });
const save = (state, index, overrides) => quoteConfigurationReducer(state, { type: "saveCamera", camera: { ...state.cameras[index], ...overrides } });
const patch = (state, values) => quoteConfigurationReducer(state, { type: "requirements", patch: values });

test("simple project generates C1–C8, assigns first three outdoors and preserves the API payload", () => {
  const state = initial();
  assert.deepEqual(state.cameras.map((camera) => camera.id), ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]);
  assert.equal(state.cameras.filter((camera) => camera.environment === "outdoor").length, 3);
  assert.ok(state.cameras.every((camera) => !camera.customized && camera.formFactor === "turret" && camera.distanceM === 25));
  assert.deepEqual(adaptCameraRequirements(state.requirements, state.cameras).payload, requirements);
});

test("C1/C4 keep all saved overrides while other cameras inherit new defaults", () => {
  let state = save(initial(), 0, { name: "Entrada", location: "Portón", notes: "Revisar altura", resolutionMp: 8, distanceM: 42, environment: "indoor", formFactor: "bullet" });
  state = save(state, 3, { connectivity: "wifi", environment: "outdoor", distanceM: 12 });
  const customized = [state.cameras[0], state.cameras[3]];
  state = patch(state, { resolution_mp: 5, average_cable_m_per_camera: 30, outdoor_camera_count: 1, wired_poe: false });
  assert.deepEqual([state.cameras[0], state.cameras[3]], customized);
  for (const index of [1, 2, 4, 5, 6, 7]) {
    assert.equal(state.cameras[index].resolutionMp, 5);
    assert.equal(state.cameras[index].distanceM, 30);
    assert.equal(state.cameras[index].connectivity, "wifi");
    assert.equal(state.cameras[index].environment, "indoor");
  }
  assert.equal(adaptCameraRequirements(state.requirements, state.cameras).payload.outdoor_camera_count, 1);
});

test("resize preserves remaining customizations, appends defaults, and removes discarded cameras", () => {
  let state = save(initial(), 3, { name: "Caja", resolutionMp: 8 });
  state = patch(state, { camera_count: 12 });
  assert.equal(state.cameras.length, 12);
  assert.equal(state.cameras[11].name, "Cámara 12");
  assert.equal(state.cameras[3].name, "Caja");
  state = patch(state, { camera_count: 3 });
  assert.equal(state.cameras.length, 3);
  state = patch(state, { camera_count: 4 });
  assert.equal(state.cameras[3].customized, false);
  assert.equal(state.cameras[3].name, "Cámara 4");
});

test("reset restores the latest defaults, position-based environment and inheritance", () => {
  let state = save(initial(), 0, { location: "Patio", notes: "Nota", environment: "indoor", resolutionMp: 8, distanceM: 42 });
  state = patch(state, { resolution_mp: 5, average_cable_m_per_camera: 30 });
  state = quoteConfigurationReducer(state, { type: "resetCamera", id: "C1" });
  assert.deepEqual(state.cameras[0], { id: "C1", name: "Cámara 1", environment: "outdoor", formFactor: "turret", resolutionMp: 5, connectivity: "poe", distanceM: 30, viewingRange: "near", targetDistanceM: undefined, customized: false });
  state = patch(state, { resolution_mp: 2 });
  assert.equal(state.cameras[0].resolutionMp, 2);
});

test("aggregate payload averages only PoE distances, uses highest resolution and warns for both mixtures", () => {
  let state = save(initial(), 0, { resolutionMp: 8, distanceM: 42, environment: "indoor" });
  state = save(state, 3, { connectivity: "wifi", distanceM: 500 });
  const result = adaptCameraRequirements(state.requirements, state.cameras);
  assert.equal(result.payload.average_cable_m_per_camera, (42 + 6 * 25) / 7);
  assert.equal(result.payload.resolution_mp, 8);
  assert.equal(result.payload.wired_poe, true);
  assert.equal(result.payload.outdoor_camera_count, 2);
  assert.equal(result.individualDistances, true);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.some((message) => message.includes("mixtas PoE/Wi-Fi")));
  assert.ok(result.warnings.some((message) => message.includes("mayor resolución")));
  assert.deepEqual(Object.keys(result.payload).sort(), Object.keys(requirements).sort());
});

test("all Wi-Fi has no division by zero; uniform customized resolution replaces global resolution", () => {
  let state = patch(initial(), { wired_poe: false });
  for (let index = 0; index < 8; index++) state = save(state, index, { resolutionMp: 2 });
  const result = adaptCameraRequirements(state.requirements, state.cameras);
  assert.equal(result.payload.average_cable_m_per_camera, 0);
  assert.equal(result.payload.wired_poe, false);
  assert.equal(result.payload.resolution_mp, 2);
  assert.deepEqual(result.warnings, []);
});

test("invalid global counts and distances cannot produce invalid camera collections", () => {
  const defaults = getCameraDefaults(requirements);
  for (const change of [{ cameraCount: 0 }, { cameraCount: 65 }, { cameraCount: NaN }, { cameraCount: 2.5 }, { outdoorCount: 9 }, { outdoorCount: -1 }, { distanceM: -1 }, { distanceM: 501 }, { distanceM: NaN }]) {
    assert.equal(validCameraDefaults({ ...defaults, ...change }), false);
    assert.throws(() => syncCameras([], { ...defaults, ...change }));
  }
  assert.equal(validCameraDefaults({ ...defaults, outdoorCount: 8, distanceM: 500 }), true);
});
