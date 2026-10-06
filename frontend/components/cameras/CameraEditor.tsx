import CameraLensRecommendation from "./CameraLensRecommendation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { connectivityLabels, environmentLabels, formFactorLabels, viewingRangeLabels } from "../../lib/cameras";
import type { CameraRequirement } from "../../types/quote";

type Props = {
  camera: CameraRequirement;
  onSave: (camera: CameraRequirement) => void;
  onReset: (id: string) => void;
  onClose: () => void;
};

export default function CameraEditor({ camera, onSave, onReset, onClose }: Props) {
  const [draft, setDraft] = useState(camera);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function update<K extends keyof CameraRequirement>(key: K, value: CameraRequirement[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onSave({ ...draft, name: draft.name.trim(), location: draft.location?.trim(), notes: draft.notes?.trim(), customized: true });
    onClose();
  }

  // A portal keeps this form outside the wizard form. Native dialog handles focus and Escape.
  return createPortal(<dialog className="camera-dialog" ref={dialog} aria-labelledby="camera-editor-title" onCancel={onClose}>
    <form onSubmit={save}>
      <h2 id="camera-editor-title">Editar {camera.id}</h2>
      <p className="muted small">Al guardar, esta cámara conserva su configuración aunque cambien los valores generales.</p>
      <div className="grid">
        <div className="field"><label htmlFor="camera-name">Nombre</label><input id="camera-name" autoFocus required pattern=".*\S.*" value={draft.name} onChange={(event) => update("name", event.target.value)} /></div>
        <div className="field"><label htmlFor="camera-location">Ubicación / referencia <span className="optional">· Opcional</span></label><input id="camera-location" placeholder="Entrada, caja, patio…" value={draft.location ?? ""} onChange={(event) => update("location", event.target.value)} /></div>
        <div className="field"><label htmlFor="camera-environment">Ambiente</label><select id="camera-environment" value={draft.environment} onChange={(event) => update("environment", event.target.value as CameraRequirement["environment"])}>{Object.entries(environmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="camera-format">Formato</label><select id="camera-format" value={draft.formFactor} onChange={(event) => update("formFactor", event.target.value as CameraRequirement["formFactor"])}>{Object.entries(formFactorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="camera-resolution">Resolución</label><select id="camera-resolution" value={draft.resolutionMp} onChange={(event) => update("resolutionMp", Number(event.target.value) as CameraRequirement["resolutionMp"])}>{[2, 4, 5, 8].map((mp) => <option key={mp} value={mp}>{mp} MP</option>)}</select></div>
        <div className="field"><label htmlFor="camera-connectivity">Conectividad</label><select id="camera-connectivity" value={draft.connectivity} onChange={(event) => update("connectivity", event.target.value as CameraRequirement["connectivity"])}>{Object.entries(connectivityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field full"><label htmlFor="camera-distance">Distancia al punto de concentración / NVR (m)</label><input id="camera-distance" type="number" inputMode="decimal" min={0} max={500} step="any" required value={Number.isNaN(draft.distanceM) ? "" : draft.distanceM} onChange={(event) => update("distanceM", event.target.valueAsNumber)} />{draft.connectivity === "wifi" && <p className="muted small">Se registra como referencia; no se incluye en el promedio de cable PoE.</p>}</div>
        <div className="field"><label htmlFor="camera-viewing-range">Objetivo de visualización</label><select id="camera-viewing-range" value={draft.viewingRange} onChange={(event) => update("viewingRange", event.target.value as CameraRequirement["viewingRange"])}>{Object.entries(viewingRangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor="camera-target-distance">Distancia aproximada al punto de interés (m) · Opcional</label><input id="camera-target-distance" type="number" inputMode="decimal" min={0} step="any" value={draft.targetDistanceM ?? ""} onChange={(event) => update("targetDistanceM", event.target.value === "" ? undefined : event.target.valueAsNumber)} aria-describedby="camera-target-help" /><p id="camera-target-help" className="muted small">Desde la cámara hasta lo que necesitás observar; independiente del cableado.</p></div>
        <div className="field full"><label htmlFor="camera-notes">Notas <span className="optional">· Opcional</span></label><textarea id="camera-notes" rows={3} value={draft.notes ?? ""} onChange={(event) => update("notes", event.target.value)} /></div>
      </div>
      <CameraLensRecommendation camera={draft} />
      <div className="camera-editor-actions"><button type="submit" className="primary">Guardar cambios</button><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="button" className="secondary reset-camera" onClick={() => { onReset(camera.id); onClose(); }}>Restablecer configuración general</button></div>
      <p className="muted small">Restablecer también elimina el nombre, la ubicación y las notas personalizados.</p>
    </form>
  </dialog>, document.body);
}
