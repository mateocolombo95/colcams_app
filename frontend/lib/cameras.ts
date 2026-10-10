import type { CameraAssessment, CameraCalculation, CameraRequirement, GlobalCameraDefaults, ImageObjective, Project, QuoteRequest, RecordingMode, Survey } from "../types/quote";

export const environmentLabels = { indoor: "Interior", outdoor: "Exterior" };
export const formFactorLabels = { turret: "Torreta", bullet: "Tipo bala", dome: "Domo", other: "Otro" };
export const connectivityLabels = { poe: "PoE", wifi: "Wi-Fi" };
export const imageObjectiveLabels = { undefined: "Sin definir", overview: "Vista general", recognize: "Reconocer", identify: "Identificar" };
export const imageObjectiveHelp = {
  undefined: "Definí qué detalle necesita el cliente; puede quedar pendiente en el borrador.",
  overview: "Ver qué ocurre en el ambiente o sector.",
  recognize: "Poder reconocer una persona conocida o distinguir un objeto conocido.",
  identify: "Obtener suficiente detalle para identificar a una persona o distinguir características específicas.",
};
export const nightObjectiveLabels = { yes: "Sí", no: "No", undefined: "A definir" };
export const nightLightingLabels = { none: "Sin iluminación", permanent: "Iluminación permanente", motion: "Iluminación que se enciende por movimiento", unknown: "A verificar" };
export const nightColorLabels = { yes: "Sí", no: "No, acepta blanco y negro", undefined: "A definir" };
export const recordingModeLabels = { continuous: "Continua", events: "Solo ante eventos", undefined: "A definir" };
export const recordingModeHelp = {
  continuous: "Registrar durante todo el día, incluyendo períodos sin eventos.",
  events: "Registrar cuando se produzca el evento configurado.",
  undefined: "La modalidad puede quedar pendiente; el cálculo será provisional.",
};
export const detectionEventLabels = { none: "Sin detección adicional solicitada", motion: "Movimiento dentro de la imagen", line_crossing: "Cruce de una línea virtual", intrusion_zone: "Ingreso o permanencia en una zona definida", undefined: "A definir" };
export const detectionEventHelp = {
  none: "No se solicitó detección adicional.",
  motion: "Cambio general dentro de la escena.",
  line_crossing: "Un objeto cruza una línea virtual.",
  intrusion_zone: "Un objeto ingresa o permanece en un área definida.",
  undefined: "Puede quedar pendiente en el borrador.",
};
export const detectionTargetLabels = { any: "Cualquier movimiento u objeto", person: "Personas", vehicle: "Vehículos", person_vehicle: "Personas y vehículos", undefined: "A definir" };
export const eventActionLabels = { mobile_notification: "Aviso al celular", external_siren: "Activación de una sirena externa" };
export const externalSirenChecklist = ["equipo que ejecutará la acción", "salida o interfaz necesaria", "relé/contacto seco si aplica", "alimentación", "compatibilidad", "materiales adicionales", "configuración"];

export function getNightObjectiveHelp(objective: ImageObjective): string {
  if (objective === "identify") return "¿También necesita poder identificar de noche?";
  if (objective === "recognize") return "¿También necesita poder reconocer de noche?";
  if (objective === "overview") return "¿También necesita ver qué ocurre de noche?";
  return "Definí si el objetivo de imagen también debe cumplirse de noche.";
}

// Missing answers remain pending, including records created before these fields existed.
function normalizeAssessment(value: Partial<CameraAssessment> = {}): CameraAssessment {
  return {
    imageObjective: value.imageObjective ?? "undefined",
    nightObjectiveRequired: value.nightObjectiveRequired ?? "undefined",
    nightLighting: value.nightLighting ?? "unknown",
    nightColorRequired: value.nightColorRequired ?? "undefined",
    detectionEvent: value.detectionEvent ?? "undefined",
    detectionTarget: value.detectionTarget ?? "undefined",
    eventActions: Array.isArray(value.eventActions) ? [...value.eventActions] : value.eventActions ?? [],
  };
}

export function normalizeCamera(camera: CameraRequirement): CameraRequirement {
  return { ...camera, viewingRange: camera.viewingRange ?? "near", targetDistanceM: camera.targetDistanceM ?? undefined, ...normalizeAssessment(camera) };
}

export function normalizeCameraDefaults(defaults: GlobalCameraDefaults): GlobalCameraDefaults {
  return { ...defaults, viewingRange: defaults.viewingRange ?? "near", targetDistanceM: defaults.targetDistanceM ?? undefined, ...normalizeAssessment(defaults) };
}

