from datetime import date
from pydantic import BaseModel, ConfigDict, Field

from app.models.quote import CameraRequirement, QuoteEstimate, RecordingMode


class ExportCamera(CameraRequirement):
    lensRecommendation: str = Field(max_length=5000)
    technicalPending: list[str] = Field(default_factory=list, max_length=64)


class MaterialsExport(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    client: str | None = Field(default=None, max_length=500)
    project: str | None = Field(default=None, max_length=500)
    site: str | None = Field(default=None, max_length=2000)
    date: date
    retention_days: int | None = Field(default=None, ge=1, le=180)
    recording_hours_per_day: float | None = Field(default=None, gt=0, le=24, allow_inf_nan=False)
    recordingMode: RecordingMode = "undefined"
    estimate: QuoteEstimate
    cameras: list[ExportCamera] = Field(max_length=64)
