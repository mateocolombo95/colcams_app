// Optional integration test: Node 24, an existing Chromium binary, and running frontend/API.
// WIZARD_URL=http://localhost:3100 CCTV_API_URL=http://127.0.0.1:8100 node tests/cctv.browser.cjs
// CHROMIUM_PATH can override the installed binary. No browser dependency is required.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inflateRawSync } = require("node:zlib");

const wizardUrl = process.env.WIZARD_URL || "http://localhost:3100";
const apiUrl = (process.env.CCTV_API_URL || "http://127.0.0.1:8100").replace(/\/$/, "");
const chromePath = process.env.CHROMIUM_PATH || "C:\\Users\\Mateo\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe";
const debugPort = Number(process.env.CCTV_DEBUG_PORT || 9333);
let datastoreDescription = "almacenamiento del backend no inspeccionado";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function eventually(predicate, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; } catch (error) { lastError = error; }
    await delay(100);
  }
  assert.fail(`Timed out waiting for ${description}${lastError ? ": " + lastError.message : ""}.`);
}

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const task = this.pending.get(message.id);
        if (!task) return;
        this.pending.delete(message.id);
        clearTimeout(task.timeout);
        message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result);
      } else {
        for (const listener of this.listeners.get(message.method) || []) listener(message.params);
      }
    });
    socket.addEventListener("close", () => {
      for (const task of this.pending.values()) { clearTimeout(task.timeout); task.reject(new Error("Browser connection closed.")); }
      this.pending.clear();
    });
  }
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CDP(socket);
  }
  on(name, callback) {
    this.listeners.set(name, [...(this.listeners.get(name) || []), callback]);
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN) { reject(new Error(`CDP ${method}: socket is not open (${this.socket.readyState}).`)); return; }
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out (request ${id}, socket ${this.socket.readyState}).`)); }, 20000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

function zipTexts(bytes) {
  const texts = new Map();
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, "Excel must be a complete ZIP archive.");
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
      assert.ok(method === 0 || method === 8, "Unsupported XLSX compression.");
      texts.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return texts;
}

function worksheetXml(texts, name) {
  const workbook = texts.get("xl/workbook.xml");
  assert.ok(workbook);
  const sheet = [...workbook.matchAll(/<sheet\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`name="${name}"`));
  assert.ok(sheet, `${name} worksheet is present.`);
  const id = /r:id="([^"]+)"/.exec(sheet[1])?.[1];
  const relation = [...texts.get("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].find(match => match[1].includes(`Id="${id}"`));
  const target = /Target="([^"]+)"/.exec(relation?.[1] || "")?.[1];
  assert.ok(target);
  return texts.get(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
}

async function setField(page, selector, value) {
  await page.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) throw new Error('Field absent: ' + ${JSON.stringify(selector)});
    field.focus();
    const proto = field.tagName === 'SELECT' ? HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, ${JSON.stringify(String(value))});
    field.dispatchEvent(new Event('input', {bubbles: true}));
    field.dispatchEvent(new Event('change', {bubbles: true}));
  })()`);
  // React processes the edit before blur commits the current numeric draft.
  await delay(60);
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).blur()`);
  await delay(60);
}

async function value(page, selector) {
  return page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.value`);
}

async function click(page, text, scope = "document") {
  await page.evaluate(`(() => {
    const root = ${scope};
    const button = [...root.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') || button.textContent.trim()) === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Available button absent: ' + ${JSON.stringify(text)});
    button.click();
  })()`);
  await delay(80);
}

async function action(page, text, checked, dialog = false) {
  await page.evaluate(`(() => {
    const root = ${dialog ? "document.querySelector('dialog[open]')" : "document.querySelector('main > form')"};
    const label = [...root.querySelectorAll('label')].find(label => label.textContent.trim() === ${JSON.stringify(text)});
    if (!label) throw new Error('Action label absent: ' + ${JSON.stringify(text)});
    const checkbox = label.querySelector('input[type=checkbox]');
    if (checkbox.checked !== ${checked}) checkbox.click();
  })()`);
  await delay(60);
}