export function normalizeQuoteRequirements(requirements: QuoteRequest): QuoteRequest {
  return {
    ...requirements,
    recordingMode: requirements.recordingMode ?? "undefined",
    ...(requirements.cameras ? { cameras: requirements.cameras.map(normalizeCamera) } : {}),
    ...(requirements.cameraDefaults ? { cameraDefaults: normalizeCameraDefaults(requirements.cameraDefaults) } : {}),
  };
}

export function normalizeProjectSurvey(project: Project): Survey {
  return {
    client: project.customer_name ?? "", site: project.site_name ?? "", siteType: "",
    notes: project.notes ?? "", cabling: "", technicalNotes: "", extras: [], extraNotes: "",
    ...project.survey,
  };
}

export function getCameraDefaults(requirements: QuoteRequest, visual: Partial<GlobalCameraDefaults> = requirements.cameraDefaults ?? {}): GlobalCameraDefaults {
  return {
    cameraCount: requirements.camera_count,
    outdoorCount: requirements.outdoor_camera_count,
    resolutionMp: requirements.resolution_mp,
    connectivity: requirements.wired_poe ? "poe" : "wifi",
    distanceM: requirements.average_cable_m_per_camera,
    viewingRange: visual.viewingRange ?? "near", targetDistanceM: visual.targetDistanceM ?? undefined,
    ...normalizeAssessment(visual),
  };
}

export function validCameraDefaults(defaults: GlobalCameraDefaults): boolean {
  return Number.isInteger(defaults.cameraCount) && defaults.cameraCount >= 1 && defaults.cameraCount <= 64
    && Number.isInteger(defaults.outdoorCount) && defaults.outdoorCount >= 0 && defaults.outdoorCount <= defaults.cameraCount
    && Number.isFinite(defaults.distanceM) && defaults.distanceM >= 0 && defaults.distanceM <= 500
    && Object.hasOwn(viewingRangeLabels, defaults.viewingRange)
    && [2, 4, 5, 8].includes(defaults.resolutionMp)
    && Object.hasOwn(connectivityLabels, defaults.connectivity)
    && (defaults.targetDistanceM === undefined || (Number.isFinite(defaults.targetDistanceM) && defaults.targetDistanceM > 0))
    && validAssessment(defaults);
}

function validAssessment(value: Partial<CameraAssessment>): boolean {
  const normalized = normalizeAssessment(value);
  return Object.hasOwn(imageObjectiveLabels, normalized.imageObjective)
    && Object.hasOwn(nightObjectiveLabels, normalized.nightObjectiveRequired)
    && Object.hasOwn(nightLightingLabels, normalized.nightLighting)
    && Object.hasOwn(nightColorLabels, normalized.nightColorRequired)
    && Object.hasOwn(detectionEventLabels, normalized.detectionEvent)
    && Object.hasOwn(detectionTargetLabels, normalized.detectionTarget)
    && Array.isArray(normalized.eventActions)
    && normalized.eventActions.every(action => Object.hasOwn(eventActionLabels, action));
}

export function validCameraRequirement(camera: CameraRequirement): boolean {
  return Boolean(camera.id?.trim() && camera.name?.trim())
    && Object.hasOwn(environmentLabels, camera.environment)
    && Object.hasOwn(formFactorLabels, camera.formFactor)
    && Object.hasOwn(connectivityLabels, camera.connectivity)
    && [2, 4, 5, 8].includes(camera.resolutionMp)
    && Number.isFinite(camera.distanceM) && camera.distanceM >= 0 && camera.distanceM <= 500
    && Object.hasOwn(viewingRangeLabels, camera.viewingRange)
    && (camera.targetDistanceM === undefined || (Number.isFinite(camera.targetDistanceM) && camera.targetDistanceM > 0))
    && validAssessment(camera);
}

export function createCamera(index: number, defaults: GlobalCameraDefaults): CameraRequirement {
  return {
    id: `C${index + 1}`,
    name: `Cámara ${index + 1}`,
    environment: index < defaults.outdoorCount ? "outdoor" : "indoor",
    formFactor: "turret",
    resolutionMp: defaults.resolutionMp,
    connectivity: defaults.connectivity,
    distanceM: defaults.distanceM,
    viewingRange: defaults.viewingRange, targetDistanceM: defaults.targetDistanceM,
    ...normalizeAssessment(defaults),
    customized: false,
  };
}

// A customized camera is a complete saved configuration. Only reset restores inheritance.
export function syncCameras(cameras: CameraRequirement[], defaults: GlobalCameraDefaults): CameraRequirement[] {
  if (!validCameraDefaults(defaults)) throw new Error("La configuración general de cámaras no es válida.");
  return Array.from({ length: defaults.cameraCount }, (_, index) => {
    const previous = cameras.find((camera) => camera.id === `C${index + 1}`);
    return previous?.customized ? previous : createCamera(index, defaults);
  });
}

