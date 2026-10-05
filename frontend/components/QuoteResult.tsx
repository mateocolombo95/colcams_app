import type { QuoteEstimate, Survey } from "../types/quote";

export const money = (value: number) => "$ " + value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const costNotice = "El motor todavía no incluye precios de catálogo para la BOM. El costo total suma únicamente materiales/equipos adicionales y mano de obra ingresados. Usá la misma moneda en ambos importes.";

export default function QuoteResult({ estimate, survey, cameraCount }: { estimate: QuoteEstimate; survey: Survey; cameraCount: number }) {
  return <div className="result">
    <section className="card"><h2>Resumen del proyecto</h2><dl className="summary-grid">
      <div><dt>Cliente</dt><dd>{survey.client}</dd></div><div><dt>Sitio</dt><dd>{survey.site}</dd></div>
      <div><dt>Tipo de sitio</dt><dd>{survey.siteType}</dd></div><div><dt>Cámaras</dt><dd>{cameraCount}</dd></div>
    </dl></section>
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
      <tbody>{estimate.bom.map((item, index) => <tr key={index}><td>{item.category}</td><td>{item.description}</td><td>{item.quantity}</td></tr>)}</tbody>
    </table></div></section>
    <section className="card"><h2>Comercial</h2><dl className="summary-grid">
      <div><dt>Costo total</dt><dd>{money(estimate.total_cost)}</dd></div><div><dt>Margen bruto</dt><dd>{estimate.margin_percent}%</dd></div>
      <div className="sale"><dt>Precio de venta sugerido</dt><dd>{money(estimate.sale_price)}</dd></div>
    </dl><p className="note">{costNotice}</p></section>
    <section className="card"><h2>Advertencias técnicas de la API</h2>{estimate.warnings.length ? <ul className="warnings">{estimate.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : <p className="muted">La API no devolvió advertencias técnicas.</p>}</section>
  </div>;
}
