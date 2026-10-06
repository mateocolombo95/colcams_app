"""Independent alarm contracts; camelCase matches the browser's subsystem payload."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


AlarmSystemType = Literal["auto", "wired", "wireless", "hybrid"]
AlarmObjective = Literal[
    "interior_intrusion", "perimeter", "access_protection", "technical_detection"
]
AlarmDeviceType = Literal[
    "pir_indoor", "pir_outdoor", "magnetic_contact", "beam", "glass_break",
    "smoke", "gas", "flood", "panic_button", "other",
]
AlarmCommunication = Literal["ethernet", "wifi", "lte", "telephone"]


class AlarmDeviceRequirement(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    id: str = Field(min_length=1, max_length=150)
    name: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=300)
    type: AlarmDeviceType
    quantity: int = Field(default=1, ge=1, le=1000)
    connection: Literal["auto", "wired", "wireless"] = "auto"
    requiresSeparateZone: bool = True
    zoneGroup: str | None = Field(default=None, max_length=150)
    cableDistanceM: float | None = Field(default=None, ge=0, le=500)
    notes: str | None = Field(default=None, max_length=2000)
    customized: bool = False


class AlarmConfiguration(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    enabled: bool = False
    mode: Literal["automatic", "custom"] = "automatic"
    systemType: AlarmSystemType = "auto"
    objectives: list[AlarmObjective] = Field(default_factory=lambda: ["interior_intrusion"])
    devices: list[AlarmDeviceRequirement] = Field(default_factory=list, max_length=500)
    expansionReservePercent: float = Field(default=20, ge=0, le=100)
    panelMode: Literal["automatic", "manual"] = "automatic"
    panelZones: int | None = Field(default=None, ge=1, le=10000)
    keypadCount: int = Field(default=1, ge=0, le=128)
    keypadType: Literal["lcd", "touch", "wireless"] = "lcd"
    indoorSirens: int = Field(default=1, ge=0, le=128)
    outdoorSirens: int = Field(default=0, ge=0, le=128)
    outdoorSirenWithStrobe: bool = False
    communications: list[AlarmCommunication] = Field(default_factory=list)
    partitions: int = Field(default=1, ge=1, le=64)
    remoteAppRequired: bool = False
    pushNotificationsRequired: bool = False
    professionalMonitoringRequired: bool = False
    localOnly: bool = False
    backupAutonomyHours: float = Field(default=4, ge=0, le=168)
    auxiliaryPowerMode: Literal["automatic", "yes", "no"] = "automatic"
    tamperRequired: bool = True
    averageCableMPerWiredDevice: float = Field(default=20, ge=0, le=500)

    @model_validator(mode="after")
    def validate_unique_devices(self):
        ids = [device.id for device in self.devices]
        if len(ids) != len(set(ids)):
            raise ValueError("Los dispositivos de alarma deben tener identificadores únicos.")
        if sum(device.quantity for device in self.devices) > 10000:
            raise ValueError("El relevamiento admite hasta 10000 dispositivos de alarma.")
        # Repeated selections must not duplicate communications hardware or consumption.
        self.communications = list(dict.fromkeys(self.communications))
        self.objectives = list(dict.fromkeys(self.objectives))
        return self


class AlarmResolvedDevice(AlarmDeviceRequirement):
    connection: Literal["wired", "wireless"]
    zoneLabel: str


class AlarmEstimate(BaseModel):
    systemType: Literal["wired", "wireless", "hybrid"]
    deviceCount: int
    wiredDeviceCount: int
    wirelessDeviceCount: int
    zonesRequired: int
    zonesWithReserve: int
    expansionReservePercent: float
    recommendedPanelZones: int | None
    selectedPanelZones: int | None
    panelOverridden: bool
    expanderCount: int
    expanderZones: int = 8
    installedZoneCapacity: int | None
    estimatedLoadW: float
    batteryWhRequired: float
    batteryAhApprox: float
    batteryAhSelected: int | None
    auxiliaryPowerRequired: bool
    estimatedCableM: float
    warnings: list[str]
    devices: list[AlarmResolvedDevice]
    configuration: AlarmConfiguration
