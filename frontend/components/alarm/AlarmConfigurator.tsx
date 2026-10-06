"use client";

import { useEffect, useRef, useState } from "react";
import { ALARM_TECHNICAL_DISCLAIMER, alarmCommunicationLabels, alarmConnectionLabels, alarmDeviceCountLimit, alarmDeviceCounts, alarmDeviceLabels, alarmObjectiveLabels, alarmSystemLabels, customizedAlarmDeviceCount, estimateAlarm, resetAlarmDevice, saveAlarmDevice, setAlarmDeviceCount, splitAlarmDevice } from "../../lib/alarm";
import type { AlarmCommunication, AlarmConfiguration, AlarmDeviceType, AlarmEstimate, AlarmObjective } from "../../types/alarm";
import AlarmArchitecture from "./AlarmArchitecture";
import AlarmDeviceEditor from "./AlarmDeviceEditor";

type Props = { configuration: AlarmConfiguration; onChange: (configuration: AlarmConfiguration) => void };
type NumericProps = { id: string; label: string; value: number; min?: number; max?: number; step?: number | "any"; onChange: (value: number) => void };

// Numeric drafts commit on blur, avoiding destructive intermediate count changes while typing.
function NumericField({ id, label, value, min = 0, max = 1000, step = 1, onChange }: NumericProps) {
  const [edit, setEdit] = useState({ source: value, draft: String(value) });
  const draft = edit.source === value ? edit.draft : String(value);
  function commit(input: HTMLInputElement) {
    if (input.reportValidity()) onChange(input.valueAsNumber);
  }
  return <div className="field"><label htmlFor={id}>{label}</label><input id={id} required type="number" inputMode={step === "any" ? "decimal" : "numeric"} min={min} max={max} step={step} value={draft} onChange={(event) => setEdit({ source: value, draft: event.target.value })} onBlur={(event) => commit(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(event.currentTarget); } }} /></div>;
}

const quickTypes: AlarmDeviceType[] = ["pir_indoor", "pir_outdoor", "magnetic_contact", "beam", "glass_break", "panic_button"];
const technicalTypes: AlarmDeviceType[] = ["smoke", "gas", "flood"];

