from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.models.alarm import AlarmConfiguration, AlarmEstimate
from app.models.quote import CCTVRequirements, QuoteEstimate
from app.services.alarm_engine import estimate_alarm
from app.services.quote_engine import estimate_quote

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.post("/estimate", response_model=QuoteEstimate)
def estimate(requirements: CCTVRequirements):
    # Preserve the existing response defaults (costs, source, explicit switch null)
    # while omitting only the new optional subsystem and absent BOM metadata.
    # Dumping the complete model also returns all alarm defaults for minimal clients.
    payload = estimate_quote(requirements).model_dump()
    if payload["alarm"] is None:
        payload.pop("alarm")
    for item in payload["bom"]:
        for key in ("unit", "observations"):
            if item[key] is None:
                item.pop(key)
    return JSONResponse(content=payload)


@router.post("/alarm/estimate", response_model=AlarmEstimate | None)
def estimate_alarm_preview(configuration: AlarmConfiguration):
    return estimate_alarm(configuration)
