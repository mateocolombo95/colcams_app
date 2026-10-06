import CameraLensRecommendation from "./CameraLensRecommendation";
import { useState } from "react";
import { validCameraDefaults, viewingRangeLabels } from "../../lib/cameras";
import type { GlobalCameraDefaults } from "../../types/quote";

type Props = { defaults: GlobalCameraDefaults; onChange: (defaults: GlobalCameraDefaults) => void };

export default function CameraDefaults({ defaults, onChange }: Props) {
  // Commit numeric edits on blur so replacing "8" with "12" never deletes cameras at "1".
  const [numbers, setNumbers] = useState({
    cameraCount: String(defaults.cameraCount), outdoorCount: String(defaults.outdoorCount), distanceM: String(defaults.distanceM), targetDistanceM: defaults.targetDistanceM === undefined ? "" : String(defaults.targetDistanceM),
  });
  const candidate: GlobalCameraDefaults = {
    ...defaults,
    targetDistanceM: numbers.targetDistanceM === "" ? undefined : Number(numbers.targetDistanceM),
    cameraCount: numbers.cameraCount === "" ? NaN : Number(numbers.cameraCount),
    outdoorCount: numbers.outdoorCount === "" ? NaN : Number(numbers.outdoorCount),
    distanceM: numbers.distanceM === "" ? NaN : Number(numbers.distanceM),
  };
  const valid = validCameraDefaults(candidate);
  function commit() { if (valid) onChange(candidate); }

  return <section aria-labelledby="camera-defaults-title" onKeyDown={(event) => { if (event.key === "Enter") commit(); }}>
    <h3 id="camera-defaults-title">Configuración general</h3>
    <p className="section-description">Definí la cobertura y la tecnología. Las cámaras nuevas se crean con estos valores.</p>
    <div className="grid">
      <div className="field"><label htmlFor="camera_count">Cantidad total de cámaras</label><input id="camera_count" type="number" inputMode="numeric" min={1} max={64} step={1} required value={numbers.cameraCount} onChange={(event) => setNumbers({ ...numbers, cameraCount: event.target.value })} onBlur={commit} /></div>
      <div className="field"><label htmlFor="outdoor_camera_count">Cantidad exteriores</label><input id="outdoor_camera_count" type="number" inputMode="numeric" min={0} max={Number.isFinite(candidate.cameraCount) ? candidate.cameraCount : 64} step={1} required value={numbers.outdoorCount} onChange={(event) => setNumbers({ ...numbers, outdoorCount: event.target.value })} onBlur={commit} aria-describedby="outdoor-help" /></div>
      <div className="field"><label htmlFor="indoor">Cámaras interiores</label><output id="indoor" className="calculated">{valid ? candidate.cameraCount - candidate.outdoorCount : "Revisá las cantidades"}</output></div>
      <div className="field"><label htmlFor="resolution">Resolución global</label><select id="resolution" value={defaults.resolutionMp} onChange={(event) => onChange({ ...defaults, resolutionMp: Number(event.target.value) as GlobalCameraDefaults["resolutionMp"] })}>{[2, 4, 5, 8].map((mp) => <option key={mp} value={mp}>{mp} MP</option>)}</select></div>
      <div className="field"><label htmlFor="connectivity">Conectividad global</label><select id="connectivity" value={defaults.connectivity} onChange={(event) => onChange({ ...defaults, connectivity: event.target.value as GlobalCameraDefaults["connectivity"] })}><option value="poe">IP cableado / PoE</option><option value="wifi">Wi-Fi</option></select></div>
      <div className="field"><label htmlFor="average_cable_m_per_camera">Distancia promedio de cableado (m)</label><input id="average_cable_m_per_camera" type="number" inputMode="decimal" min={0} max={500} step="any" required value={numbers.distanceM} onChange={(event) => setNumbers({ ...numbers, distanceM: event.target.value })} onBlur={commit} /></div>
      <div className="field"><label htmlFor="global-viewing-range">Objetivo de visualización</label><select id="global-viewing-range" value={defaults.viewingRange} onChange={(event) => onChange({ ...defaults, viewingRange: event.target.value as GlobalCameraDefaults["viewingRange"] })}>{Object.entries(viewingRangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="global-target-distance">Distancia aproximada al punto de interés (m) · Opcional</label><input id="global-target-distance" type="number" inputMode="decimal" min={0} step="any" value={numbers.targetDistanceM} onChange={(event) => setNumbers({ ...numbers, targetDistanceM: event.target.value })} onBlur={commit} aria-describedby="target-help" /><p id="target-help" className="muted small">Desde la cámara hasta lo que necesitás observar; independiente del cableado.</p></div>
    </div><CameraLensRecommendation camera={defaults} />
    <p className="muted small" id="outdoor-help">Las primeras cámaras se asignan al exterior. La cantidad exterior no puede superar el total. Las cámaras personalizadas conservan su ambiente.</p>
    {Number.isFinite(candidate.outdoorCount) && candidate.outdoorCount > candidate.cameraCount && <p className="error" role="alert">La cantidad de cámaras exteriores no puede superar la cantidad total.</p>}
    {Number.isInteger(candidate.cameraCount) && candidate.cameraCount >= 1 && candidate.cameraCount < defaults.cameraCount && <p className="note">Al aplicar la cantidad se eliminan las últimas cámaras, incluidas sus personalizaciones.</p>}
  </section>;
}
