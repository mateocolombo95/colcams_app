"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { estimateQuote } from "../lib/api";
import { adaptCameraRequirements, createQuoteConfiguration, quoteConfigurationReducer } from "../lib/cameras";
import type { CameraRequirement, QuoteEstimate, QuoteRequest, Survey } from "../types/quote";
import QuoteResult, { costNotice, money } from "./QuoteResult";
import CameraDefaults from "./cameras/CameraDefaults";
import CameraList from "./cameras/CameraList";
import CameraEditor from "./cameras/CameraEditor";
import CameraCalculationNotes from "./cameras/CameraCalculationNotes";

const steps = ["Cliente y sitio", "Cámaras", "Grabación", "Cableado e infraestructura", "Trabajos extraordinarios y extras", "Comercial", "Resultado"];
const extras = ["Albañilería", "Canalización", "Trabajo en altura", "Escalera especial / elevador", "Herrería", "Rack / gabinete", "UPS", "Monitor", "Sirena", "Otro"];
type NumericKey = Exclude<keyof QuoteRequest, "wired_poe" | "resolution_mp">;

export default function QuoteWizard() {
  const [step, setStep] = useState(0);
  const [survey, setSurvey] = useState<Survey>({ client: "", site: "", siteType: "Casa", notes: "", cabling: "Nuevo", technicalNotes: "", extras: [], extraNotes: "" });
  const [{ requirements, cameras, defaults }, dispatch] = useReducer(quoteConfigurationReducer, {
    camera_count: 8, outdoor_camera_count: 3, resolution_mp: 4, retention_days: 30,
    recording_hours_per_day: 24, average_cable_m_per_camera: 25, wired_poe: true,
    extra_material_cost: 0, labor_cost: 0, margin_percent: 35,
  }, createQuoteConfiguration);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<CameraRequirement | null>(null);
  const calculation = useMemo(() => adaptCameraRequirements(requirements, cameras), [requirements, cameras]);
  const [estimate, setEstimate] = useState<QuoteEstimate | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (step !== 6) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 30000);
    setLoading(true);
    setError("");
    setEstimate(null);
    estimateQuote(calculation.payload, controller.signal)
      .then((result) => { if (active) setEstimate(result); })
      .catch((reason: unknown) => {
        if (active) setError(controller.signal.aborted ? "La API tardó demasiado en responder. Volvé a intentar." : reason instanceof Error ? reason.message : "No se pudo calcular la cotización.");
      })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [step, calculation, attempt]);

  function updateSurvey<K extends keyof Survey>(key: K, value: Survey[K]) {
    setSurvey((current) => ({ ...current, [key]: value }));
  }
  function updateRequirements<K extends keyof QuoteRequest>(key: K, value: QuoteRequest[K]) {
    dispatch({ type: "requirements", patch: { [key]: value } });
  }
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStep((current) => Math.min(current + 1, 6));
  }
  function numberField(key: NumericKey, label: string, min: number, max?: number, increment: number | "any" = 1) {
    return <div className="field"><label htmlFor={key}>{label}</label><input id={key} type="number" inputMode={increment === 1 ? "numeric" : "decimal"} required min={min} max={max} step={increment}
      value={Number.isNaN(requirements[key]) ? "" : requirements[key]}
      onChange={(event) => updateRequirements(key, event.target.valueAsNumber)} /></div>;
  }
  function notes(key: "notes" | "technicalNotes" | "extraNotes", label: string) {
    return <div className="field full"><label htmlFor={key}>{label} <span className="optional">· Opcional</span></label><textarea id={key} rows={4} value={survey[key]} onChange={(event) => updateSurvey(key, event.target.value)} /></div>;
  }
  const cost = requirements.extra_material_cost + requirements.labor_cost;
  const recordingSummary = cameras.length + " cámaras · " + calculation.payload.resolution_mp + (calculation.mixedResolutions ? " MP máx. (mixtas)" : " MP") + " · " + requirements.retention_days + " días · " + requirements.recording_hours_per_day + " h/día";

  return <>
    <header className="app-header"><div className="header-inner"><span className="brand-mark" aria-hidden="true">SQ</span><span className="brand">Security Quote</span><span className="header-label">Relevamiento CCTV</span></div></header>
    <main>
      <div className="intro"><p className="eyebrow">NUEVO RELEVAMIENTO</p><h1>De la visita a la propuesta</h1><p className="muted">Registrá los requisitos del sitio y calculá la solución técnica y comercial.</p></div>
      <nav className="progress-card" aria-label="Progreso del relevamiento">
        <div className="progress-caption"><strong>Paso {step + 1} de 7</strong><span>{steps[step]}</span></div>
        <progress value={step + 1} max={7} aria-label="Progreso del wizard" />
        <ol className="step-list">{steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={index < step ? "completed" : ""}><span className="step-number">{index < step ? "✓" : index + 1}</span><span>{label}</span></li>)}</ol>
      </nav>
      <h2 className="step-heading" ref={heading} tabIndex={-1}>{steps[step]}</h2>
      {step < 6 ? <form onSubmit={next}>
        <section className="card form-card">
          {step === 0 && <><p className="section-description">Identificá al cliente y el lugar de la instalación.</p><div className="grid">
            <div className="field"><label htmlFor="client">Nombre del cliente</label><input id="client" autoComplete="name" required pattern=".*\S.*" value={survey.client} onChange={(event) => updateSurvey("client", event.target.value)} /></div>
            <div className="field"><label htmlFor="site">Nombre / referencia del sitio</label><input id="site" required pattern=".*\S.*" value={survey.site} onChange={(event) => updateSurvey("site", event.target.value)} /></div>
            <div className="field"><label htmlFor="siteType">Tipo de sitio</label><select id="siteType" value={survey.siteType} onChange={(event) => updateSurvey("siteType", event.target.value)}>{["Casa", "Departamento", "Comercio", "Oficina", "Galpón", "Consorcio", "Otro"].map((type) => <option key={type}>{type}</option>)}</select></div>
            {notes("notes", "Notas del relevamiento")}
          </div><p className="note">Los datos del sitio se conservan durante este relevamiento. Todavía no se crea ni guarda un proyecto.</p></>}
          {step === 1 && <>
            <CameraDefaults defaults={defaults} onChange={(defaults) => dispatch({ type: "defaults", defaults })} />
            <section className="camera-advanced" aria-labelledby="camera-advanced-title">
              <h3 id="camera-advanced-title">Configuración avanzada por cámara</h3>
              <p className="muted">Todas las cámaras usarán la configuración general salvo que personalices alguna.</p>
              <button type="button" className="secondary" aria-expanded={advancedOpen} aria-controls="camera-advanced-list" onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "Ocultar cámaras" : "Personalizar cámaras"}</button>
              <div id="camera-advanced-list" hidden={!advancedOpen}><CameraList cameras={cameras} onEdit={setEditingCamera} /></div>
              {cameras.some((camera) => camera.customized) && <p className="muted small">Distribución con personalizaciones: {calculation.payload.outdoor_camera_count} exteriores · {cameras.length - calculation.payload.outdoor_camera_count} interiores.</p>}
            </section>
            <CameraCalculationNotes calculation={calculation} />
          </>}
          {step === 2 && <><p className="section-description">Indicá cuánto tiempo necesitás conservar las grabaciones.</p><div className="grid">
            {numberField("retention_days", "Días de retención", 1, 180)}
            {numberField("recording_hours_per_day", "Horas de grabación por día", 0.01, 24, "any")}
          </div><button type="button" className="quick-option" onClick={() => updateRequirements("recording_hours_per_day", 24)} aria-pressed={requirements.recording_hours_per_day === 24}>24/7 · Grabación continua</button><p className="note">{recordingSummary}</p></>}
          {step === 3 && <><p className="section-description">Relevá la infraestructura disponible y los recorridos estimados.</p><div className="grid">
            <div className="field"><label htmlFor="cabling">Cableado</label><select id="cabling" value={survey.cabling} onChange={(event) => updateSurvey("cabling", event.target.value)}>{["Nuevo", "Existente", "Parcial"].map((value) => <option key={value}>{value}</option>)}</select></div>
            <div className="field"><label htmlFor="cable-average">Distancia promedio para el cálculo</label><output id="cable-average" className="calculated">{calculation.payload.wired_poe ? `${calculation.payload.average_cable_m_per_camera.toLocaleString("es-AR", { maximumFractionDigits: 2 })} m por cámara` : "Wi-Fi: sin cable de red ni puertos PoE"}</output><p className="muted small">Las distancias se configuran en el paso Cámaras.</p></div>
            {notes("technicalNotes", "Notas técnicas")}
          </div><CameraCalculationNotes calculation={calculation} /><p className="note">Más adelante esta estimación podrá obtenerse marcando recorridos sobre un plano/mapa.</p><p className="muted small">El estado del cableado y las notas se conservan en el relevamiento. El motor todavía no descuenta cableado existente.</p></>}
          {step === 4 && <><fieldset><legend>Seleccioná los trabajos y equipos necesarios</legend><div className="check-grid">{extras.map((extra) => <label className="check-option" key={extra}><input type="checkbox" checked={survey.extras.includes(extra)} onChange={(event) => updateSurvey("extras", event.target.checked ? [...survey.extras, extra] : survey.extras.filter((item) => item !== extra))} /><span>{extra}</span></label>)}</div></fieldset>
            <p className="muted small">Las selecciones documentan la visita. Cargá sus importes totales a continuación; no agregan costos automáticamente.</p><div className="grid">
              {numberField("extra_material_cost", "Materiales / equipos adicionales ($)", 0, undefined, 0.01)}
              {numberField("labor_cost", "Mano de obra ($)", 0, undefined, 0.01)}
              {notes("extraNotes", "Notas de trabajos y extras")}
            </div></>}
          {step === 5 && <><p className="section-description">Definí la rentabilidad de la propuesta.</p><div className="grid">{numberField("margin_percent", "Margen bruto (%)", 0, 94.99, 0.01)}</div>
            <p><strong>Margen bruto, no markup</strong></p><p className="muted">Precio de venta = costo total / (1 − margen / 100).</p>
            {cost > 0 && Number.isFinite(requirements.margin_percent) && requirements.margin_percent >= 0 && requirements.margin_percent < 95 ? <div className="preview"><span>Previsualización sobre costos ingresados</span><strong>{money(cost / (1 - requirements.margin_percent / 100))}</strong><span>Costo: {money(cost)} · Margen: {requirements.margin_percent}%</span></div> : <p className="note">Ingresá costos en el paso anterior para previsualizar el precio de venta.</p>}
            <p className="note">{costNotice}</p><CameraCalculationNotes calculation={calculation} /></>}
        </section>
        <div className="actions"><button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>Anterior</button><button type="submit" className="primary">{step === 5 ? "Calcular resultado" : "Continuar"} <span aria-hidden="true">→</span></button></div>
      </form> : <>
        <CameraCalculationNotes calculation={calculation} />
        <div aria-live="polite" aria-busy={loading}>{loading && <div className="card loading" role="status">Calculando la solución técnica y comercial…</div>}</div>
        {error && <div className="error" role="alert">{error}</div>}
        {estimate && <QuoteResult estimate={estimate} survey={survey} cameras={cameras} />}
        <div className="actions"><button type="button" className="secondary" onClick={() => { setError(""); setStep(5); }}>Volver y editar</button><button type="button" className="primary" disabled={loading} onClick={() => setAttempt((current) => current + 1)}>{loading ? "Calculando…" : "Recalcular"}</button></div>
      </>}
      {editingCamera && <CameraEditor camera={editingCamera} onSave={(camera) => dispatch({ type: "saveCamera", camera })} onReset={(id) => dispatch({ type: "resetCamera", id })} onClose={() => setEditingCamera(null)} />}
      <p className="session-note">Borrador de la visita · Los datos se conservan entre pasos, hasta recargar o cerrar esta página.</p>
    </main>
  </>;
}
