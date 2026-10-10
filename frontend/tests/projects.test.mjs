import assert from "node:assert/strict";
import test from "node:test";
import { estimateQuote, fetchProject, listProjects, saveProject } from "../lib/api.ts";
import { adaptCameraRequirements, createQuoteConfiguration, quoteConfigurationReducer } from "../lib/cameras.ts";

const requirements = {
  camera_count: 2, outdoor_camera_count: 1, resolution_mp: 4, retention_days: 30,
  recording_hours_per_day: 24, average_cable_m_per_camera: 25, wired_poe: true,
  extra_material_cost: 0, labor_cost: 0, margin_percent: 35, recordingMode: "continuous",
};
const survey = { client: "Cliente", site: "Sitio", siteType: "Casa", notes: "Notas", cabling: "Nuevo", technicalNotes: "Revisar", extras: ["UPS"], extraNotes: "Extra" };

test("individual requirements pass through estimate, create/update and project recovery", async () => {
  const original = globalThis.fetch;
  let document;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/quotes/estimate")) return Response.json({ bom: [], storage_hours_per_day: 24 });
      if (options.method === "POST" || options.method === "PUT") {
        document = { id: "project1", ...JSON.parse(options.body), latest_estimate: { bom: [], storage_hours_per_day: 24 } };
        return Response.json(document);
      }
      return Response.json(url.endsWith("/projects") ? [document] : document);
    };
    let state = createQuoteConfiguration(requirements);
    state = quoteConfigurationReducer(state, { type: "saveCamera", camera: { ...state.cameras[0], imageObjective: "identify", viewingRange: "far", targetDistanceM: 28.5, nightObjectiveRequired: "yes", nightLighting: "permanent", nightColorRequired: "yes", detectionEvent: "intrusion_zone", detectionTarget: "person", eventActions: ["mobile_notification", "external_siren"] } });
    const payload = adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload;
    await estimateQuote(payload);
    assert.deepEqual(JSON.parse(calls[0].options.body).cameras, JSON.parse(JSON.stringify(state.cameras)));
    const saved = await saveProject({ survey, requirements: payload });
    assert.equal(calls[1].options.method, "POST");
    assert.deepEqual(saved.survey, survey);
    assert.deepEqual(saved.requirements.cameraDefaults, JSON.parse(JSON.stringify(state.defaults)));
    assert.deepEqual(saved.requirements.cameras, JSON.parse(JSON.stringify(state.cameras)));
    assert.ok(!Object.hasOwn(JSON.parse(calls[1].options.body), "latest_estimate"));
    const list = await listProjects();
    assert.equal(list[0].id, "project1");
    const loadedProject = await fetchProject(saved.id);
    const loaded = quoteConfigurationReducer(state, { type: "loadProject", project: loadedProject });
    assert.deepEqual(loaded.cameras[0], state.cameras[0]);
    await saveProject({ survey, requirements: payload }, saved.id);
    assert.equal(calls.at(-1).options.method, "PUT");
    assert.ok(calls.at(-1).url.endsWith("/projects/project1"));
  } finally { globalThis.fetch = original; }
});

test("pending drafts can be saved without filling new answers", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.requirements.recordingMode, "undefined");
      assert.equal(body.requirements.cameras[0].imageObjective, "undefined");
      assert.equal(body.requirements.cameras[0].nightObjectiveRequired, "undefined");
      return Response.json({ id: "draft", ...body });
    };
    const state = createQuoteConfiguration({ ...requirements, recordingMode: undefined });
    const result = await saveProject({ survey, requirements: adaptCameraRequirements(state.requirements, state.cameras, state.defaults).payload });
    assert.equal(result.id, "draft");
  } finally { globalThis.fetch = original; }
});

test("project failures produce clear errors and IDs are safely encoded", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.ok(url.endsWith("/projects/abc%2Fdef"));
      return new Response("", { status: 404 });
    };
    await assert.rejects(fetchProject("abc/def"), /ya no está disponible/);
    globalThis.fetch = async () => new Response("", { status: 422 });
    await assert.rejects(saveProject({ survey, requirements }), /pendientes pueden guardarse/);
    globalThis.fetch = async () => { throw new Error("network"); };
    await assert.rejects(listProjects(), /No se pudo conectar/);
  } finally { globalThis.fetch = original; }
});
