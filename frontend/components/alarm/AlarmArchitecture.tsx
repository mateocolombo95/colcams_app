import { alarmCommunicationLabels, alarmSystemLabels } from "../../lib/alarm";
import type { AlarmEstimate } from "../../types/alarm";

export default function AlarmArchitecture({ estimate }: { estimate: AlarmEstimate }) {
  const configuration = estimate.configuration;
  const number = (value: number) => value.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return <>
    <dl className="summary-grid">
      <div><dt>Tipo de sistema</dt><dd>{alarmSystemLabels[estimate.systemType]}</dd></div>
      <div><dt>Dispositivos</dt><dd>{estimate.deviceCount}</dd></div>
      <div><dt>Zonas requeridas</dt><dd>{estimate.zonesRequired}</dd></div>
      <div><dt>Reserva de expansión</dt><dd>{estimate.expansionReservePercent}%</dd></div>
      <div><dt>Zonas con reserva</dt><dd>{estimate.zonesWithReserve}</dd></div>
      <div><dt>Panel recomendado</dt><dd>{estimate.recommendedPanelZones === null ? "Superior / manual" : estimate.recommendedPanelZones + " zonas"}</dd></div>
      <div><dt>Panel seleccionado</dt><dd>{estimate.selectedPanelZones === null ? "Requiere definición manual" : estimate.selectedPanelZones + " zonas"}</dd>{estimate.panelOverridden && <p className="camera-badge">Modificado manualmente</p>}</div>
      <div><dt>Expansores</dt><dd>{estimate.expanderCount} × {estimate.expanderZones} zonas</dd></div>
      <div><dt>Capacidad instalada</dt><dd>{estimate.installedZoneCapacity === null ? "A definir" : estimate.installedZoneCapacity + " zonas"}</dd></div>
      <div><dt>Teclados</dt><dd>{configuration.keypadCount} · {{ lcd: "LCD / convencional", touch: "Touch", wireless: "Inalámbrico" }[configuration.keypadType]}</dd></div>
      <div><dt>Sirenas</dt><dd>{configuration.indoorSirens} interiores · {configuration.outdoorSirens} exteriores{configuration.outdoorSirenWithStrobe && configuration.outdoorSirens > 0 ? " con baliza" : ""}</dd></div>
      <div><dt>Comunicaciones</dt><dd>{configuration.communications.map((value) => alarmCommunicationLabels[value]).join(" + ") || "Sin comunicación remota"}</dd></div>
      <div><dt>Particiones</dt><dd>{configuration.partitions}</dd></div>
      <div><dt>Autonomía deseada</dt><dd>{configuration.backupAutonomyHours} h</dd></div>
      <div><dt>Carga preliminar</dt><dd>{number(estimate.estimatedLoadW)} W</dd></div>
      <div><dt>Batería estimada (12 V)</dt><dd>{estimate.batteryAhSelected === null ? "Superior / manual (≈ " + number(estimate.batteryAhApprox) + " Ah)" : estimate.batteryAhSelected === 0 ? "Sin respaldo" : estimate.batteryAhSelected + " Ah"}</dd></div>
      <div><dt>Cable de alarma estimado</dt><dd>{number(estimate.estimatedCableM)} m</dd></div>
      <div><dt>Fuente auxiliar</dt><dd>{estimate.auxiliaryPowerRequired ? "Sí / validar capacidad" : "No prevista"}</dd></div>
      <div><dt>Supervisión tamper</dt><dd>{configuration.tamperRequired ? "Requerida" : "No requerida"}</dd></div>
    </dl>
    <p className="note">Estimación preliminar de carga. Validar consumos reales según equipos seleccionados. Batería estimada: validar según corriente real, batería y características del panel.</p>
    {estimate.warnings.length > 0 && <div className="calculation-warning"><h3>Observaciones de alarma</h3><ul>{estimate.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
  </>;
}
