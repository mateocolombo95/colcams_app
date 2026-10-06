import CameraLensRecommendation from "./CameraLensRecommendation";
import { connectivityLabels, environmentLabels, formFactorLabels, viewingRangeLabels } from "../../lib/cameras";
import type { CameraRequirement } from "../../types/quote";

export default function CameraDetails({ cameras }: { cameras: CameraRequirement[] }) {
  return <section className="card"><h2>Detalle de cámaras</h2>
    <div className="camera-details">{cameras.map((camera) => <article key={camera.id} className="camera-detail">
      <div className="camera-row-title"><h3>{camera.id} · {camera.name}</h3>{camera.customized && <span className="camera-badge">Personalizada</span>}</div>
      <dl>
        <div><dt>Ubicación</dt><dd>{camera.location || "Sin referencia"}</dd></div>
        <div><dt>Ambiente</dt><dd>{environmentLabels[camera.environment]}</dd></div>
        <div><dt>Formato</dt><dd>{formFactorLabels[camera.formFactor]}</dd></div>
        <div><dt>Resolución</dt><dd>{camera.resolutionMp} MP</dd></div>
        <div><dt>Conexión</dt><dd>{connectivityLabels[camera.connectivity]}</dd></div>
        <div><dt>Distancia de cableado</dt><dd>{camera.distanceM} m</dd></div>
        <div><dt>Objetivo de visualización</dt><dd>{viewingRangeLabels[camera.viewingRange]}</dd></div>
        <div><dt>Distancia al punto de interés</dt><dd>{camera.targetDistanceM === undefined ? "Sin indicar" : camera.targetDistanceM + " m"}</dd></div>
      </dl><CameraLensRecommendation camera={camera} />
      {camera.notes && <p className="muted small camera-notes">{camera.notes}</p>}
    </article>)}</div>
  </section>;
}
