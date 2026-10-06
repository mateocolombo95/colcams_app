export type AlarmSystemType = "auto" | "wired" | "wireless" | "hybrid";
export type AlarmObjective = "interior_intrusion" | "perimeter" | "access_protection" | "technical_detection";
export type AlarmDeviceType = "pir_indoor" | "pir_outdoor" | "magnetic_contact" | "beam" | "glass_break" | "smoke" | "gas" | "flood" | "panic_button" | "other";
export type AlarmCommunication = "ethernet" | "wifi" | "lte" | "telephone";
export type AlarmConnection = "auto" | "wired" | "wireless";

export interface AlarmDeviceRequirement {
  id: string;
  name: string;
  location?: string;
  type: AlarmDeviceType;
  quantity: number;
  connection: AlarmConnection;
  requiresSeparateZone: boolean;
  zoneGroup?: string;
  cableDistanceM?: number;
  notes?: string;
  customized?: boolean;
}

export interface AlarmConfiguration {
  enabled: boolean;
  mode: "automatic" | "custom";
  systemType: AlarmSystemType;
  objectives: AlarmObjective[];
  devices: AlarmDeviceRequirement[];
  expansionReservePercent: number;
  panelMode: "automatic" | "manual";
  panelZones?: number;
  keypadCount: number;
  keypadType: "lcd" | "touch" | "wireless";
  indoorSirens: number;
  outdoorSirens: number;
  outdoorSirenWithStrobe: boolean;
  communications: AlarmCommunication[];
  partitions: number;
  remoteAppRequired: boolean;
  pushNotificationsRequired: boolean;
  professionalMonitoringRequired: boolean;
  localOnly: boolean;
  backupAutonomyHours: number;
  auxiliaryPowerMode: "automatic" | "yes" | "no";
  tamperRequired: boolean;
  averageCableMPerWiredDevice: number;
}

export interface ResolvedAlarmDevice extends Omit<AlarmDeviceRequirement, "connection"> {
  connection: "wired" | "wireless";
  zoneLabel: string;
}

export interface AlarmEstimate {
  systemType: Exclude<AlarmSystemType, "auto">;
  deviceCount: number;
  wiredDeviceCount: number;
  wirelessDeviceCount: number;
  zonesRequired: number;
  zonesWithReserve: number;
  expansionReservePercent: number;
  recommendedPanelZones: number | null;
  selectedPanelZones: number | null;
  panelOverridden: boolean;
  expanderCount: number;
  expanderZones: number;
  installedZoneCapacity: number | null;
  estimatedLoadW: number;
  batteryWhRequired: number;
  batteryAhApprox: number;
  batteryAhSelected: number | null;
  auxiliaryPowerRequired: boolean;
  estimatedCableM: number;
  warnings: string[];
  devices: ResolvedAlarmDevice[];
  configuration: AlarmConfiguration;
}
