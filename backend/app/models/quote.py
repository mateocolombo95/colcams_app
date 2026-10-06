from typing import Literal

from pydantic import BaseModel, Field

from app.models.alarm import AlarmConfiguration, AlarmEstimate


class CCTVRequirements(BaseModel):
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
    alarm: AlarmConfiguration | None = None


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
    alarm: AlarmEstimate | None = None