async function next(page) {
  const before = await page.evaluate("document.querySelector('.step-heading').textContent");
  await page.evaluate("document.querySelector('main > form button[type=submit]').click()");
  try {
    await eventually(async () => await page.evaluate("document.querySelector('.step-heading').textContent") !== before, "next wizard step");
  } catch (error) {
    const diagnostics = await page.evaluate(`JSON.stringify({url: location.href, step: document.querySelector('.step-heading')?.textContent,
      client: document.querySelector('#client')?.value, site: document.querySelector('#site')?.value,
      invalid: [...(document.querySelector('main > form')?.elements || [])].filter(field => field.checkValidity && !field.checkValidity()).map(field => ({id: field.id, value: field.value, message: field.validationMessage, pattern: field.pattern})),
      errors: [...document.querySelectorAll('[role=alert]')].map(element => element.textContent)})`);
    throw new Error(`${error.message}\nWizard diagnostics: ${diagnostics}`);
  }
}

async function checkPage(page, errors) {
  assert.deepEqual(errors, [], "No page exceptions or console errors.");
  assert.ok(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "No horizontal page overflow.");
}

async function editCamera(page, id, changes, actions = {}) {
  await click(page, `Editar ${id}`);
  await eventually(() => page.evaluate("Boolean(document.querySelector('dialog[open]'))"), `${id} editor`);
  for (const [field, val] of Object.entries(changes)) await setField(page, `#${field}`, val);
  for (const [label, checked] of Object.entries(actions)) await action(page, label, checked, true);
  await click(page, "Guardar cambios", "document.querySelector('dialog[open]')");
  await eventually(() => page.evaluate("!document.querySelector('dialog[open]')"), "saved camera editor closes");
}

async function openSaved(page, id) {
  await click(page, "Abrir proyecto guardado");
  await eventually(() => page.evaluate("Boolean(document.querySelector('#saved-project'))"), "project listing");
  await setField(page, "#saved-project", id);
  await click(page, "Abrir seleccionado");
  await eventually(() => page.evaluate("document.body.innerText.includes('Proyecto recuperado.') && !document.querySelector('#saved-project')"), "saved project recovery");
}

