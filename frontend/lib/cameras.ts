import type { CameraCalculation, CameraRequirement, GlobalCameraDefaults, QuoteRequest } from "../types/quote";

export const environmentLabels = { indoor: "Interior", outdoor: "Exterior" };
export const formFactorLabels = { turret: "Turret", bullet: "Bullet", dome: "Dome", other: "Otro" };
export const connectivityLabels = { poe: "PoE", wifi: "Wi-Fi" };

export function getCameraDefaults(requirements: QuoteRequest, visual: Pick<GlobalCameraDefaults, "viewingRange" | "targetDistanceM"> = { viewingRange: "near" }): GlobalCameraDefaults {
  return {
    cameraCount: requirements.camera_count,
    outdoorCount: requirements.outdoor_camera_count,
    resolutionMp: requirements.resolution_mp,
    connectivity: requirements.wired_poe ? "poe" : "wifi",
    distanceM: requirements.average_cable_m_per_camera,
    viewingRange: visual.viewingRange, targetDistanceM: visual.targetDistanceM,
  };
}

export function validCameraDefaults(defaults: GlobalCameraDefaults): boolean {
  return Number.isInteger(defaults.cameraCount) && defaults.cameraCount >= 1 && defaults.cameraCount <= 64
    && Number.isInteger(defaults.outdoorCount) && defaults.outdoorCount >= 0 && defaults.outdoorCount <= defaults.cameraCount
    && Number.isFinite(defaults.distanceM) && defaults.distanceM >= 0 && defaults.distanceM <= 500
    && Object.hasOwn(viewingRangeLabels, defaults.viewingRange)
    && (defaults.targetDistanceM === undefined || (Number.isFinite(defaults.targetDistanceM) && defaults.targetDistanceM >= 0));
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
  | { type: "resetCamera"; id: string };

export function createQuoteConfiguration(requirements: QuoteRequest): QuoteConfiguration {
  const defaults = getCameraDefaults(requirements);
  return { requirements, defaults, cameras: syncCameras([], defaults) };
}

export function quoteConfigurationReducer(state: QuoteConfiguration, action: ConfigurationAction): QuoteConfiguration {
  if (action.type === "saveCamera") {
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
  return { requirements, defaults, cameras: syncCameras(state.cameras, defaults) };
}

// Keep the API's existing aggregate schema. Individual detail stays in the frontend.
export function adaptCameraRequirements(requirements: QuoteRequest, cameras: CameraRequirement[]): CameraCalculation {
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
    },
    warnings, individualDistances, mixedConnectivity, mixedResolutions,
  };
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
