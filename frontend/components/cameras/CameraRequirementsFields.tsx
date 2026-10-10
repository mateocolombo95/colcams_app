import type { ReactNode } from "react";
import {
  detectionEventHelp, detectionEventLabels, detectionTargetLabels, eventActionLabels,
  getNightObjectiveHelp, imageObjectiveHelp, imageObjectiveLabels,
  nightColorLabels, nightLightingLabels, nightObjectiveLabels,
} from "../../lib/cameras";
import type { CameraRequirement } from "../../types/quote";

type RequirementFields = Pick<CameraRequirement, "imageObjective" | "nightObjectiveRequired" | "nightLighting" | "nightColorRequired" | "detectionEvent" | "detectionTarget" | "eventActions" | "targetDistanceM">;
type Props = {
  values: RequirementFields;
  prefix: string;
  onChange: (patch: Partial<RequirementFields>) => void;
  targetDistanceField: ReactNode;
};

export default function CameraRequirementsFields({ values, prefix, onChange, targetDistanceField }: Props) {
  const objective = values.imageObjective ?? "undefined";
  const event = values.detectionEvent ?? "undefined";
  const hasEvent = event !== "none" && event !== "undefined";
  const needsDistance = objective === "recognize" || objective === "identify";
  return <div className="camera-requirements">
    <h4>Requisitos de imagen y detección</h4>
    <p className="muted small">Documentan lo que necesita el cliente. La capacidad del equipo se verificará al seleccionarlo.</p>
    <div className="grid">
      <div className="field"><label htmlFor={`${prefix}-image-objective`}>Objetivo de imagen</label><select id={`${prefix}-image-objective`} value={objective} onChange={e => onChange({ imageObjective: e.target.value as CameraRequirement["imageObjective"] })}>{Object.entries(imageObjectiveLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><p className="muted small">{imageObjectiveHelp[objective]}</p></div>
      {needsDistance || values.targetDistanceM !== undefined ? targetDistanceField : <details className="field"><summary>Distancia al objetivo · Opcional</summary>{targetDistanceField}</details>}
      {needsDistance && values.targetDistanceM === undefined && <p className="note full">Pendiente: definir la distancia de {objective === "identify" ? "identificación" : "reconocimiento"}. Podés guardar el borrador.</p>}
      <div className="field full"><label htmlFor={`${prefix}-night-objective`}>¿Necesita cumplir este mismo objetivo de noche?</label><select id={`${prefix}-night-objective`} value={values.nightObjectiveRequired ?? "undefined"} onChange={e => onChange({ nightObjectiveRequired: e.target.value as CameraRequirement["nightObjectiveRequired"] })}>{Object.entries(nightObjectiveLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><p className="muted small">{getNightObjectiveHelp(objective)}</p></div>
      {values.nightObjectiveRequired === "yes" && <>
        <div className="field"><label htmlFor={`${prefix}-night-lighting`}>Iluminación disponible de noche</label><select id={`${prefix}-night-lighting`} value={values.nightLighting ?? "unknown"} onChange={e => onChange({ nightLighting: e.target.value as CameraRequirement["nightLighting"] })}>{Object.entries(nightLightingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="field"><label htmlFor={`${prefix}-night-color`}>¿Necesita imagen en color de noche?</label><select id={`${prefix}-night-color`} value={values.nightColorRequired ?? "undefined"} onChange={e => onChange({ nightColorRequired: e.target.value as CameraRequirement["nightColorRequired"] })}>{Object.entries(nightColorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <p className="muted small full">El color nocturno no garantiza el nivel de detalle solicitado. Estos requisitos necesitan revisión técnica.</p>
      </>}
      <div className="field full"><label htmlFor={`${prefix}-detection-event`}>Evento que necesita detectar</label><select id={`${prefix}-detection-event`} value={event} onChange={e => onChange({ detectionEvent: e.target.value as CameraRequirement["detectionEvent"] })}>{Object.entries(detectionEventLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><p className="muted small">{detectionEventHelp[event]}</p></div>
      {hasEvent && <>
        <div className="field full"><label htmlFor={`${prefix}-detection-target`}>¿Qué debe generar el evento?</label><select id={`${prefix}-detection-target`} value={values.detectionTarget ?? "undefined"} onChange={e => onChange({ detectionTarget: e.target.value as CameraRequirement["detectionTarget"] })}>{Object.entries(detectionTargetLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><p className="muted small">La clasificación de personas o vehículos debe verificarse en el equipo.</p></div>
        <fieldset className="full"><legend>Acciones del evento</legend><div className="check-grid">{Object.entries(eventActionLabels).map(([key, label]) => {
          const action = key as NonNullable<CameraRequirement["eventActions"]>[number];
          const actions = values.eventActions ?? [];
          return <label className="check-option" key={key}><input type="checkbox" checked={actions.includes(action)} onChange={e => onChange({ eventActions: e.target.checked ? [...actions, action] : actions.filter(value => value !== action) })} /><span>{label}</span></label>;
        })}</div><p className="muted small">La grabación es independiente de estas acciones.</p></fieldset>
      </>}
      {(values.eventActions ?? []).includes("external_siren") && <p className="note full">Pendiente: verificar integración de sirena externa: equipo que ejecutará la acción, salida o interfaz, relé/contacto seco, alimentación, compatibilidad, materiales adicionales y configuración.</p>}
    </div>
  </div>;
}
