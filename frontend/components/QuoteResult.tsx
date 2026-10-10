import type { CameraRequirement, QuoteEstimate, QuoteRequest, Survey } from "../types/quote";
import CameraDetails from "./cameras/CameraDetails";
import ProjectExport from "./exports/ProjectExport";
import AlarmDetails from "./alarm/AlarmDetails";
import CameraPending from "./cameras/CameraPending";
import { getProjectPending, recordingModeLabels } from "../lib/cameras";

export const money = (value: number) => "$ " + value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const costNotice = "El motor todavía no incluye precios de catálogo para la BOM. El costo total suma únicamente materiales/equipos adicionales y mano de obra ingresados. Usá la misma moneda en ambos importes.";

const materialCategoryLabels: Record<string, string> = {
  camera: "Cámaras", nvr: "Grabación", storage: "Almacenamiento", switch: "Red", cable: "Cableado CCTV",
  alarm_panel: "Panel de alarma", alarm_expander: "Expansión de alarma", alarm_keypad: "Teclados de alarma",
  alarm_sensor: "Sensores de alarma", alarm_siren: "Sirenas de alarma", alarm_communication: "Comunicación de alarma",
  alarm_power: "Alimentación de alarma", alarm_battery: "Respaldo de alarma", alarm_cable: "Cableado de alarma", alarm_accessories: "Accesorios de alarma",
};

export default function QuoteResult({ estimate, survey, cameras, requirements }: { estimate: QuoteEstimate; survey: Survey; cameras: CameraRequirement[]; requirements: QuoteRequest }) {
  return <div className="result">
    <ProjectExport project={{ estimate, survey, cameras, requirements }} />
    <section className="card"><h2>Resumen del proyecto</h2><dl className="summary-grid">
      <div><dt>Cliente</dt><dd>{survey.client}</dd></div><div><dt>Sitio</dt><dd>{survey.site}</dd></div>
      <div><dt>Tipo de sitio</dt><dd>{survey.siteType}</dd></div><div><dt>Cámaras</dt><dd>{cameras.length}</dd></div>
      <div><dt>Grabación</dt><dd>{recordingModeLabels[requirements.recordingMode ?? "undefined"]}</dd></div>
      <div><dt>Retención solicitada</dt><dd>{requirements.retention_days} días</dd></div>
    </dl><p className="muted small">Estimación orientativa, sin garantía exacta de capacidad o retención. Referencia de cálculo: {estimate.storage_hours_per_day ?? (requirements.recordingMode === "continuous" || requirements.recordingMode === "events" ? 24 : requirements.recording_hours_per_day)} h/día.</p></section>
    <CameraDetails cameras={cameras} />
    {estimate.alarm && <AlarmDetails estimate={estimate.alarm} />}
    <section className="card"><h2>Diseño técnico</h2><dl className="summary-grid">
      <div><dt>NVR recomendado</dt><dd>{estimate.nvr_channels} canales</dd></div>
      <div><dt>Almacenamiento calculado</dt><dd>{estimate.storage_tb_raw} TB</dd></div>
      <div><dt>Almacenamiento seleccionado</dt><dd>{estimate.storage_tb_selected} TB</dd></div>
      <div><dt>Puertos PoE requeridos</dt><dd>{estimate.poe_ports_required}</dd></div>
      <div><dt>Switch sugerido</dt><dd>{estimate.poe_switch_ports_selected === null ? "No aplica" : estimate.poe_switch_ports_selected + " puertos PoE"}</dd></div>
      <div><dt>Metros de cable</dt><dd>{estimate.estimated_cable_m} m</dd></div>
    </dl></section>
    <section className="card"><h2>BOM · Lista de materiales</h2><div className="table-scroll"><table>
      <thead><tr><th scope="col">Categoría</th><th scope="col">Descripción</th><th scope="col">Cantidad</th></tr></thead>
      <tbody>{estimate.bom.map((item, index) => <tr key={index}><td>{materialCategoryLabels[item.category] ?? item.category}</td><td>{item.description}{item.observations && <p className="muted small">{item.observations}</p>}</td><td>{item.quantity}{item.unit ? ` ${item.unit}` : ""}</td></tr>)}</tbody>
    </table></div></section>
    <section className="card"><h2>Comercial</h2><dl className="summary-grid">
      <div><dt>Costo total</dt><dd>{money(estimate.total_cost)}</dd></div><div><dt>Margen bruto</dt><dd>{estimate.margin_percent}%</dd></div>
      <div className="sale"><dt>Precio de venta sugerido</dt><dd>{money(estimate.sale_price)}</dd></div>
    </dl><p className="note">{costNotice}</p></section>
    <section className="card"><h2>Advertencias técnicas de la API</h2>{estimate.warnings.length ? <ul className="warnings">{estimate.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p className="muted">La API no devolvió advertencias técnicas.</p>}</section>
    <CameraPending pending={getProjectPending(requirements, cameras)} />
  </div>;
}
