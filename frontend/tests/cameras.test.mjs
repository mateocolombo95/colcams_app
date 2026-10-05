import assert from "node:assert/strict";
import test from "node:test";
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
  assert.deepEqual(state.cameras[0], { id: "C1", name: "Cámara 1", environment: "outdoor", formFactor: "turret", resolutionMp: 5, connectivity: "poe", distanceM: 30, customized: false });
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
