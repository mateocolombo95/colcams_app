// Optional integration check using an existing Playwright installation and real API:
// PLAYWRIGHT_MODULE=<module path> WIZARD_URL=http://localhost:3100 ALARM_API_URL=http://127.0.0.1:8100 node tests/alarm.browser.cjs
const assert = require("node:assert/strict");
const { inflateRawSync } = require("node:zlib");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const apiUrl = (process.env.ALARM_API_URL || "http://127.0.0.1:8100").replace(/\/$/, "");
const wizardUrl = process.env.WIZARD_URL || "http://localhost:3100";
const endpointPattern = /\/api\/v1\/(?:quotes\/estimate|quotes\/alarm\/estimate|exports\/materials\.xlsx)$/;

// Inspect the actual XLSX response without requiring another npm dependency.
function zipTexts(bytes) {
  const texts = new Map();
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, "The downloaded Excel must be a complete ZIP archive.");
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  for (let entry = 0; entry < count; entry++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    const method = bytes.readUInt16LE(cursor + 10);
    const size = bytes.readUInt32LE(cursor + 20);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const dataOffset = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(dataOffset, dataOffset + size);
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      assert.ok(method === 0 || method === 8, "Unexpected XLSX compression method.");
      texts.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return texts;
}

function worksheetXml(texts, sheetName) {
  const workbook = texts.get("xl/workbook.xml");
  assert.ok(workbook, "Excel workbook is present.");
  const sheet = [...workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`name="${sheetName}"`));
  if (!sheet) return undefined;
  const relationship = /r:id="([^"]+)"/.exec(sheet[1])?.[1];
  assert.ok(relationship, `Relationship for ${sheetName} is present.`);
  const relations = texts.get("xl/_rels/workbook.xml.rels");
  assert.ok(relations, "Excel worksheet relationships are present.");
  const relation = [...relations.matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`Id="${relationship}"`));
  const target = /Target="([^"]+)"/.exec(relation?.[1] || "")?.[1];
  assert.ok(target, `Worksheet target for ${sheetName} is present.`);
  return texts.get(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
}

async function eventually(predicate, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`Timed out waiting for ${description}.`);
}

async function fillNumber(page, id, value) {
  const field = page.locator(`#${id}`);
  await field.fill(String(value));
  await field.blur();
}

async function next(page) {
  await page.locator('button[type="submit"]').click();
}

