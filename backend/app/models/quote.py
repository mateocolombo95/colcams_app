from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.alarm import AlarmConfiguration, AlarmEstimate


RecordingMode = Literal["continuous", "events", "undefined"]
ImageObjective = Literal["undefined", "overview", "recognize", "identify"]
NightRequirement = Literal["yes", "no", "undefined"]
NightLighting = Literal["none", "permanent", "motion", "unknown"]
DetectionEvent = Literal["none", "motion", "line_crossing", "intrusion_zone", "undefined"]
DetectionTarget = Literal["any", "person", "vehicle", "person_vehicle", "undefined"]
EventAction = Literal["mobile_notification", "external_siren"]


class CameraSettings(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    resolutionMp: Literal[2, 4, 5, 8] = 4
    connectivity: Literal["poe", "wifi"] = "poe"
    distanceM: float = Field(default=20, ge=0, le=500)
    viewingRange: Literal["near", "medium", "far", "mixed"] = "near"
    targetDistanceM: float | None = Field(default=None, gt=0)
    imageObjective: ImageObjective = "undefined"
    nightObjectiveRequired: NightRequirement = "undefined"
    nightLighting: NightLighting = "unknown"
    nightColorRequired: NightRequirement = "undefined"
    detectionEvent: DetectionEvent = "undefined"
    detectionTarget: DetectionTarget = "undefined"
    eventActions: list[EventAction] = Field(default_factory=list, max_length=2)

    @field_validator("distanceM", "targetDistanceM", mode="before")
    @classmethod
    def reject_boolean_distance(cls, value):
        if isinstance(value, bool):
            raise ValueError("La distancia debe ser un número.")
        return value


class CameraRequirement(CameraSettings):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=500)
    location: str | None = Field(default=None, max_length=2000)
    environment: Literal["indoor", "outdoor"] = "indoor"
    formFactor: Literal["turret", "bullet", "dome", "other"] = "turret"
    notes: str | None = Field(default=None, max_length=5000)
    customized: bool = False


class GlobalCameraDefaults(CameraSettings):
    cameraCount: int = Field(ge=1, le=64)
    outdoorCount: int = Field(default=0, ge=0, le=64)

    @model_validator(mode="after")
    def validate_outdoor_count(self):
        if self.outdoorCount > self.cameraCount:
            raise ValueError("La cantidad de cámaras exteriores supera el total.")
        return self


class CCTVRequirements(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    camera_count: int = Field(ge=1, le=64)
    outdoor_camera_count: int = Field(default=0, ge=0)
    resolution_mp: Literal[2, 4, 5, 8] = 4
    retention_days: int = Field(default=30, ge=1, le=180)
    recording_hours_per_day: float = Field(default=24, gt=0, le=24)
    average_cable_m_per_camera: float = Field(default=20, ge=0, le=500)
    wired_poe: bool = True
    extra_material_cost: float = Field(default=0, ge=0)
    labor_cost: float = Field(default=0, ge=0)
    margin_percent: float = Field(default=35, ge=0, lt=95)
    recordingMode: RecordingMode = "undefined"
    cameras: list[CameraRequirement] = Field(default_factory=list, max_length=64)
    cameraDefaults: GlobalCameraDefaults | None = None
    alarm: AlarmConfiguration | None = None

    @field_validator("retention_days", mode="before")
    @classmethod
    def reject_boolean_retention(cls, value):
        if isinstance(value, bool):
            raise ValueError("La retención debe ser un entero positivo.")
        return value


class BOMItem(BaseModel):
    category: str
    description: str
    quantity: float
    unit_cost: float = 0
    subtotal: float = 0
    source: str = "engine"
    unit: str | None = None
    observations: str | None = None


class QuoteEstimate(BaseModel):
    nvr_channels: int
    storage_tb_raw: float
    storage_tb_selected: int
    poe_ports_required: int
    poe_switch_ports_selected: int | None = None
    estimated_cable_m: float
    bom: list[BOMItem]
    equipment_cost: float
    labor_cost: float
    total_cost: float
    margin_percent: float
    sale_price: float
    warnings: list[str]
    technical_pending: list[str] = Field(default_factory=list)
    storage_hours_per_day: float | None = None
    alarm: AlarmEstimate | None = None
