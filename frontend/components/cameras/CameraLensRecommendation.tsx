import { getLensRecommendation } from "../../lib/cameras";
import type { CameraRequirement } from "../../types/quote";
export default function CameraLensRecommendation({ camera }: { camera: Pick<CameraRequirement, "viewingRange" | "targetDistanceM"> }) {
  const recommendation = getLensRecommendation(camera);
  return <div className="small"><p><strong>Recomendación preliminar de lente:</strong> {recommendation.text}</p><p className="muted">Orientativa; verificar geometría y detalle requerido. No define un producto ni un cálculo óptico exacto.</p>{recommendation.warnings.map((warning) => <p className="note" key={warning}>{warning}</p>)}</div>;
}
