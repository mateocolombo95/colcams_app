import assert from "node:assert/strict";
import test from "node:test";
import { alarmDeviceCountLimit, alarmDeviceCounts, createAlarmConfiguration, customizedAlarmDeviceCount, resetAlarmDevice, saveAlarmDevice, setAlarmDeviceCount, splitAlarmDevice } from "../lib/alarm.ts";

test("alarm starts disabled and configuration instances have independent collections", () => {
  const first = createAlarmConfiguration();
  const second = createAlarmConfiguration();
  assert.equal(first.enabled, false);
  assert.equal(first.mode, "automatic");
  assert.deepEqual(first.devices, []);
  first.objectives.push("perimeter");
  first.communications.push("lte");
  assert.deepEqual(second.objectives, ["interior_intrusion"]);
  assert.deepEqual(second.communications, []);
});

test("quick counts group quantities by explicit device type without modifying other types", () => {
  let configuration = setAlarmDeviceCount(createAlarmConfiguration(), "pir_indoor", 4);
  configuration = setAlarmDeviceCount(configuration, "magnetic_contact", 5);
  configuration = setAlarmDeviceCount(configuration, "smoke", 2);
  configuration = setAlarmDeviceCount(configuration, "gas", 1);
  const counts = alarmDeviceCounts(configuration.devices);
  assert.equal(configuration.devices.length, 4);
  assert.equal(counts.pir_indoor, 4);
  assert.equal(counts.magnetic_contact, 5);
  assert.equal(counts.smoke, 2);
  assert.equal(counts.gas, 1);
  assert.equal(counts.flood, 0);
  assert.ok(configuration.devices.every((device) => device.connection === "auto" && device.requiresSeparateZone));
});

test("split separates one unit with a unique identifier and does not mutate source", () => {
  const source = setAlarmDeviceCount(setAlarmDeviceCount(createAlarmConfiguration(), "pir_indoor", 4), "magnetic_contact", 2);
  const target = source.devices[0];
  const split = splitAlarmDevice(source, target.id);
  assert.equal(source.devices.length, 2);
  assert.equal(split.devices.length, 3);
  assert.equal(split.mode, "custom");
  assert.equal(new Set(split.devices.map((device) => device.id)).size, 3);
  assert.equal(alarmDeviceCounts(split.devices).pir_indoor, 4);
  assert.equal(split.devices.find((device) => device.id === target.id).quantity, 3);
  assert.equal(split.devices.filter((device) => device.type === "pir_indoor").length, 2);
  assert.equal(split.devices.at(-1).quantity, 1);
});

test("quick resize preserves customized values and new units inherit global connection/cable", () => {
  let configuration = setAlarmDeviceCount(createAlarmConfiguration(), "pir_indoor", 4);
  configuration = splitAlarmDevice(configuration, configuration.devices[0].id);
  const target = configuration.devices.at(-1);
  configuration = saveAlarmDevice(configuration, { ...target, name: " Entrada ", location: " Portón ", connection: "wireless", cableDistanceM: 45, notes: " Confirmar alcance ", requiresSeparateZone: false, zoneGroup: " Accesos " });
  const customized = configuration.devices.find((device) => device.id === target.id);
  assert.equal(customized.name, "Entrada");
  assert.equal(customized.location, "Portón");
  assert.equal(customized.zoneGroup, "Accesos");
  configuration = { ...configuration, systemType: "wired", averageCableMPerWiredDevice: 30 };
  configuration = setAlarmDeviceCount(configuration, "pir_indoor", 6);
  assert.deepEqual(configuration.devices.find((device) => device.id === target.id), customized);
  assert.equal(alarmDeviceCounts(configuration.devices).pir_indoor, 6);
  const inherited = configuration.devices.find((device) => !device.customized);
  assert.equal(inherited.quantity, 5);
  assert.equal(inherited.connection, "auto");
  assert.equal(inherited.cableDistanceM, undefined);
  configuration = setAlarmDeviceCount(configuration, "pir_indoor", 1);
  assert.deepEqual(configuration.devices, [customized]);
  assert.equal(customizedAlarmDeviceCount(configuration.devices, "pir_indoor"), 1);
  assert.throws(() => setAlarmDeviceCount(configuration, "pir_indoor", 0), /personalizados/);
});

test("reset restores inheritance and clears per-device sharing and metadata", () => {
  let configuration = setAlarmDeviceCount(createAlarmConfiguration(), "panic_button", 2);
  const id = configuration.devices[0].id;
  configuration = saveAlarmDevice(configuration, { ...configuration.devices[0], name: "Caja", location: "Oficina", connection: "wired", cableDistanceM: 12, requiresSeparateZone: false, zoneGroup: "Planta", notes: "Nota" });
  configuration = resetAlarmDevice(configuration, id);
  assert.deepEqual(configuration.devices[0], { id, name: "Pulsador de pánico", type: "panic_button", quantity: 2, connection: "auto", requiresSeparateZone: true, customized: false });
  configuration = setAlarmDeviceCount(configuration, "panic_button", 0);
  assert.deepEqual(configuration.devices, []);
});

test("save updates device type and separate zones clear any old shared group", () => {
  let configuration = setAlarmDeviceCount(createAlarmConfiguration(), "pir_indoor", 1);
  configuration = saveAlarmDevice(configuration, { ...configuration.devices[0], type: "gas", zoneGroup: "Old group", requiresSeparateZone: true });
  assert.equal(alarmDeviceCounts(configuration.devices).gas, 1);
  assert.equal(alarmDeviceCounts(configuration.devices).pir_indoor, 0);
  assert.equal(configuration.devices[0].zoneGroup, undefined);
});

test("quick counts reject invalid values and splitting respects the API row limit", () => {
  const configuration = createAlarmConfiguration();
  for (const count of [-1, 1.5, NaN, Infinity, 10001]) assert.throws(() => setAlarmDeviceCount(configuration, "pir_indoor", count));
  const grouped = setAlarmDeviceCount(configuration, "magnetic_contact", 1000);
  assert.equal(splitAlarmDevice(grouped, grouped.devices[0].id).devices.length, 2);
  const atLimit = { ...grouped, devices: Array.from({ length: 500 }, (_, index) => ({ ...grouped.devices[0], id: "A" + index, quantity: 2 })) };
  assert.throws(() => splitAlarmDevice(atLimit, atLimit.devices[0].id), /500 filas/);
  assert.equal(splitAlarmDevice(grouped, "missing"), grouped);
});

test("large quick totals are chunked within API row limits and preserve customized units", () => {
  let configuration = setAlarmDeviceCount(createAlarmConfiguration(), "pir_indoor", 2500);
  assert.deepEqual(configuration.devices.map((device) => device.quantity), [1000, 1000, 500]);
  configuration = saveAlarmDevice(configuration, { ...configuration.devices[0], name: "Sector especial", connection: "wireless" });
  const customized = configuration.devices[0];
  configuration = setAlarmDeviceCount(configuration, "pir_indoor", 3500);
  assert.equal(alarmDeviceCounts(configuration.devices).pir_indoor, 3500);
  assert.deepEqual(configuration.devices.find((device) => device.id === customized.id), customized);
  assert.ok(configuration.devices.every((device) => device.quantity <= 1000));
  assert.equal(new Set(configuration.devices.map((device) => device.id)).size, configuration.devices.length);
  configuration = setAlarmDeviceCount(configuration, "magnetic_contact", 6500);
  assert.equal(alarmDeviceCountLimit(configuration, "pir_indoor"), 3500);
  assert.throws(() => setAlarmDeviceCount(configuration, "pir_indoor", 3501));
});
