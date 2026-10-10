import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = stripTypeScriptTypes(readFileSync(new URL("../lib/exports.ts", import.meta.url), "utf8"))
  .replace('"./cameras"', JSON.stringify(new URL("../lib/cameras.ts", import.meta.url).href));
const { createExportSnapshot, exportFilename, fetchMaterialsExcel } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("snapshot reuses BOM and existing recommendation, separating target and cable distance", () => {
  const estimate = { bom: [{ category: "cable", description: "Cable", quantity: 230 }] };
  const project = { estimate, survey: { client: "José / Cliente", site: "Portón: principal" }, requirements: { retention_days: 30, recording_hours_per_day: 24 }, cameras: [{ id: "C1", viewingRange: "far", distanceM: 32, targetDistanceM: 28 }] };
  const snapshot = createExportSnapshot(project, new Date(2026, 9, 6));
  assert.equal(snapshot.estimate, estimate);
  assert.equal(snapshot.cameras[0].distanceM, 32);
  assert.equal(snapshot.cameras[0].targetDistanceM, 28);
  assert.ok(snapshot.cameras[0].lensRecommendation.includes("6–12 mm"));
  assert.ok(snapshot.cameras[0].lensRecommendation.includes("larga distancia"));
  assert.equal(snapshot.project, undefined);
  assert.equal(exportFilename(snapshot), "colcams_Jose_Cliente_Porton_principal_2026-10-06.xlsx");
});

test("download errors are comprehensible; successful XLSX returns a blob", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [422, 500]) {
      globalThis.fetch = async () => new Response("error", { status });
      await assert.rejects(fetchMaterialsExcel({}), /No se pudo generar/);
    }
    globalThis.fetch = async () => { throw new Error("network"); };
    await assert.rejects(fetchMaterialsExcel({}), /No se pudo conectar/);
    globalThis.fetch = async () => new Response("<html>error</html>");
    await assert.rejects(fetchMaterialsExcel({}), /Excel válida/);
    globalThis.fetch = async () => new Response("xlsx", { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    assert.equal((await fetchMaterialsExcel({})).size, 4);
  } finally { globalThis.fetch = original; }
});

test("export snapshot preserves the backend alarm result and unified BOM without calculating again", () => {
  const alarm = { zonesRequired: 10, selectedPanelZones: 16, configuration: { enabled: true } };
  const bom = [{ category: "alarm", description: "Panel de alarma 16 zonas", quantity: 1, unit: "un" }, { category: "alarm_cable", description: "Cable de alarma", quantity: 230, unit: "m" }];
  const estimate = { alarm, bom };
  const snapshot = createExportSnapshot({ estimate, survey: {}, requirements: {}, cameras: [] });
  assert.equal(snapshot.estimate.alarm, alarm);
  assert.equal(snapshot.estimate.bom, bom);
  assert.equal(snapshot.estimate.bom[1].unit, "m");
});

test("export includes normalized image, night, event, action and pending fields", () => {
  const camera = { id: "C4", name: "Portón", viewingRange: "far", imageObjective: "identify", targetDistanceM: 28, distanceM: 32, nightObjectiveRequired: "yes", nightLighting: "unknown", nightColorRequired: "no", detectionEvent: "line_crossing", detectionTarget: "vehicle", eventActions: ["mobile_notification", "external_siren"] };
  const snapshot = createExportSnapshot({ estimate: { bom: [], storage_hours_per_day: 24 }, survey: {}, requirements: { recordingMode: "events", recording_hours_per_day: 3 }, cameras: [camera] });
  const exported = snapshot.cameras[0];
  for (const key of ["imageObjective", "viewingRange", "targetDistanceM", "distanceM", "nightObjectiveRequired", "nightLighting", "nightColorRequired", "detectionEvent", "detectionTarget", "eventActions"]) assert.deepEqual(exported[key], camera[key]);
  assert.ok(exported.technicalPending.some(item => item.includes("iluminación nocturna")));
  assert.ok(exported.technicalPending.some(item => item.includes("sirena externa")));
  assert.ok(snapshot.technical_pending.some(item => item.startsWith("Cámara C4:")));
  assert.equal(snapshot.recordingMode, "events");
  assert.equal(snapshot.storage_hours_per_day, 24);
});

test("legacy export marks missing answers pending without inferring responses", () => {
  const snapshot = createExportSnapshot({ estimate: { bom: [] }, survey: {}, requirements: { recording_hours_per_day: 8 }, cameras: [{ id: "C1", viewingRange: "near", distanceM: 25 }] });
  assert.equal(snapshot.recordingMode, "undefined");
  assert.equal(snapshot.storage_hours_per_day, 8);
  for (const key of ["imageObjective", "nightObjectiveRequired", "nightColorRequired", "detectionEvent", "detectionTarget"]) assert.equal(snapshot.cameras[0][key], "undefined");
  assert.equal(snapshot.cameras[0].nightLighting, "unknown");
  assert.deepEqual(snapshot.cameras[0].eventActions, []);
  assert.ok(snapshot.technical_pending.includes("Definir modalidad de grabación."));
});

test("continuous and events snapshots use 24h conservatively when older estimate omitted the assumption", () => {
  for (const recordingMode of ["continuous", "events"]) {
    const estimate = { bom: [] };
    const snapshot = createExportSnapshot({ estimate, survey: {}, requirements: { recordingMode, recording_hours_per_day: 4 }, cameras: [] });
    assert.equal(snapshot.storage_hours_per_day, 24);
    assert.equal(snapshot.estimate, estimate);
  }
});