export default function AlarmConfigurator({ configuration, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ source: AlarmConfiguration; estimate?: AlarmEstimate | null; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const deviceDetails = useRef<HTMLDetailsElement>(null);
  const counts = alarmDeviceCounts(configuration.devices);
  const editingDevice = configuration.devices.find((device) => device.id === editingId);
  const currentPreview = preview?.source === configuration ? preview : null;

  useEffect(() => {
    if (!configuration.enabled) return;
    const controller = new AbortController();
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timeout = setTimeout(() => {
        controller.abort();
        if (!disposed) setPreview({ source: configuration, error: "La propuesta de alarma demoró demasiado. Volvé a intentar." });
      }, 30000);
      estimateAlarm(configuration, controller.signal).then((estimate) => {
        if (!disposed && !controller.signal.aborted) setPreview({ source: configuration, estimate });
      }).catch((error: unknown) => {
        if (!disposed && !controller.signal.aborted) setPreview({ source: configuration, error: error instanceof Error ? error.message : "No se pudo obtener la propuesta de alarma." });
      }).finally(() => clearTimeout(timeout));
    }, 350);
    return () => { disposed = true; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [configuration, retry]);

  function update<K extends keyof AlarmConfiguration>(key: K, value: AlarmConfiguration[K], manual = false) {
    onChange({ ...configuration, [key]: value, ...(manual ? { mode: "custom" as const } : {}) });
  }

  function toggleCommunication(communication: AlarmCommunication, checked: boolean) {
    update("communications", checked ? [...configuration.communications, communication] : configuration.communications.filter((value) => value !== communication));
  }

  function toggleObjective(objective: AlarmObjective, checked: boolean) {
    update("objectives", checked ? [...configuration.objectives, objective] : configuration.objectives.filter((value) => value !== objective));
  }

  return <section className="camera-advanced" aria-labelledby="alarm-configurator-title">
    <h2 id="alarm-configurator-title">Alarma / Intrusión</h2>
    <div className="field"><label htmlFor="alarm-activation">Requerimiento de alarma</label><select id="alarm-activation" value={configuration.enabled ? configuration.mode : "none"} onChange={(event) => onChange({ ...configuration, enabled: event.target.value !== "none", mode: event.target.value === "custom" ? "custom" : "automatic" })}>
      <option value="none">No requerida</option><option value="automatic">Configuración automática</option><option value="custom">Configuración personalizada</option>
    </select></div>
    {configuration.enabled && <>
      <p className="section-description">Definí los requerimientos para recibir una arquitectura preliminar. Podés ajustar la propuesta en la configuración avanzada.</p>
      {configuration.mode === "automatic" && (configuration.panelMode === "manual" || configuration.devices.some((device) => device.customized) || configuration.auxiliaryPowerMode !== "automatic") && <p className="note">La configuración automática conserva los ajustes que guardaste. Para volver a la recomendación, seleccioná panel y fuente automáticos o restablecé el dispositivo.</p>}
      <div className="grid">
        <div className="field"><label htmlFor="alarm-system-type">Tipo de sistema</label><select id="alarm-system-type" value={configuration.systemType} onChange={(event) => update("systemType", event.target.value as AlarmConfiguration["systemType"])}>{Object.entries(alarmSystemLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <NumericField id="alarm-autonomy" label="Autonomía de respaldo deseada (h)" value={configuration.backupAutonomyHours} max={168} step="any" onChange={(value) => update("backupAutonomyHours", value)} />
      </div>
      <h3 className="camera-advanced">Relevamiento rápido</h3>
      <p className="muted small">Cargá cantidades por tipo. Cada dispositivo ocupa una zona por defecto; podés personalizar o compartir zonas manualmente.</p>
      <div className="grid">{quickTypes.map((type) => <NumericField key={type} id={"alarm-count-" + type} label={"Cantidad · " + alarmDeviceLabels[type]} value={counts[type]} min={customizedAlarmDeviceCount(configuration.devices, type)} max={alarmDeviceCountLimit(configuration, type)} onChange={(count) => onChange(setAlarmDeviceCount(configuration, type, count))} />)}</div>
      <details className="camera-advanced"><summary>Detectores técnicos auxiliares: humo, gas e inundación</summary>
        <p className="muted small">Elegí el tipo para que la propuesta distinga la función de cada detector.</p>
        <div className="grid">{technicalTypes.map((type) => <NumericField key={type} id={"alarm-count-" + type} label={"Cantidad · " + alarmDeviceLabels[type]} value={counts[type]} min={customizedAlarmDeviceCount(configuration.devices, type)} max={alarmDeviceCountLimit(configuration, type)} onChange={(count) => onChange(setAlarmDeviceCount(configuration, type, count))} />)}</div>
        <p className="note">{ALARM_TECHNICAL_DISCLAIMER}</p>
      </details>
      <h3 className="camera-advanced">Sirenas y comunicación</h3>
      <div className="grid">
        <NumericField id="alarm-indoor-sirens" label="Cantidad de sirenas interiores" value={configuration.indoorSirens} max={128} onChange={(value) => update("indoorSirens", value)} />
        <NumericField id="alarm-outdoor-sirens" label="Cantidad de sirenas exteriores" value={configuration.outdoorSirens} max={128} onChange={(value) => update("outdoorSirens", value)} />
        {configuration.outdoorSirens > 0 && <label className="check-option full"><input id="alarm-outdoor-strobe" type="checkbox" checked={configuration.outdoorSirenWithStrobe} onChange={(event) => update("outdoorSirenWithStrobe", event.target.checked)} />Sirena exterior con flash / baliza</label>}
        <fieldset className="full"><legend>Medios de comunicación</legend><div className="check-grid">{Object.entries(alarmCommunicationLabels).map(([value, label]) => <label key={value} className="check-option"><input type="checkbox" checked={configuration.communications.includes(value as AlarmCommunication)} onChange={(event) => toggleCommunication(value as AlarmCommunication, event.target.checked)} />{label}</label>)}<label className="check-option"><input type="checkbox" checked={configuration.communications.length === 0} onChange={() => update("communications", [])} />Sin comunicación remota</label></div></fieldset>
      </div>
      <details className="camera-advanced">
        <summary>Configuración avanzada</summary>
        <p className="muted small">Los ajustes manuales conservan el criterio del instalador. Las advertencias orientan la revisión y no bloquean la cotización.</p>
        <fieldset><legend>Objetivos del sistema · Combiná los que necesites</legend><div className="check-grid">{Object.entries(alarmObjectiveLabels).map(([value, label]) => <label key={value} className="check-option"><input type="checkbox" checked={configuration.objectives.includes(value as AlarmObjective)} onChange={(event) => toggleObjective(value as AlarmObjective, event.target.checked)} />{label}</label>)}</div></fieldset>
        <h3 className="camera-advanced">Panel y ampliación</h3>
        <div className="grid">
          <NumericField id="alarm-reserve" label="Reserva para ampliación (%)" value={configuration.expansionReservePercent} max={100} step="any" onChange={(value) => update("expansionReservePercent", value)} />
          <div className="field"><label htmlFor="alarm-panel-mode">Selección del panel</label><select id="alarm-panel-mode" value={configuration.panelMode} onChange={(event) => onChange({ ...configuration, panelMode: event.target.value as AlarmConfiguration["panelMode"], ...(event.target.value === "manual" ? { mode: "custom", panelZones: configuration.panelZones ?? currentPreview?.estimate?.recommendedPanelZones ?? 8 } : {}) })}><option value="automatic">Automático</option><option value="manual">Manual / instalador</option></select></div>
          {configuration.panelMode === "manual" && <NumericField id="alarm-panel-zones" label="Capacidad base del panel (zonas)" value={configuration.panelZones ?? 8} min={1} max={10000} onChange={(value) => update("panelZones", value, true)} />}
          <NumericField id="alarm-keypads" label="Cantidad de teclados" value={configuration.keypadCount} max={128} onChange={(value) => update("keypadCount", value)} />
          <div className="field"><label htmlFor="alarm-keypad-type">Tipo de teclado</label><select id="alarm-keypad-type" value={configuration.keypadType} onChange={(event) => update("keypadType", event.target.value as AlarmConfiguration["keypadType"])}><option value="lcd">LCD / convencional</option><option value="touch">Touch</option><option value="wireless">Inalámbrico</option></select></div>
          <NumericField id="alarm-partitions" label="Particiones / áreas independientes" value={configuration.partitions} min={1} max={64} onChange={(value) => update("partitions", value)} />
        </div>
        <p className="muted small">Capacidades de referencia: 8, 16, 32 y 64 zonas. Los expansores se proponen según la capacidad base y las zonas con reserva.</p>
        <h3 className="camera-advanced">App y monitoreo</h3>
        <div className="check-grid">
          <label className="check-option"><input type="checkbox" checked={configuration.remoteAppRequired} onChange={(event) => update("remoteAppRequired", event.target.checked)} />Acceso desde app</label>
          <label className="check-option"><input type="checkbox" checked={configuration.pushNotificationsRequired} onChange={(event) => update("pushNotificationsRequired", event.target.checked)} />Notificaciones push</label>
          <label className="check-option"><input type="checkbox" checked={configuration.professionalMonitoringRequired} onChange={(event) => update("professionalMonitoringRequired", event.target.checked)} />Monitoreo profesional</label>
          <label className="check-option"><input type="checkbox" checked={configuration.localOnly} onChange={(event) => update("localOnly", event.target.checked)} />Solo alarma local</label>
        </div>
        <h3 className="camera-advanced">Alimentación y cableado</h3>
        <div className="grid">
          <div className="field"><label htmlFor="alarm-auxiliary-power">Fuente auxiliar 12 V</label><select id="alarm-auxiliary-power" value={configuration.auxiliaryPowerMode} onChange={(event) => update("auxiliaryPowerMode", event.target.value as AlarmConfiguration["auxiliaryPowerMode"], true)}><option value="automatic">Automática / recomendar</option><option value="yes">Sí</option><option value="no">No</option></select></div>
          <NumericField id="alarm-average-cable" label="Distancia promedio por dispositivo cableado (m)" value={configuration.averageCableMPerWiredDevice} max={500} step="any" onChange={(value) => update("averageCableMPerWiredDevice", value)} />
          <label className="check-option full"><input type="checkbox" checked={configuration.tamperRequired} onChange={(event) => update("tamperRequired", event.target.checked)} />Supervisión anti-sabotaje / tamper</label>
        </div>
        <p className="muted small">La distancia media se hereda si el dispositivo no tiene una distancia personalizada. El cable de alarma se calcula separado del UTP de cámaras. Una autonomía de 0 h indica que no se prevé batería de respaldo.</p>
        <h3 className="camera-advanced">Dispositivos particulares</h3>
        <NumericField id="alarm-count-other" label="Cantidad · Otro dispositivo" value={counts.other} min={customizedAlarmDeviceCount(configuration.devices, "other")} max={alarmDeviceCountLimit(configuration, "other")} onChange={(count) => onChange(setAlarmDeviceCount(configuration, "other", count))} />
        <button type="button" className="secondary quick-option" onClick={() => { if (deviceDetails.current) { deviceDetails.current.open = true; deviceDetails.current.scrollIntoView({ block: "nearest" }); } }}>Personalizar dispositivos</button>
        <details className="camera-advanced" ref={deviceDetails}><summary>Listado y personalización de dispositivos</summary>
          <p className="muted small">Separá una unidad de un grupo para editar un caso particular. Las cantidades generales conservan las filas personalizadas; para reducirlas, editá o eliminá la fila correspondiente.</p>
          {configuration.devices.length === 0 ? <p className="muted small">Cargá una cantidad en el relevamiento rápido.</p> : <ul className="camera-list">{configuration.devices.map((device) => <li key={device.id} className="camera-row alarm-device-row">
            <div className="camera-row-content"><div className="camera-row-title"><strong>{device.id} · {device.name}</strong>{device.customized && <span className="camera-badge">Personalizado</span>}</div><p>{device.quantity} × {alarmDeviceLabels[device.type]} · {alarmConnectionLabels[device.connection]}{device.location ? " · " + device.location : ""}</p>{!device.requiresSeparateZone && <p>Zona compartida: {device.zoneGroup || "Sin grupo definido"}</p>}</div>
            <button type="button" className="secondary" onClick={() => setEditingId(device.id)}>Editar</button>
            {device.quantity > 1 && <button type="button" className="secondary" disabled={configuration.devices.length >= 500} title={configuration.devices.length >= 500 ? "La personalización admite hasta 500 filas." : undefined} onClick={() => onChange(splitAlarmDevice(configuration, device.id))}>Separar una unidad</button>}
          </li>)}</ul>}
        </details>
      </details>
      <div className="camera-advanced" aria-live="polite" aria-busy={!currentPreview}>
        <h3>Arquitectura propuesta</h3>
        {currentPreview?.error ? <div className="error" role="alert"><p>{currentPreview.error}</p><button type="button" className="secondary" onClick={() => { setPreview(null); setRetry((current) => current + 1); }}>Reintentar propuesta</button></div> : currentPreview?.estimate ? <AlarmArchitecture estimate={currentPreview.estimate} /> : <p className="loading">Calculando propuesta preliminar…</p>}
      </div>
      {editingDevice && <AlarmDeviceEditor key={editingDevice.id} device={editingDevice} maxQuantity={Math.min(1000, 10000 - configuration.devices.reduce((total, device) => total + (device.id !== editingDevice.id ? device.quantity : 0), 0))} onSave={(device) => onChange(saveAlarmDevice(configuration, device))} onReset={(id) => onChange(resetAlarmDevice(configuration, id))} onDelete={(id) => onChange({ ...configuration, mode: "custom", devices: configuration.devices.filter((device) => device.id !== id) })} onClose={() => setEditingId(null)} />}
    </>}
  </section>;
}