async function runCase(browser, width, downloads) {
  console.log(`[${width}px] Creating browser tab.`);
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  let target;
  await eventually(async () => {
    target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(tab => tab.id === targetId);
    return target?.webSocketDebuggerUrl;
  }, "browser tab");
  const page = await CDP.open(target.webSocketDebuggerUrl);
  console.log(`[${width}px] Page protocol connected.`);
  const errors = [];
  const relayErrors = [];
  const calls = [];
  page.on("Runtime.exceptionThrown", event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  page.on("Runtime.consoleAPICalled", event => { if (event.type === "error") errors.push(event.args.map(arg => arg.value || arg.description).join(" ")); });
  page.on("Fetch.requestPaused", event => {
    (async () => {
      const request = event.request;
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        await page.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 204, responseHeaders: [
          { name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Methods", value: "GET,POST,PUT,OPTIONS" }, { name: "Access-Control-Allow-Headers", value: "Content-Type" },
        ] });
        return;
      }
      const response = await fetch(apiUrl + url.pathname + url.search, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        ...(request.postData ? { body: request.postData } : {}),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(response.status, 200, `${url.pathname}: ${bytes.toString("utf8").slice(0, 1000)}`);
      calls.push({ method: request.method, path: url.pathname, payload: request.postData ? JSON.parse(request.postData) : undefined,
        result: response.headers.get("content-type")?.includes("json") ? JSON.parse(bytes.toString("utf8")) : undefined, bytes });
      await page.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: response.status,
        responseHeaders: [{ name: "Content-Type", value: response.headers.get("content-type") || "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: bytes.toString("base64") });
    })().catch(async error => {
      relayErrors.push(error.message);
      try { await page.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 500, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(JSON.stringify({ error: error.message })).toString("base64") }); } catch {}
    });
  });
  try {
    await page.send("Runtime.enable");
    await page.send("Page.enable");
    console.log(`[${width}px] Runtime and page enabled.`);
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/*", requestStage: "Request" }] });
    await page.send("Page.navigate", { url: wizardUrl });
    console.log(`[${width}px] Navigated to ${wizardUrl}.`);
    await eventually(() => page.evaluate("Boolean(document.querySelector('#client'))"), "client field");
    await eventually(() => page.evaluate("Object.keys(document.querySelector('#client')).some(key => key.startsWith('__reactFiber$'))"), "React hydration before edits");
    console.log(`[${width}px] React client hydration complete.`);
    await setField(page, "#client", `Cliente CCTV ${width}`);
    await setField(page, "#site", "Portón y depósito");
    await setField(page, "#notes", "Relevamiento CCTV con pendientes");
    await next(page);
    console.log(`[${width}px] Client/site recorded; configuring global camera requirements.`);
    await setField(page, "#outdoor_camera_count", 1);
    await setField(page, "#camera_count", 2);
    await setField(page, "#resolution", 4);
    await setField(page, "#global-viewing-range", "far");
    await setField(page, "#global-image-objective", "identify");
    await setField(page, "#global-target-distance", 28.5);
    await setField(page, "#global-night-objective", "yes");
    await setField(page, "#global-night-lighting", "none");
    await setField(page, "#global-night-color", "yes");
    await setField(page, "#global-detection-event", "motion");
    await setField(page, "#global-detection-target", "person");
    await action(page, "Aviso al celular", true);
    await click(page, "Personalizar cámaras");
    assert.equal(await page.evaluate("document.querySelectorAll('.camera-row').length"), 2);
    await editCamera(page, "C1", {
      "camera-name": "Entrada identificación", "camera-location": "Portón", "camera-resolution": 8,
      "camera-target-distance": "", "camera-distance": 42.5, "camera-night-lighting": "motion",
      "camera-detection-event": "line_crossing", "camera-detection-target": "person",
    }, { "Activación de una sirena externa": true });
    await editCamera(page, "C2", {
      "camera-name": "Depósito vista general", "camera-target-distance": "", "camera-image-objective": "overview",
      "camera-night-objective": "no", "camera-detection-event": "intrusion_zone", "camera-detection-target": "vehicle", "camera-distance": 12,
    });
    await setField(page, "#resolution", 2);
    await setField(page, "#global-target-distance", 8);
    await click(page, "Editar C1");
    assert.equal(await value(page, "#camera-resolution"), "8");
    assert.equal(await value(page, "#camera-target-distance"), "");
    assert.equal(await value(page, "#camera-distance"), "42.5");
    assert.equal(await value(page, "#camera-night-lighting"), "motion");
    await setField(page, "#camera-target-distance", 0);
    await click(page, "Guardar cambios", "document.querySelector('dialog[open]')");
    assert.ok(await page.evaluate("Boolean(document.querySelector('dialog[open]'))"), "An invalid zero target cannot be saved.");
    assert.equal(await page.evaluate("document.querySelector('#camera-target-distance').checkValidity()"), false);
    await setField(page, "#camera-target-distance", "");
    await click(page, "Guardar cambios", "document.querySelector('dialog[open]')");
    await eventually(() => page.evaluate("!document.querySelector('dialog[open]')"), "blank target allowed as pending");
    await checkPage(page, errors);
    console.log(`[${width}px] Customized cameras validated, including invalid zero and pending blank target.`);

    await click(page, "Guardar borrador");
    await eventually(() => page.evaluate("document.body.innerText.includes('Borrador guardado.')"), "pending draft POST");
    const created = calls.find(call => call.method === "POST" && call.path.endsWith("/projects"));
    assert.ok(created);
    assert.equal(created.payload.requirements.cameraDefaults.resolutionMp, 2);
    assert.equal(created.payload.requirements.resolution_mp, 8);
    assert.equal(created.payload.requirements.cameras[0].targetDistanceM, undefined);
    assert.equal(created.payload.requirements.cameras[0].nightObjectiveRequired, "yes");
    assert.deepEqual(created.payload.requirements.cameras[0].eventActions, ["mobile_notification", "external_siren"]);
    const id = created.result.id;
    console.log(`[${width}px] Pending draft POST saved (${id}).`);
    await openSaved(page, id);
    assert.equal(await value(page, "#client"), `Cliente CCTV ${width}`);
    assert.equal(await value(page, "#notes"), "Relevamiento CCTV con pendientes");
    await next(page);
    assert.equal(await value(page, "#resolution"), "2", "Recovery restores the global baseline, not the aggregate maximum.");
    assert.equal(await value(page, "#global-target-distance"), "8");
    await editCamera(page, "C1", {}, {});
    const recovered = calls.findLast(call => call.method === "GET" && call.path.endsWith("/" + id));
    assert.equal(recovered.result.requirements.cameras[0].resolutionMp, 8);
    assert.equal(recovered.result.requirements.cameras[0].distanceM, 42.5);
    assert.equal(recovered.result.requirements.cameras[1].imageObjective, "overview");
    assert.equal(recovered.result.requirements.cameras[1].nightObjectiveRequired, "no");
    assert.equal(recovered.result.requirements.cameras[1].detectionTarget, "vehicle");
    await next(page);
    console.log(`[${width}px] Project GET recovered global baseline and camera overrides.`);
    await setField(page, "#recording-mode", "events");
    await setField(page, "#retention_days", 14);
    assert.equal(await page.evaluate("Boolean(document.querySelector('#recording_hours_per_day'))"), false, "No recording schedule is requested.");
    for (let step = 2; step < 6; step++) await next(page);
    await eventually(() => page.evaluate("document.querySelectorAll('.camera-detail').length === 2"), "real estimate result");
    const eventEstimate = calls.findLast(call => call.path.endsWith("/quotes/estimate"));
    assert.equal(eventEstimate.payload.recordingMode, "events");
    assert.equal(eventEstimate.payload.retention_days, 14);
    assert.equal(eventEstimate.result.storage_hours_per_day, 24);
    assert.ok(eventEstimate.result.warnings.some(item => item.includes("grabación continua como referencia")));
    assert.ok(eventEstimate.result.technical_pending.some(item => item.includes("distancia de identificación")));
    assert.ok(eventEstimate.result.technical_pending.some(item => item.includes("sirena externa")));
    assert.ok(!eventEstimate.result.bom.some(item => /sirena/i.test(item.description)), "External siren creates no automatic BOM item.");
    assert.ok(await page.evaluate("document.body.innerText.includes('Pendientes técnicos / comerciales')"));
    await checkPage(page, errors);
    console.log(`[${width}px] Events estimate and pending result verified.`);
    const beforeDownloads = downloads.filter(event => event.state === "completed").length;
    await click(page, "Descargar Excel");
    await eventually(() => calls.some(call => call.path.endsWith("/materials.xlsx")), "actual Excel response");
    const exported = calls.findLast(call => call.path.endsWith("/materials.xlsx"));
    assert.equal(exported.bytes.subarray(0, 2).toString(), "PK");
    const texts = zipTexts(exported.bytes);
    const cameraSheet = worksheetXml(texts, "Cámaras");
    const allXml = cameraSheet + (texts.get("xl/sharedStrings.xml") || "");
    for (const heading of ["Objetivo de imagen", "Alcance visual", "Distancia al objetivo", "Objetivo nocturno", "Iluminación nocturna", "Color nocturno", "Evento", "Objetivo del evento", "Acciones", "Pendientes", "Recomendación preliminar de lente"]) assert.ok(allXml.includes(heading), `Excel column: ${heading}`);
    assert.ok(allXml.includes("Entrada identificación"));
    assert.ok(allXml.includes("sirena externa"));
    assert.equal(exported.payload.recordingMode, "events");
    assert.deepEqual(exported.payload.estimate, eventEstimate.result, "Excel reuses the backend result.");
    await eventually(() => downloads.filter(event => event.state === "completed").length > beforeDownloads, "browser Excel download");
    console.log(`[${width}px] Actual Excel response and browser download verified.`);
    await click(page, "Guardar borrador");
    await eventually(() => calls.some(call => call.method === "PUT" && call.path.endsWith("/" + id)), "project PUT");
    const updated = calls.findLast(call => call.method === "PUT");
    assert.equal(updated.payload.requirements.recordingMode, "events");
    assert.equal(updated.payload.requirements.retention_days, 14);
    await eventually(() => page.evaluate("document.body.innerText.includes('Borrador guardado.')"), "PUT UI success");
    await openSaved(page, id);
    await next(page);
    assert.equal(await value(page, "#resolution"), "2");
    await next(page);
    assert.equal(await value(page, "#recording-mode"), "events");
    assert.equal(await value(page, "#retention_days"), "14");
    await setField(page, "#recording-mode", "continuous");
    const estimateCount = calls.filter(call => call.path.endsWith("/quotes/estimate")).length;
    for (let step = 2; step < 6; step++) await next(page);
    await eventually(() => calls.filter(call => call.path.endsWith("/quotes/estimate")).length > estimateCount && page.evaluate("document.querySelectorAll('.camera-detail').length === 2"), "continuous recalculation");
    const continuous = calls.findLast(call => call.path.endsWith("/quotes/estimate"));
    assert.equal(continuous.payload.recordingMode, "continuous");
    assert.equal(continuous.result.storage_hours_per_day, 24);
    assert.equal(continuous.result.storage_tb_raw, eventEstimate.result.storage_tb_raw, "Events do not invent a storage reduction.");
    assert.deepEqual(continuous.payload.cameras[0].eventActions, ["mobile_notification", "external_siren"]);
    assert.equal(continuous.payload.cameras[0].detectionEvent, "line_crossing");
    assert.ok(!continuous.result.bom.some(item => /sirena/i.test(item.description)));
    await checkPage(page, errors);
    assert.deepEqual(relayErrors, [], "All API relays succeeded.");
    console.log(`[${width}px] PUT/recovery and continuous recalculation verified.`);

    if (process.env.CCTV_LEGACY_PROJECT_ID) {
      await openSaved(page, process.env.CCTV_LEGACY_PROJECT_ID);
      assert.equal(await value(page, "#siteType"), "", "Old project has no invented site type.");
      await next(page);
      assert.equal(await value(page, "#global-image-objective"), "undefined");
      assert.equal(await value(page, "#global-night-objective"), "undefined");
      assert.equal(await value(page, "#global-detection-event"), "undefined");
      await next(page);
      assert.equal(await value(page, "#recording-mode"), "undefined");
      await checkPage(page, errors);
    }
    console.log(`CCTV browser/API/project/Excel flow passed at ${width}px; datastore: ${datastoreDescription}.`);
  } finally {
    page.close();
    try { await browser.send("Target.closeTarget", { targetId }); }
    catch (error) { console.warn(`[${width}px] Tab cleanup: ${error.message}`); }
  }
}

(async () => {
  assert.ok(fs.existsSync(chromePath), `Chromium binary absent: ${chromePath}`);
  const existingDebugger = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(1000) }).catch(() => undefined);
  assert.ok(!existingDebugger, `Remote debugging port ${debugPort} is already in use; choose CCTV_DEBUG_PORT to avoid closing an unrelated browser.`);
  try {
    const response = await fetch(apiUrl + "/test-health");
    if (response.ok) datastoreDescription = (await response.json()).datastore || datastoreDescription;
  } catch {}
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cctv-browser-"));
  const downloadPath = path.join(temporaryRoot, "downloads");
  fs.mkdirSync(downloadPath);
  const chrome = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${temporaryRoot}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let browser;
  let chromeExited = false;
  let launchError;
  chrome.on("error", error => { launchError = error; });
  chrome.on("exit", () => { chromeExited = true; });
  try {
    let version;
    await eventually(async () => {
      if (launchError) throw launchError;
      version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
      return version.webSocketDebuggerUrl;
    }, "Chromium remote debugging");
    console.log(`Chromium debugger ready on port ${debugPort}; datastore: ${datastoreDescription}.`);
    browser = await CDP.open(version.webSocketDebuggerUrl);
    console.log("Browser protocol connected.");
    const downloads = [];
    browser.on("Browser.downloadProgress", event => downloads.push(event));
    await browser.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath, eventsEnabled: true });
    for (const width of [1280, 390]) await runCase(browser, width, downloads);
  } finally {
    if (browser) { try { await browser.send("Browser.close"); } catch {} browser.close(); }
    if (!chromeExited) chrome.kill();
    await delay(300);
    // This path is created above; verify its resolved boundary before recursive cleanup.
    const resolved = path.resolve(temporaryRoot);
    const tempBoundary = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(tempBoundary) && path.basename(resolved).startsWith("cctv-browser-"));
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (error) { console.warn("Browser temporary profile cleanup failed:", error.message); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