export type QuoteConfiguration = { requirements: QuoteRequest; cameras: CameraRequirement[]; defaults: GlobalCameraDefaults };
type ConfigurationAction =
  | { type: "requirements"; patch: Partial<QuoteRequest> }
  | { type: "defaults"; defaults: GlobalCameraDefaults }
  | { type: "saveCamera"; camera: CameraRequirement }
  | { type: "resetCamera"; id: string }
  | { type: "loadProject"; project: Project };

export function createQuoteConfiguration(requirements: QuoteRequest, cameras = requirements.cameras, savedDefaults = requirements.cameraDefaults): QuoteConfiguration {
  const normalized = normalizeQuoteRequirements(requirements);
  // Persisted aggregates may include custom cameras; the saved defaults are the baseline.
  const defaults = savedDefaults
    ? normalizeCameraDefaults({ ...getCameraDefaults(normalized), ...savedDefaults, targetDistanceM: savedDefaults.targetDistanceM === 0 ? undefined : savedDefaults.targetDistanceM })
    : getCameraDefaults(normalized);
  const baseline = {
    ...normalized,
    camera_count: defaults.cameraCount, outdoor_camera_count: defaults.outdoorCount,
    resolution_mp: defaults.resolutionMp, wired_poe: defaults.connectivity === "poe",
    average_cable_m_per_camera: defaults.distanceM,
  };
  const inherited = syncCameras([], defaults);
  // Opening a saved project must preserve its individual values before any defaults edit.
  return {
    requirements: baseline, defaults,
    cameras: inherited.map((camera, index) => {
      const saved = cameras?.find(record => record.id === camera.id) ?? cameras?.[index];
      return saved ? normalizeCamera({ ...camera, ...saved, ...normalizeAssessment(saved), targetDistanceM: saved.targetDistanceM === 0 ? undefined : saved.targetDistanceM }) : camera;
    }),
  };
}

export function quoteConfigurationReducer(state: QuoteConfiguration, action: ConfigurationAction): QuoteConfiguration {
  if (action.type === "loadProject") return createQuoteConfiguration(action.project.requirements);
  if (action.type === "saveCamera") {
    if (!validCameraRequirement(action.camera)) throw new Error("La configuración de la cámara no es válida. La distancia al objetivo debe ser positiva si se ingresó.");
    return { ...state, cameras: state.cameras.map((camera) => camera.id === action.camera.id ? { ...action.camera, customized: true } : camera) };
  }
  if (action.type === "resetCamera") {
    return { ...state, cameras: state.cameras.map((camera, index) => camera.id === action.id ? createCamera(index, state.defaults) : camera) };
  }
  const patch: Partial<QuoteRequest> = action.type === "defaults" ? {
    camera_count: action.defaults.cameraCount,
    outdoor_camera_count: action.defaults.outdoorCount,
    resolution_mp: action.defaults.resolutionMp,
    wired_poe: action.defaults.connectivity === "poe",
    average_cable_m_per_camera: action.defaults.distanceM,
  } : action.patch;
  const requirements = { ...state.requirements, ...patch };
  const defaults = action.type === "defaults" ? action.defaults : getCameraDefaults(requirements, state.defaults);
  const cameraDefaultsChanged = action.type === "defaults"
    || ["camera_count", "outdoor_camera_count", "resolution_mp", "wired_poe", "average_cable_m_per_camera"].some(key => Object.hasOwn(patch, key));
  return { requirements, defaults, cameras: cameraDefaultsChanged ? syncCameras(state.cameras, defaults) : state.cameras };
}

// Keep the existing conservative aggregate calculation and send the full survey for persistence.
export function adaptCameraRequirements(requirements: QuoteRequest, cameras: CameraRequirement[], defaults = getCameraDefaults(requirements)): CameraCalculation {
  const poeCameras = cameras.filter((camera) => camera.connectivity === "poe");
  const individualDistances = cameras.some((camera) => camera.customized);
  const mixedConnectivity = poeCameras.length > 0 && poeCameras.length < cameras.length;
  const mixedResolutions = new Set(cameras.map((camera) => camera.resolutionMp)).size > 1;
  const resolution = cameras.reduce<CameraRequirement["resolutionMp"]>((highest, camera) => camera.resolutionMp > highest ? camera.resolutionMp : highest, 2);
  const averageDistance = individualDistances
    ? (poeCameras.length ? poeCameras.reduce((total, camera) => total + camera.distanceM, 0) / poeCameras.length : 0)
    : requirements.average_cable_m_per_camera;
  const warnings: string[] = [];
  if (mixedConnectivity) warnings.push("Esta versión del motor todavía no calcula instalaciones mixtas PoE/Wi-Fi con precisión.");
  if (mixedResolutions) warnings.push("Almacenamiento calculado de forma conservadora usando la mayor resolución del proyecto. El motor por cámara se implementará posteriormente.");
  return {
    payload: {
      ...requirements,
      camera_count: cameras.length,
      outdoor_camera_count: cameras.filter((camera) => camera.environment === "outdoor").length,
      resolution_mp: resolution,
      wired_poe: poeCameras.length > 0,
      average_cable_m_per_camera: averageDistance,
      recordingMode: requirements.recordingMode ?? "undefined",
      cameras: cameras.map(normalizeCamera),
      cameraDefaults: normalizeCameraDefaults(defaults),
    },
    warnings, individualDistances, mixedConnectivity, mixedResolutions,
  };
}

