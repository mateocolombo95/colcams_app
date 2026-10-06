import { alarmDeviceLabels } from "../../lib/alarm";
import type { AlarmEstimate } from "../../types/alarm";
import AlarmArchitecture from "./AlarmArchitecture";

export default function AlarmDetails({ estimate }: { estimate: AlarmEstimate }) {
  return <section className="card" aria-labelledby="alarm-result-title">
    <h2 id="alarm-result-title">Alarma / Intrusión</h2>
    <AlarmArchitecture estimate={estimate} />
    {estimate.devices.length > 0 && <details className="camera-advanced"><summary>Detalle de dispositivos de alarma</summary><div className="table-scroll"><table>
      <thead><tr><th scope="col">Elemento</th><th scope="col">Ubicación</th><th scope="col">Tipo</th><th scope="col">Conexión</th><th scope="col">Cantidad</th><th scope="col">Zona</th><th scope="col">Observaciones</th></tr></thead>
      <tbody>{estimate.devices.map((device) => <tr key={device.id}><td>{device.name}</td><td>{device.location || "Sin referencia"}</td><td>{alarmDeviceLabels[device.type]}</td><td>{device.connection === "wired" ? "Cableado" : "Inalámbrico"}</td><td>{device.quantity}</td><td>{device.zoneLabel}</td><td>{device.notes || "—"}</td></tr>)}</tbody>
    </table></div></details>}
  </section>;
}
