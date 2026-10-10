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

test("target distance is optional, finite, positive and independent of cable/API", () => {
  const state = initial();
  for (const targetDistanceM of [-1, 0, NaN, Infinity]) assert.equal(validCameraDefaults({ ...state.defaults, targetDistanceM }), false);
  for (const targetDistanceM of [undefined, 0.5, 1000]) assert.equal(validCameraDefaults({ ...state.defaults, targetDistanceM }), true);
  const customized = save(state, 0, { viewingRange: "far", targetDistanceM: 400 });
  assert.equal(customized.cameras[0].distanceM, 25);
  assert.deepEqual(aggregatePayload(adaptCameraRequirements(customized.requirements, customized.cameras).payload), requirements);
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
import { adaptCameraRequirements, createCamera, createQuoteConfiguration, getCameraDefaults, getCameraPending, getProjectPending, normalizeProjectSurvey, quoteConfigurationReducer, syncCameras, validCameraDefaults, validCameraRequirement } from "../lib/cameras.ts";

const requirements = {
  camera_count: 8, outdoor_camera_count: 3, resolution_mp: 4, retention_days: 30,
  recording_hours_per_day: 24, average_cable_m_per_camera: 25, wired_poe: true,
  extra_material_cost: 1000, labor_cost: 300, margin_percent: 35,
};
const initial = () => createQuoteConfiguration({ ...requirements });
const save = (state, index, overrides) => quoteConfigurationReducer(state, { type: "saveCamera", camera: { ...state.cameras[index], ...overrides } });
const patch = (state, values) => quoteConfigurationReducer(state, { type: "requirements", patch: values });
const aggregatePayload = ({ recordingMode, cameras, cameraDefaults, ...legacy }) => legacy;

test("simple project generates C1–C8, assigns first three outdoors and preserves the API payload", () => {
  const state = initial();
  assert.deepEqual(state.cameras.map((camera) => camera.id), ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]);
  assert.equal(state.cameras.filter((camera) => camera.environment === "outdoor").length, 3);
  assert.ok(state.cameras.every((camera) => !camera.customized && camera.formFactor === "turret" && camera.distanceM === 25));
  const payload = adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload;
  assert.deepEqual(aggregatePayload(payload), requirements);
  assert.deepEqual(payload.cameras, state.cameras);
  assert.deepEqual(payload.cameraDefaults, state.defaults);
  assert.equal(payload.recordingMode, "undefined");
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
  assert.deepEqual(state.cameras[0], createCamera(0, state.defaults));
  assert.equal(state.cameras[0].environment, "outdoor");
  assert.equal(state.cameras[0].resolutionMp, 5);
  assert.equal(state.cameras[0].distanceM, 30);
  assert.equal(state.cameras[0].customized, false);
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
  assert.deepEqual(Object.keys(aggregatePayload(result.payload)).sort(), Object.keys(requirements).sort());
  assert.deepEqual(result.payload.cameras, state.cameras);
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

test("distinct image and night objectives persist independently of visual range and cable", () => {
  let state = save(initial(), 0, {
    imageObjective: "identify", viewingRange: "far", targetDistanceM: 28.5,
    nightObjectiveRequired: "yes", nightLighting: "permanent", nightColorRequired: "yes",
  });
  state = save(state, 1, { imageObjective: "overview", nightObjectiveRequired: "no" });
  state = save(state, 2, { imageObjective: "recognize", targetDistanceM: 9.25 });
  const payload = adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload;
  assert.equal(payload.cameras[0].imageObjective, "identify");
  assert.equal(payload.cameras[0].viewingRange, "far");
  assert.equal(payload.cameras[0].targetDistanceM, 28.5);
  assert.equal(payload.cameras[0].distanceM, 25);
  assert.equal(payload.cameras[0].nightObjectiveRequired, "yes");
  assert.equal(payload.cameras[0].nightLighting, "permanent");
  assert.equal(payload.cameras[0].nightColorRequired, "yes");
  assert.equal(payload.cameras[1].imageObjective, "overview");
  assert.equal(payload.cameras[1].nightObjectiveRequired, "no");
  assert.equal(payload.cameras[2].imageObjective, "recognize");
  assert.equal(payload.cameras[2].targetDistanceM, 9.25);
});

test("new defaults inherit, customized records stay frozen and reset inherits current values", () => {
  let state = initial();
  const change = (values) => state = quoteConfigurationReducer(state, { type: "defaults", defaults: { ...state.defaults, ...values } });
  change({ imageObjective: "identify", targetDistanceM: 20, nightObjectiveRequired: "yes", nightLighting: "motion", nightColorRequired: "no", detectionEvent: "line_crossing", detectionTarget: "vehicle", eventActions: ["mobile_notification"] });
  assert.ok(state.cameras.every(camera => camera.imageObjective === "identify" && camera.detectionTarget === "vehicle"));
  state = save(state, 0, { imageObjective: "recognize", targetDistanceM: 6, nightLighting: "none", detectionEvent: "intrusion_zone", detectionTarget: "person", eventActions: ["external_siren"] });
  const saved = structuredClone(state.cameras[0]);
  change({ imageObjective: "overview", targetDistanceM: undefined, nightObjectiveRequired: "no", detectionEvent: "motion", detectionTarget: "any", eventActions: [] });
  assert.deepEqual(state.cameras[0], saved);
  assert.ok(state.cameras.slice(1).every(camera => camera.imageObjective === "overview" && camera.detectionEvent === "motion"));
  state = quoteConfigurationReducer(state, { type: "resetCamera", id: "C1" });
  assert.equal(state.cameras[0].imageObjective, "overview");
  assert.equal(state.cameras[0].nightObjectiveRequired, "no");
  assert.equal(state.cameras[0].detectionTarget, "any");
  assert.deepEqual(state.cameras[0].eventActions, []);
});

test("continuous recording coexists with all detection types, targets and independent actions", () => {
  let state = patch(initial(), { recordingMode: "continuous" });
  for (const [index, detectionEvent, detectionTarget, eventActions] of [
    [0, "motion", "person", ["mobile_notification"]],
    [1, "line_crossing", "vehicle", ["external_siren"]],
    [2, "intrusion_zone", "person_vehicle", ["mobile_notification", "external_siren"]],
  ]) state = save(state, index, { detectionEvent, detectionTarget, eventActions });
  const payload = adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload;
  assert.equal(payload.recordingMode, "continuous");
  assert.deepEqual(payload.cameras.slice(0, 3).map(camera => camera.detectionEvent), ["motion", "line_crossing", "intrusion_zone"]);
  assert.deepEqual(payload.cameras.slice(0, 3).map(camera => camera.detectionTarget), ["person", "vehicle", "person_vehicle"]);
  assert.deepEqual(payload.cameras[2].eventActions, ["mobile_notification", "external_siren"]);
  assert.equal(payload.recording_hours_per_day, 24);
  state = patch(state, { recordingMode: "events" });
  assert.equal(adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload.recording_hours_per_day, 24);
});

test("pendings describe missing answers and siren integration but are valid drafts", () => {
  const incomplete = { ...initial().cameras[0], imageObjective: "identify", nightObjectiveRequired: "yes", detectionEvent: "line_crossing", eventActions: ["external_siren"] };
  assert.equal(validCameraRequirement(incomplete), true);
  const pending = getCameraPending(incomplete, "events");
  for (const wording of ["distancia de identificación", "iluminación nocturna", "color nocturno", "qué debe generar", "integración de sirena externa", "relé/contacto seco", "alimentación", "configuración"]) assert.ok(pending.some(item => item.includes(wording)));
  assert.ok(getCameraPending({ ...incomplete, imageObjective: "recognize" }).some(item => item.includes("distancia de reconocimiento")));
  for (const detectionEvent of ["none", "undefined"]) {
    assert.ok(getCameraPending({ ...incomplete, detectionEvent }, "events").some(item => item.includes("evento para grabación por eventos")));
    assert.ok(!getCameraPending({ ...incomplete, detectionEvent }, "continuous").some(item => item.includes("evento para grabación por eventos")));
  }
  const complete = { ...incomplete, imageObjective: "overview", nightObjectiveRequired: "no", detectionEvent: "none", eventActions: [] };
  assert.deepEqual(getCameraPending(complete, "continuous"), []);
  assert.deepEqual(getProjectPending({ ...requirements, recordingMode: "continuous" }, [complete]), []);
  assert.ok(getProjectPending(requirements, [incomplete])[0].includes("modalidad de grabación"));
  assert.ok(getProjectPending(requirements, [incomplete])[1].startsWith("Cámara C1:"));
});

test("invalid target or cable values are errors even for otherwise incomplete drafts", () => {
  const camera = initial().cameras[0];
  for (const targetDistanceM of [-1, 0, NaN, Infinity]) {
    assert.equal(validCameraRequirement({ ...camera, targetDistanceM }), false);
    assert.throws(() => save(initial(), 0, { targetDistanceM }), /distancia al objetivo debe ser positiva/);
  }
  for (const distanceM of [-1, 501, NaN, Infinity]) assert.equal(validCameraRequirement({ ...camera, distanceM }), false);
  for (const eventActions of ["external_siren", 42, { invalid: true }, ["invalid_action"]]) assert.equal(validCameraRequirement({ ...camera, eventActions }), false);
  assert.equal(validCameraRequirement({ ...camera, targetDistanceM: 0.01, distanceM: 0 }), true);
});

test("legacy projects normalize only missing answers and restore existing custom camera detail", () => {
  const legacyCamera = { id: "C1", name: "Entrada antigua", environment: "outdoor", formFactor: "bullet", resolutionMp: 8, connectivity: "poe", distanceM: 44, viewingRange: "far", targetDistanceM: 28, customized: true, location: "Portón", notes: "No perder" };
  const project = { id: "legacy", customer_name: "Cliente", site_name: "Casa", notes: "Notas antiguas", requirements: { ...requirements, cameras: [legacyCamera] } };
  let state = quoteConfigurationReducer(initial(), { type: "loadProject", project });
  for (const key of ["imageObjective", "nightObjectiveRequired", "nightColorRequired", "detectionEvent", "detectionTarget"]) assert.equal(state.cameras[0][key], "undefined");
  assert.equal(state.cameras[0].nightLighting, "unknown");
  assert.deepEqual(state.cameras[0].eventActions, []);
  assert.equal(state.requirements.recordingMode, "undefined");
  assert.equal(state.cameras[0].viewingRange, "far");
  assert.equal(state.cameras[0].targetDistanceM, 28);
  assert.equal(state.cameras[0].distanceM, 44);
  assert.equal(state.cameras[0].notes, "No perder");
  state = patch(state, { resolution_mp: 2, average_cable_m_per_camera: 5 });
  assert.equal(state.cameras[0].resolutionMp, 8);
  assert.equal(state.cameras[0].distanceM, 44);
  assert.equal(normalizeProjectSurvey(project).notes, "Notas antiguas");
  assert.equal(normalizeProjectSurvey(project).client, "Cliente");
  assert.equal(normalizeProjectSurvey(project).siteType, "");
  assert.equal(normalizeProjectSurvey(project).cabling, "");
  assert.deepEqual(normalizeProjectSurvey(project).extras, []);
});

test("saved project load does not overwrite individual values with global defaults", () => {
  let state = save(initial(), 0, { imageObjective: "identify", targetDistanceM: 17, nightObjectiveRequired: "yes", nightLighting: "permanent", nightColorRequired: "no", detectionEvent: "motion", detectionTarget: "person", eventActions: ["mobile_notification"] });
  const payload = adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload;
  const loaded = quoteConfigurationReducer(initial(), { type: "loadProject", project: { id: "saved", requirements: JSON.parse(JSON.stringify(payload)) } });
  assert.deepEqual(loaded.cameras[0], state.cameras[0]);
  assert.equal(loaded.defaults.imageObjective, "undefined");
  const inheritedButSaved = { ...state.cameras[1], name: "Nombre guardado", imageObjective: "recognize", targetDistanceM: 4.5 };
  const restored = createQuoteConfiguration({ ...payload, cameras: [state.cameras[0], inheritedButSaved, ...state.cameras.slice(2)] });
  assert.equal(restored.cameras[1].name, "Nombre guardado");
  assert.equal(restored.cameras[1].imageObjective, "recognize");
  assert.equal(restored.cameras[1].targetDistanceM, 4.5);
});

test("recovery restores actual defaults rather than custom-camera aggregate values", () => {
  let state = patch(initial(), { resolution_mp: 2, outdoor_camera_count: 1 });
  state = save(state, 0, { resolutionMp: 8, environment: "indoor", distanceM: 100 });
  state = save(state, 1, { connectivity: "wifi", distanceM: 0 });
  const payload = adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload;
  assert.equal(payload.resolution_mp, 8);
  assert.equal(payload.outdoor_camera_count, 0);
  assert.notEqual(payload.average_cable_m_per_camera, state.defaults.distanceM);
  const loaded = createQuoteConfiguration(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(loaded.defaults, state.defaults);
  assert.equal(loaded.requirements.resolution_mp, 2);
  assert.equal(loaded.requirements.outdoor_camera_count, 1);
  assert.equal(loaded.requirements.average_cable_m_per_camera, 25);
  assert.deepEqual(loaded.cameras, state.cameras);
  const edited = patch(loaded, { retention_days: 15, recordingMode: "events", labor_cost: 450 });
  assert.equal(edited.cameras, loaded.cameras);
  assert.deepEqual(edited.defaults, loaded.defaults);
  assert.deepEqual(adaptCameraRequirements(edited.requirements, edited.cameras, edited.defaults).payload.cameras, payload.cameras);
});

test("changing retention preserves stored individual values even with an inherited flag", () => {
  const inheritedSaved = { ...initial().cameras[0], imageObjective: "recognize", targetDistanceM: 7.5, location: "Ubicación guardada", notes: "Nota guardada" };
  const state = createQuoteConfiguration({ ...requirements, cameras: [inheritedSaved] });
  const edited = patch(state, { retention_days: 60 });
  assert.equal(edited.cameras[0], state.cameras[0]);
  assert.equal(edited.cameras[0].imageObjective, "recognize");
  assert.equal(edited.cameras[0].targetDistanceM, 7.5);
  assert.equal(edited.cameras[0].location, "Ubicación guardada");
});

test("legacy zero target distances reopen as pending while new zero values remain invalid", () => {
  const state = initial();
  const loaded = createQuoteConfiguration({
    ...requirements,
    cameraDefaults: { ...state.defaults, imageObjective: "identify", targetDistanceM: 0 },
    cameras: [{ ...state.cameras[0], imageObjective: "identify", targetDistanceM: 0, customized: true }],
  });
  assert.equal(loaded.defaults.targetDistanceM, undefined);
  assert.equal(loaded.cameras[0].targetDistanceM, undefined);
  assert.ok(getCameraPending(loaded.cameras[0]).some(item => item.includes("distancia de identificación")));
  assert.equal(validCameraRequirement({ ...loaded.cameras[0], targetDistanceM: 0 }), false);
  assert.equal(validCameraDefaults({ ...loaded.defaults, targetDistanceM: 0 }), false);
});
