import type { CameraCalculation } from "../../types/quote";

export default function CameraCalculationNotes({ calculation }: { calculation: CameraCalculation }) {
  return <>
    {calculation.individualDistances && <p className="note">Cableado estimado basado en distancias individuales. Promedio PoE: {calculation.payload.average_cable_m_per_camera.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m. El motor aplica este promedio al total de cámaras con su factor de reserva.</p>}
    {calculation.warnings.length > 0 && <div className="calculation-warning" role="status"><strong>Consideraciones del cálculo</strong><ul>{calculation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      {calculation.mixedConnectivity && <p>Se envía el proyecto como PoE: los puertos y el cable se dimensionan para todas las cámaras, incluidas las Wi-Fi.</p>}
      {calculation.mixedResolutions && <p>Se envían {calculation.payload.resolution_mp} MP para todas las cámaras. La BOM también refleja esta resolución de referencia; consultá el detalle individual para la selección final.</p>}
    </div>}
  </>;
}
