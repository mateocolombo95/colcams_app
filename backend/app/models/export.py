from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.quote import QuoteEstimate


class ExportCamera(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: str = Field(max_length=100)
    name: str = Field(max_length=500)
    location: str | None = Field(default=None, max_length=2000)
    environment: Literal["indoor", "outdoor"]
    formFactor: Literal["turret", "bullet", "dome", "other"]
    resolutionMp: Literal[2, 4, 5, 8]
    connectivity: Literal["poe", "wifi"]
    distanceM: float = Field(ge=0, le=500)
    viewingRange: Literal["near", "medium", "far", "mixed"]
    targetDistanceM: float | None = Field(default=None, ge=0)
    lensRecommendation: str = Field(max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)


class MaterialsExport(BaseModel):
    client: str | None = Field(default=None, max_length=500)
    project: str | None = Field(default=None, max_length=500)
    site: str | None = Field(default=None, max_length=2000)
    date: date
    retention_days: int | None = Field(default=None, ge=1, le=180)
    recording_hours_per_day: float | None = Field(default=None, gt=0, le=24, allow_inf_nan=False)
    estimate: QuoteEstimate
    cameras: list[ExportCamera] = Field(max_length=64)
