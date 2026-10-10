import CameraLensRecommendation from "./CameraLensRecommendation";
import { connectivityLabels, environmentLabels, formFactorLabels, viewingRangeLabels, imageObjectiveLabels, nightObjectiveLabels, nightLightingLabels, nightColorLabels, detectionEventLabels, detectionTargetLabels, eventActionLabels } from "../../lib/cameras";
import type { CameraRequirement } from "../../types/quote";

export default function CameraDetails({ cameras }: { cameras: CameraRequirement[] }) {
  return <section className="card"><h2>Detalle de cámaras</h2>
    <div className="camera-details">{cameras.map((camera) => <article key={camera.id} className="camera-detail">
      <div className="camera-row-title"><h3>{camera.id} · {camera.name}</h3><span className="camera-badge">{camera.customized ? "Personalizada" : "Heredada"}</span></div>
      <dl>
        <div><dt>Ubicación</dt><dd>{camera.location || "Sin referencia"}</dd></div>
        <div><dt>Ambiente</dt><dd>{environmentLabels[camera.environment]}</dd></div>
        <div><dt>Formato</dt><dd>{formFactorLabels[camera.formFactor]}</dd></div>
        <div><dt>Resolución</dt><dd>{camera.resolutionMp} MP</dd></div>
        <div><dt>Conexión</dt><dd>{connectivityLabels[camera.connectivity]}</dd></div>
        <div><dt>Distancia de cableado</dt><dd>{camera.distanceM} m</dd></div>
        <div><dt>Alcance visual</dt><dd>{viewingRangeLabels[camera.viewingRange]}</dd></div>
        <div><dt>Objetivo de imagen</dt><dd>{imageObjectiveLabels[camera.imageObjective ?? "undefined"]}</dd></div>
        <div><dt>Distancia al objetivo</dt><dd>{camera.targetDistanceM === undefined ? "Sin definir" : camera.targetDistanceM + " m"}</dd></div>
        <div><dt>Requisito nocturno</dt><dd>{nightObjectiveLabels[camera.nightObjectiveRequired ?? "undefined"]}</dd></div>
        <div><dt>Iluminación nocturna</dt><dd>{nightLightingLabels[camera.nightLighting ?? "unknown"]}</dd></div>
        <div><dt>Color nocturno</dt><dd>{nightColorLabels[camera.nightColorRequired ?? "undefined"]}</dd></div>
        <div><dt>Evento</dt><dd>{detectionEventLabels[camera.detectionEvent ?? "undefined"]}</dd></div>
        <div><dt>Objetivo del evento</dt><dd>{detectionTargetLabels[camera.detectionTarget ?? "undefined"]}</dd></div>
        <div><dt>Acciones</dt><dd>{(camera.eventActions ?? []).map(action => eventActionLabels[action]).join(" · ") || "Sin acciones solicitadas"}</dd></div>
      </dl><CameraLensRecommendation camera={camera} />
      {camera.notes && <p className="muted small camera-notes">{camera.notes}</p>}
    </article>)}</div>
  </section>;
}