export function getCameraPending(camera: CameraRequirement, recordingMode: RecordingMode = "undefined"): string[] {
  const normalized = normalizeCamera(camera);
  const pending: string[] = [];
  if (normalized.imageObjective === "undefined") pending.push("Definir objetivo de imagen.");
  if ((normalized.imageObjective === "recognize" || normalized.imageObjective === "identify") && normalized.targetDistanceM === undefined) {
    pending.push(normalized.imageObjective === "recognize" ? "Definir distancia de reconocimiento." : "Definir distancia de identificación.");
  }
  if (normalized.nightObjectiveRequired === "undefined") pending.push("Definir si necesita cumplir el objetivo de noche.");
  if (normalized.nightObjectiveRequired === "yes") {
    if (normalized.nightLighting === "unknown") pending.push("Verificar iluminación nocturna.");
    if (normalized.nightColorRequired === "undefined") pending.push("Definir necesidad de color nocturno.");
  }
  if (recordingMode === "events" && (normalized.detectionEvent === "undefined" || normalized.detectionEvent === "none")) pending.push("Definir evento para grabación por eventos.");
  if (normalized.detectionEvent !== "none" && normalized.detectionEvent !== "undefined" && normalized.detectionTarget === "undefined") pending.push("Definir qué debe generar el evento.");
  if (normalized.eventActions.includes("external_siren")) pending.push("Verificar integración de sirena externa: equipo que ejecutará la acción, salida o interfaz necesaria, relé/contacto seco si aplica, alimentación, compatibilidad, materiales adicionales y configuración.");
  return pending;
}

export function getProjectPending(requirements: QuoteRequest, cameras: CameraRequirement[] = requirements.cameras ?? []): string[] {
  const recordingMode = requirements.recordingMode ?? "undefined";
  return [
    ...(recordingMode === "undefined" ? ["Definir modalidad de grabación."] : []),
    ...cameras.flatMap(camera => getCameraPending(camera, recordingMode).map(item => `Cámara ${camera.id}: ${item}`)),
  ];
}

export const viewingRangeLabels = { near: "Vista general / corta distancia", medium: "Distancia media", far: "Objetivo lejano", mixed: "Cercano y lejano" };
// Review threshold, not an optical limit. No DORI calculation.
const LONG_TARGET_DISTANCE_M = 20;
export function getLensRecommendation(camera: Pick<CameraRequirement, "viewingRange" | "targetDistanceM">): { text: string; warnings: string[] } {
  const texts = {
    near: "Priorizar campo de visión amplio. Considerar lente angular, por ejemplo 2.8–4 mm.",
    medium: "Buscar equilibrio entre cobertura y detalle. Considerar aproximadamente 4–6 mm o verificar según geometría.",
    far: "Se requiere mayor detalle a distancia. Considerar lente más cerrado o cámara varifocal, por ejemplo 6–12 mm.",
    mixed: "Se requiere cubrir zona cercana y distante. Evaluar cámara varifocal o cámaras separadas, ya que un único lente puede no resolver ambos objetivos correctamente.",
  };
  const warnings: string[] = [];
  if (camera.viewingRange === "mixed") warnings.push("Los requerimientos de vista general y detalle a larga distancia pueden ser incompatibles en una única cámara. Evaluar cámara varifocal o una segunda cámara dedicada.");
  if (camera.targetDistanceM !== undefined && camera.targetDistanceM >= LONG_TARGET_DISTANCE_M) {
    if (camera.viewingRange === "far") warnings.push("Objetivo ubicado a larga distancia. Evitar seleccionar una cámara únicamente por resolución; verificar lente y nivel de detalle requerido.");
    if (camera.viewingRange === "near") warnings.push("La distancia indicada parece elevada para una configuración de vista cercana. Revisar el requerimiento.");
  }
  return { text: texts[camera.viewingRange], warnings };
}
