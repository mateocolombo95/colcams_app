import type { AlarmConfiguration, AlarmEstimate } from "./alarm";

export type QuoteRequest = {
  camera_count: number;
  outdoor_camera_count: number;
  resolution_mp: 2 | 4 | 5 | 8;
  retention_days: number;
  recording_hours_per_day: number;
  average_cable_m_per_camera: number;
  wired_poe: boolean;
  extra_material_cost: number;
  labor_cost: number;
  margin_percent: number;
  alarm?: AlarmConfiguration;
};

export type QuoteEstimate = {
  nvr_channels: number;
  storage_tb_raw: number;
  storage_tb_selected: number;
  poe_ports_required: number;
  poe_switch_ports_selected: number | null;
  estimated_cable_m: number;
  bom: { category: string; description: string; quantity: number; unit_cost: number; subtotal: number; source: string; unit?: string | null; observations?: string | null }[];
  equipment_cost: number;
  labor_cost: number;
  total_cost: number;
  margin_percent: number;
  sale_price: number;
  warnings: string[];
  alarm?: AlarmEstimate | null;
};

export type Survey = {
  client: string;
  site: string;
  siteType: string;
  notes: string;
  cabling: string;
  technicalNotes: string;
  extras: string[];
  extraNotes: string;
};

export type CameraRequirement = {
  id: string;
  name: string;
  location?: string;
  environment: "indoor" | "outdoor";
  formFactor: "turret" | "bullet" | "dome" | "other";
  resolutionMp: 2 | 4 | 5 | 8;
  connectivity: "poe" | "wifi";
  distanceM: number;
  viewingRange: "near" | "medium" | "far" | "mixed";
  targetDistanceM?: number;
  notes?: string;
  customized: boolean;
};

export type GlobalCameraDefaults = {
  cameraCount: number;
  outdoorCount: number;
  resolutionMp: CameraRequirement["resolutionMp"];
  connectivity: CameraRequirement["connectivity"];
  distanceM: number;
  viewingRange: "near" | "medium" | "far" | "mixed";
  targetDistanceM?: number;
};

export type CameraCalculation = {
  payload: QuoteRequest;
  warnings: string[];
  individualDistances: boolean;
  mixedResolutions: boolean;
  mixedConnectivity: boolean;
};
