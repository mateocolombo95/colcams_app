import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { alarmConnectionLabels, alarmDeviceLabels } from "../../lib/alarm";
import type { AlarmDeviceRequirement } from "../../types/alarm";

type Props = {
  device: AlarmDeviceRequirement;
  maxQuantity: number;
  onSave: (device: AlarmDeviceRequirement) => void;
  onReset: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export default function AlarmDeviceEditor({ device, maxQuantity, onSave, onReset, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(device);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function update<K extends keyof AlarmDeviceRequirement>(key: K, value: AlarmDeviceRequirement[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onSave(draft);
    onClose();
  }

  // The portal keeps the dialog form outside the wizard form; native dialog manages focus and Escape.
  return createPortal(<dialog ref={dialog} className="camera-dialog" aria-labelledby="alarm-device-editor-title" onCancel={onClose}>
    <form onSubmit={save}>
      <h2 id="alarm-device-editor-title">Editar dispositivo {device.id}</h2>
      <p className="muted small">Los valores personalizados se conservan al cambiar las cantidades generales. Una fila puede representar varios dispositivos iguales.</p>
      <div className="grid">
        <div className="field"><label htmlFor="alarm-device-name">Nombre</label><input id="alarm-device-name" autoFocus required pattern=".*\S.*" maxLength={120} value={draft.name} onChange={(event) => update("name", event.target.value)} /></div>
        <div className="field"><label htmlFor="alarm-device-location">Ubicación / referencia · Opcional</label><input id="alarm-device-location" maxLength={200} value={draft.location ?? ""} onChange={(event) => update("location", event.target.value)} /></div>
        <div className="field"><label htmlFor="alarm-device-type">Tipo de dispositivo</label><select id="alarm-device-type" value={draft.type} onChange={(event) => update("type", event.target.value as AlarmDeviceRequirement["type"])}>{Object.entries(alarmDeviceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="alarm-device-quantity">Cantidad</label><input id="alarm-device-quantity" required type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} value={Number.isNaN(draft.quantity) ? "" : draft.quantity} onChange={(event) => update("quantity", event.target.valueAsNumber)} /></div>
        <div className="field"><label htmlFor="alarm-device-connection">Conexión</label><select id="alarm-device-connection" value={draft.connection} onChange={(event) => update("connection", event.target.value as AlarmDeviceRequirement["connection"])}>{Object.entries(alarmConnectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="alarm-device-separate-zone">Zona separada</label><select id="alarm-device-separate-zone" value={draft.requiresSeparateZone ? "yes" : "no"} onChange={(event) => update("requiresSeparateZone", event.target.value === "yes")}><option value="yes">Sí, una por dispositivo</option><option value="no">Compartir manualmente</option></select></div>
        {!draft.requiresSeparateZone && <div className="field full"><label htmlFor="alarm-device-zone-group">Nombre de zona compartida</label><input id="alarm-device-zone-group" required pattern=".*\S.*" maxLength={120} placeholder="Ej. accesos planta baja" value={draft.zoneGroup ?? ""} onChange={(event) => update("zoneGroup", event.target.value)} aria-describedby="alarm-zone-sharing-help" /><p id="alarm-zone-sharing-help" className="muted small">Solo comparten zona las filas que tengan el mismo nombre de grupo y esta opción activa. Verificá que la agrupación sea apropiada para su conexión y función.</p></div>}
        <div className="field full"><label htmlFor="alarm-device-cable">Distancia de cable por dispositivo (m) · Opcional</label><input id="alarm-device-cable" type="number" inputMode="decimal" min={0} max={500} step="any" value={draft.cableDistanceM ?? ""} onChange={(event) => update("cableDistanceM", event.target.value === "" ? undefined : event.target.valueAsNumber)} aria-describedby="alarm-device-cable-help" /><p id="alarm-device-cable-help" className="muted small">Si queda vacío, se usa la distancia promedio global. Se aplica a cada unidad de esta fila y solo cuenta para dispositivos cableados.</p></div>
        <div className="field full"><label htmlFor="alarm-device-notes">Notas · Opcional</label><textarea id="alarm-device-notes" rows={3} maxLength={2000} value={draft.notes ?? ""} onChange={(event) => update("notes", event.target.value)} /></div>
      </div>
      <div className="camera-editor-actions">
        <button type="submit" className="primary">Guardar cambios</button><button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="secondary reset-camera" onClick={() => { onReset(device.id); onClose(); }}>Restablecer configuración general</button>
        <button type="button" className="secondary" onClick={() => { onDelete(device.id); onClose(); }}>Eliminar dispositivo</button>
      </div>
      <p className="muted small">Restablecer conserva el tipo y la cantidad; elimina nombre, ubicación, notas, grupo de zona y cable personalizados.</p>
    </form>
  </dialog>, document.body);
}
