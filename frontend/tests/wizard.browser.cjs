// Optional browser check using an existing Playwright installation:
// PLAYWRIGHT_MODULE=<module path> WIZARD_URL=http://localhost:3100 node tests/wizard.browser.cjs
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let payload;
      await page.route("**/api/v1/quotes/estimate", async route => {
        assert.equal(route.request().method(), "POST");
        payload = route.request().postDataJSON();
        await route.fulfill({ json: {
          nvr_channels: 8, storage_tb_raw: 2, storage_tb_selected: 4,
          poe_ports_required: 8, poe_switch_ports_selected: 8, estimated_cable_m: 200,
          bom: [], equipment_cost: 0, labor_cost: 0, total_cost: 0,
          margin_percent: 35, sale_price: 0, warnings: [],
        } });
      });
      await page.goto(process.env.WIZARD_URL || "http://localhost:3100");
      await page.locator("#client").fill("Cliente de prueba");
      await page.locator("#site").fill("Sitio de prueba");
      const next = () => page.locator('button[type="submit"]').click();
      await next();
      await page.locator("#global-image-objective").selectOption("identify");
      await page.locator("#global-viewing-range").selectOption("far");
      await page.locator("#global-target-distance").fill("28");
      await page.locator("#global-target-distance").blur();
      await page.getByRole("button", { name: "Personalizar cámaras" }).click();
      await page.getByRole("button", { name: "Editar C1", exact: true }).click();
      await page.locator("#camera-viewing-range").selectOption("mixed");
      await page.locator("#camera-target-distance").fill("42");
      await page.getByRole("button", { name: "Guardar cambios" }).click();
      await page.locator("#global-viewing-range").selectOption("medium");
      await page.locator("#global-target-distance").fill("8");
      await page.locator("#global-target-distance").blur();
      await page.getByRole("button", { name: "Editar C1", exact: true }).click();
      assert.equal(await page.locator("#camera-viewing-range").inputValue(), "mixed");
      assert.equal(await page.locator("#camera-target-distance").inputValue(), "42");
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      for (let step = 1; step < 6; step++) await next();
      await page.getByRole("heading", { name: "Detalle de cámaras", exact: true }).waitFor();
      assert.equal(await page.locator(".camera-detail").count(), 8);
      const first = await page.locator(".camera-detail").first().innerText();
      assert.ok(first.includes("Cercano y lejano") && first.includes("42 m") && first.includes("segunda cámara"));
      const second = await page.locator(".camera-detail").nth(1).innerText();
      assert.ok(second.includes("Distancia media") && second.includes("8 m") && second.includes("4–6 mm"));
      assert.equal(payload.average_cable_m_per_camera, 25);
      assert.equal(payload.cameras[0].targetDistanceM, 42);
      assert.equal(payload.cameras[0].imageObjective, "identify");
      assert.equal(payload.cameraDefaults.targetDistanceM, 8);
      assert.equal(payload.recordingMode, "undefined");
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      // Optional integration against a real local export API.
      if (process.env.EXPORT_API_URL) {
        let failExport = true;
        await page.route("**/api/v1/exports/materials.xlsx", async route => {
          if (failExport) return route.fulfill({ status: 500, body: "error" });
          const response = await fetch(process.env.EXPORT_API_URL + "/api/v1/exports/materials.xlsx", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: route.request().postData(),
          });
          assert.equal(response.status, 200);
          const bytes = Buffer.from(await response.arrayBuffer());
          assert.equal(bytes.subarray(0, 2).toString(), "PK");
          await route.fulfill({ status: response.status, headers: { "content-type": response.headers.get("content-type") }, body: bytes });
        });
        await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "No se pudo generar la planilla" }).waitFor();
        failExport = false;
        const downloaded = page.waitForEvent("download");
        await page.getByRole("button", { name: "Descargar Excel", exact: true }).click();
        const download = await downloaded;
        assert.ok(download.suggestedFilename().startsWith("colcams_Cliente_de_prueba_Sitio_de_prueba_"));
        assert.equal(await download.failure(), null);
        await page.getByRole("button", { name: "Enviar por email", exact: true }).click();
        await page.locator("#export-email").fill("instalador@example.com");
        await page.getByRole("button", { name: "Enviar", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "El envío por email todavía no está configurado" }).waitFor();
        await page.getByRole("button", { name: "Cancelar", exact: true }).click();
        assert.equal(await page.locator(".camera-detail").count(), 8);
        assert.deepEqual(errors, []);
        console.log(`Real Excel download and retry/email UI passed at ${viewport.width}px.`);
      }
      console.log(`Wizard passed at ${viewport.width}px; API simulated.`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
