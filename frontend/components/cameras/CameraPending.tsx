export default function CameraPending({ pending, collapsible = false }: { pending: string[]; collapsible?: boolean }) {
  if (!pending.length) return null;
  return <section className="card calculation-warning" aria-labelledby="technical-pending-title">
    <h2 id="technical-pending-title">Pendientes técnicos / comerciales</h2>
    <p>Se puede guardar el proyecto con estos requisitos pendientes.</p>
    {collapsible ? <details><summary>Ver {pending.length} pendientes</summary><ul>{pending.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details> : <ul>{pending.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}
  </section>;
}