async function checkPage(page, errors) {
  assert.deepEqual(errors, [], "No browser errors should occur.");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "The page must fit the viewport.");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      const quoteRequests = [];
      const alarmResponses = [];
      const exportResponses = [];
      let latestQuote;
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route(endpointPattern, async route => {
        assert.equal(route.request().method(), "POST");
        const path = new URL(route.request().url()).pathname;
        const payload = route.request().postDataJSON();
        // Forward browser requests to the actual engine. Routing only bypasses local CORS.
        const response = await fetch(apiUrl + path, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: route.request().postData(),
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(response.status, 200, `${path} failed: ${bytes.toString("utf8").slice(0, 1000)}`);
        if (path.endsWith("materials.xlsx")) {
          assert.equal(bytes.subarray(0, 2).toString(), "PK");
          exportResponses.push({ payload, bytes });
        } else {
          const result = JSON.parse(bytes.toString("utf8"));
          if (path.endsWith("/alarm/estimate")) { if (result) alarmResponses.push(result); }
          else { quoteRequests.push(payload); latestQuote = result; }
        }
        await route.fulfill({ status: response.status, headers: { "content-type": response.headers.get("content-type") }, body: bytes });
      });

      await page.goto(wizardUrl);
      await page.locator("#client").fill("Cliente alarma");
      await page.locator("#site").fill("Casa y depósito");
      await next(page);
      assert.equal(await page.locator("#alarm-activation").inputValue(), "none");
      assert.equal(await page.locator("#alarm-count-pir_indoor").count(), 0);
      for (let step = 1; step < 6; step++) await next(page);
      await page.getByRole("heading", { name: "Detalle de cámaras", exact: true }).waitFor();
      assert.equal(await page.locator(".camera-detail").count(), 8);
      assert.ok(!("alarm" in quoteRequests.at(-1)), "Disabled Alarm must leave the existing quote payload unchanged.");
      assert.ok(!latestQuote.bom.some(item => item.category.startsWith("alarm_")), "Disabled Alarm adds no materials.");
      await checkPage(page, errors);

      await page.getByRole("button", { name: "Volver y editar", exact: true }).click();
      for (let step = 5; step > 1; step--) await page.getByRole("button", { name: "Anterior", exact: true }).click();
      await page.locator("#alarm-activation").selectOption("automatic");
      await fillNumber(page, "alarm-count-pir_indoor", 4);
      await fillNumber(page, "alarm-count-magnetic_contact", 5);
      await fillNumber(page, "alarm-count-panic_button", 1);
      await page.getByText("Configuración avanzada", { exact: true }).click();
      await fillNumber(page, "alarm-reserve", 20);
      await eventually(() => alarmResponses.some(result => result.zonesRequired === 10 && result.zonesWithReserve === 12 && result.recommendedPanelZones === 16 && result.selectedPanelZones === 16), "automatic panel recommendation from real API");
      await page.locator("#alarm-panel-mode").selectOption("manual");
      await fillNumber(page, "alarm-panel-zones", 8);
      await eventually(() => alarmResponses.some(result => result.zonesRequired === 10 && result.zonesWithReserve === 12 && result.selectedPanelZones === 8 && result.panelOverridden && result.expanderCount === 1), "manual panel and expander from real API");
      await page.getByText("La capacidad seleccionada es inferior a las zonas requeridas.", { exact: true }).first().waitFor();

      await page.getByText("Personalizar dispositivos", { exact: true }).click();
      await page.getByRole("button", { name: "Separar una unidad", exact: true }).first().click();
      await page.locator(".alarm-device-row").filter({ hasText: "PIR interior 4" }).getByRole("button", { name: "Editar", exact: true }).click();
      await page.locator("#alarm-device-name").fill("PIR acceso inalámbrico");
      await page.locator("#alarm-device-location").fill("Hall");
      await page.locator("#alarm-device-connection").selectOption("wireless");
      await page.locator("#alarm-device-notes").fill("Caso personalizado");
      await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
      await fillNumber(page, "alarm-count-pir_indoor", 5);
      await page.locator(".alarm-device-row").filter({ hasText: "PIR acceso inalámbrico" }).getByRole("button", { name: "Editar", exact: true }).click();
      assert.equal(await page.locator("#alarm-device-name").inputValue(), "PIR acceso inalámbrico");
      assert.equal(await page.locator("#alarm-device-location").inputValue(), "Hall");
      assert.equal(await page.locator("#alarm-device-connection").inputValue(), "wireless");
      assert.equal(await page.locator("#alarm-device-notes").inputValue(), "Caso personalizado");
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByText("Detectores técnicos auxiliares: humo, gas e inundación", { exact: true }).click();
      await fillNumber(page, "alarm-count-smoke", 1);
      await fillNumber(page, "alarm-partitions", 2);
      // Checkbox labels are supplied by the Spanish configuration UI.
      await page.getByLabel("Ethernet / IP", { exact: true }).check();
      await page.getByLabel("LTE / 4G", { exact: true }).check();
      await eventually(() => alarmResponses.some(result => result.zonesRequired === 12 && result.zonesWithReserve === 15 && result.wirelessDeviceCount === 1 && result.wiredDeviceCount === 11), "wireless exclusion and personalized counts from real API");
      await checkPage(page, errors);

      for (let step = 1; step < 6; step++) await next(page);
      await page.getByRole("heading", { name: "Alarma / Intrusión", exact: true }).waitFor();
      const alarm = latestQuote.alarm;
      assert.ok(alarm, "Quote response includes the backend Alarm architecture.");
      assert.equal(alarm.zonesRequired, 12);
      assert.equal(alarm.zonesWithReserve, 15);
      assert.equal(alarm.recommendedPanelZones, 16);
      assert.equal(alarm.selectedPanelZones, 8);
      assert.equal(alarm.expanderCount, 1);
      assert.equal(alarm.wirelessDeviceCount, 1);
      assert.equal(alarm.wiredDeviceCount, 11);
      assert.ok(alarm.warnings.some(warning => /particiones/i.test(warning)));
      assert.ok(alarm.warnings.some(warning => /certificado/i.test(warning)));
      assert.ok(alarm.warnings.some(warning => /baterías/i.test(warning)));
      const configured = quoteRequests.at(-1).alarm;
      assert.equal(configured.enabled, true);
      assert.equal(configured.devices.find(device => device.name === "PIR acceso inalámbrico").connection, "wireless");
      assert.equal(configured.partitions, 2);
      assert.equal(alarm.estimatedCableM, Number((11 * configured.averageCableMPerWiredDevice * 1.15).toFixed(1)), "Only the eleven wired devices contribute alarm cable.");
      assert.ok(alarm.batteryWhRequired > 0 && alarm.batteryAhApprox > 0);
      assert.ok(latestQuote.bom.some(item => item.category === "alarm_panel"));
      assert.ok(latestQuote.bom.some(item => item.category === "alarm_expander" && item.quantity === 1));
      assert.ok(latestQuote.bom.some(item => item.category === "alarm_communication" && /LTE/.test(item.description)));
      assert.ok(latestQuote.bom.some(item => item.category === "alarm_communication" && /IP/.test(item.description)));
      assert.ok(latestQuote.bom.some(item => item.category === "alarm_cable" && item.quantity === Math.ceil(alarm.estimatedCableM)));
      await page.getByText(/Los detectores técnicos integrados al sistema de intrusión no deben considerarse automáticamente equivalentes/).first().waitFor();
      await checkPage(page, errors);

      let downloadPending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
      let download = await downloadPending;
      assert.equal(await download.failure(), null);
      assert.ok(download.suggestedFilename().startsWith("colcams_Cliente_alarma_Casa_y_deposito_"));
      const exported = exportResponses.at(-1);
      const texts = zipTexts(exported.bytes);
      const alarmSheet = worksheetXml(texts, "Alarma");
      const materialsSheet = worksheetXml(texts, "Materiales");
      const summarySheet = worksheetXml(texts, "Resumen");
      assert.ok(alarmSheet, "The real Excel includes an Alarm worksheet.");
      assert.match(alarmSheet, /PIR acceso/);
      assert.match(alarmSheet, /Hall/);
      assert.match(materialsSheet, /Panel de alarma/);
      assert.match(materialsSheet, /Cable de alarma/);
      assert.match(summarySheet, /alarma/i);
      assert.deepEqual(exported.payload.estimate.alarm, latestQuote.alarm, "Export reuses the current backend result snapshot.");

      await page.getByRole("button", { name: "Volver y editar", exact: true }).click();
      for (let step = 5; step > 1; step--) await page.getByRole("button", { name: "Anterior", exact: true }).click();
      await page.locator("#alarm-activation").selectOption("none");
      assert.equal(await page.locator("#alarm-count-pir_indoor").count(), 0);
      for (let step = 1; step < 6; step++) await next(page);
      await page.getByRole("heading", { name: "Detalle de cámaras", exact: true }).waitFor();
      assert.ok(!("alarm" in quoteRequests.at(-1)), "Disabling a configured Alarm removes it from the quote payload.");
      assert.ok(!latestQuote.alarm, "Disabled Alarm has no active architecture result.");
      assert.ok(!latestQuote.bom.some(item => item.category.startsWith("alarm_")), "Disabling Alarm removes all its BOM rows.");
      assert.equal(await page.getByRole("heading", { name: "Alarma / Intrusión", exact: true }).count(), 0);
      downloadPending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
      download = await downloadPending;
      assert.equal(await download.failure(), null);
      const disabledTexts = zipTexts(exportResponses.at(-1).bytes);
      assert.equal(worksheetXml(disabledTexts, "Alarma"), undefined, "Disabled Alarm adds no Excel worksheet.");
      assert.doesNotMatch(worksheetXml(disabledTexts, "Materiales"), /Panel de alarma/);
      await checkPage(page, errors);
      console.log(`Alarm configuration, real API/BOM and Excel passed at ${viewport.width}px.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
