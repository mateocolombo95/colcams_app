import { connectivityLabels, environmentLabels, formFactorLabels } from "../../lib/cameras";
import type { CameraRequirement } from "../../types/quote";

export default function CameraList({ cameras, onEdit }: { cameras: CameraRequirement[]; onEdit: (camera: CameraRequirement) => void }) {
  return <ul className="camera-list">{cameras.map((camera) => <li className="camera-row" key={camera.id}>
    <div className="camera-row-content"><div className="camera-row-title"><strong>{camera.id} · {camera.name}</strong>{camera.customized && <span className="camera-badge">Personalizada</span>}</div>
      <p>{[environmentLabels[camera.environment], formFactorLabels[camera.formFactor], `${camera.resolutionMp} MP`, connectivityLabels[camera.connectivity], `${camera.distanceM} m`].join(" · ")}</p>
      {camera.location && <p className="muted">{camera.location}</p>}
    </div><button type="button" className="secondary" aria-label={`Editar ${camera.id}`} onClick={() => onEdit(camera)}>Editar</button>
  </li>)}</ul>;
}
