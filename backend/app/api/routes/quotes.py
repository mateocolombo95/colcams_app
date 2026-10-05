from fastapi import APIRouter

from app.models.quote import CCTVRequirements, QuoteEstimate
from app.services.quote_engine import estimate_quote

router = APIRouter(prefix="/quotes", tags=["quotes"])


@router.post("/estimate", response_model=QuoteEstimate)
def estimate(requirements: CCTVRequirements):
    return estimate_quote(requirements)
