import type { AlarmCommunication, AlarmConfiguration, AlarmDeviceRequirement, AlarmDeviceType, AlarmEstimate, AlarmObjective, AlarmSystemType } from "../types/alarm";

export const alarmSystemLabels: Record<AlarmSystemType, string> = { auto: "Automático / recomendar", wired: "Cableado", wireless: "Inalámbrico", hybrid: "Híbrido" };
export const alarmDeviceLabels: Record<AlarmDeviceType, string> = {
  pir_indoor: "PIR interior", pir_outdoor: "PIR exterior", magnetic_contact: "Contacto magnético", beam: "Barrera infrarroja", glass_break: "Detector de rotura de vidrio", smoke: "Detector de humo", gas: "Detector de gas", flood: "Detector de inundación", panic_button: "Pulsador de pánico", other: "Otro dispositivo",
};
export const alarmObjectiveLabels: Record<AlarmObjective, string> = { interior_intrusion: "Intrusión interior", perimeter: "Intrusión perimetral", access_protection: "Protección de accesos", technical_detection: "Detección técnica" };
export const alarmCommunicationLabels: Record<AlarmCommunication, string> = { ethernet: "Ethernet / IP", wifi: "Wi-Fi", lte: "LTE / 4G", telephone: "Línea telefónica" };
export const alarmConnectionLabels = { auto: "Heredar tipo de sistema", wired: "Cableado", wireless: "Inalámbrico" } as const;
export const ALARM_TECHNICAL_DISCLAIMER = "Los detectores técnicos integrados al sistema de intrusión no deben considerarse automáticamente equivalentes a un sistema certificado de detección de incendio o gas.";

export function createAlarmConfiguration(): AlarmConfiguration {
  return { enabled: false, mode: "automatic", systemType: "auto", objectives: ["interior_intrusion"], devices: [], expansionReservePercent: 20, panelMode: "automatic", keypadCount: 1, keypadType: "lcd", indoorSirens: 1, outdoorSirens: 0, outdoorSirenWithStrobe: false, communications: [], partitions: 1, remoteAppRequired: false, pushNotificationsRequired: false, professionalMonitoringRequired: false, localOnly: false, backupAutonomyHours: 4, auxiliaryPowerMode: "automatic", tamperRequired: true, averageCableMPerWiredDevice: 20 };
}

function nextDeviceId(devices: AlarmDeviceRequirement[]): string {
  const ids = new Set(devices.map((device) => device.id));
  let index = 1;
  while (ids.has("A" + index)) index++;
  return "A" + index;
}

function defaultDevice(id: string, type: AlarmDeviceType, quantity: number): AlarmDeviceRequirement {
  return { id, name: alarmDeviceLabels[type], type, quantity, connection: "auto", requiresSeparateZone: true, customized: false };
}

export function alarmDeviceCounts(devices: AlarmDeviceRequirement[]): Record<AlarmDeviceType, number> {
  const counts = Object.fromEntries(Object.keys(alarmDeviceLabels).map((type) => [type, 0])) as Record<AlarmDeviceType, number>;
  for (const device of devices) counts[device.type] += device.quantity;
  return counts;
}

export function customizedAlarmDeviceCount(devices: AlarmDeviceRequirement[], type: AlarmDeviceType): number {
  return devices.reduce((total, device) => total + (device.type === type && device.customized ? device.quantity : 0), 0);
}

export function alarmDeviceCountLimit(configuration: AlarmConfiguration, type: AlarmDeviceType): number {
  const customizedCount = customizedAlarmDeviceCount(configuration.devices, type);
  const otherQuantity = configuration.devices.reduce((total, device) => total + (device.type !== type ? device.quantity : 0), 0);
  const retainedRows = configuration.devices.filter((device) => device.type !== type || device.customized).length;
  return Math.min(10000 - otherQuantity, customizedCount + (500 - retainedRows) * 1000);
}

// Quick counts edit inherited rows only. Removing a customized device is an explicit action.
export function setAlarmDeviceCount(configuration: AlarmConfiguration, type: AlarmDeviceType, count: number): AlarmConfiguration {
  if (!Number.isInteger(count) || count < 0 || count > alarmDeviceCountLimit(configuration, type)) throw new Error("Ingresá una cantidad entera dentro de la capacidad del relevamiento (hasta 10000 dispositivos y 500 filas).");
  const customizedCount = customizedAlarmDeviceCount(configuration.devices, type);
  if (count < customizedCount) throw new Error("La cantidad no puede ser menor que los dispositivos personalizados. Editá o eliminá esos dispositivos primero.");
  let remaining = count - customizedCount;
  const inherited = configuration.devices.filter((device) => device.type === type && !device.customized);
  const devices = configuration.devices.filter((device) => device.type !== type || device.customized);
  let index = 0;
  while (remaining > 0) {
    const quantity = Math.min(1000, remaining);
    // Prefer previous IDs; new IDs cannot reuse a row still waiting to be inherited.
    const id = inherited[index]?.id ?? nextDeviceId([...configuration.devices, ...devices]);
    devices.push(defaultDevice(id, type, quantity));
    remaining -= quantity;
    index++;
  }
  return { ...configuration, devices };
}

export function saveAlarmDevice(configuration: AlarmConfiguration, device: AlarmDeviceRequirement): AlarmConfiguration {
  return { ...configuration, mode: "custom", devices: configuration.devices.map((current) => current.id === device.id ? { ...device, name: device.name.trim(), location: device.location?.trim() || undefined, notes: device.notes?.trim() || undefined, zoneGroup: device.requiresSeparateZone ? undefined : device.zoneGroup?.trim() || undefined, customized: true } : current) };
}

export function resetAlarmDevice(configuration: AlarmConfiguration, id: string): AlarmConfiguration {
  return { ...configuration, devices: configuration.devices.map((device) => device.id === id ? defaultDevice(device.id, device.type, device.quantity) : device) };
}

export function splitAlarmDevice(configuration: AlarmConfiguration, id: string): AlarmConfiguration {
  const target = configuration.devices.find((device) => device.id === id);
  if (!target || target.quantity <= 1) return configuration;
  if (configuration.devices.length >= 500) throw new Error("La personalización admite hasta 500 filas.");
  const devices = configuration.devices.map((device) => device.id === id ? { ...device, quantity: device.quantity - 1 } : device);
  devices.push({ ...target, id: nextDeviceId(devices), name: target.name + " " + target.quantity, quantity: 1 });
  return { ...configuration, mode: "custom", devices };
}

// Technical calculations belong to the API. This client only submits the requirements.
export async function estimateAlarm(configuration: AlarmConfiguration, signal?: AbortSignal): Promise<AlarmEstimate | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  let response: Response;
  try {
    response = await fetch(apiUrl.replace(/\/$/, "") + "/api/v1/quotes/alarm/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(configuration), signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("No se pudo obtener la propuesta de alarma. Verificá la conexión con la API y volvé a intentar.");
  }
  if (!response.ok) throw new Error(response.status === 422 ? "Revisá los valores de alarma: la API rechazó la configuración." : "No se pudo obtener la propuesta de alarma (HTTP " + response.status + ").");
  return response.json() as Promise<AlarmEstimate | null>;
}
