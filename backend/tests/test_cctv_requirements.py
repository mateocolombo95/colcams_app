"""CCTV requirements, conservative storage, and real request validation."""

import asyncio
import json

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from app.api.routes.quotes import router
from app.models.quote import CCTVRequirements, CameraRequirement
from app.services.cctv_requirements import camera_technical_pending, normalize_cctv_requirements
from app.services.quote_engine import estimate_quote


def camera(camera_id="C1", **overrides):
    return CameraRequirement(id=camera_id, name=camera_id, **overrides)


def test_independent_objective_range_and_positive_decimal_target():
    req = CCTVRequirements(camera_count=2, cameras=[
        camera(viewingRange="far", imageObjective="identify", targetDistanceM=28.5, distanceM=62),
        camera("C2", viewingRange="medium", imageObjective="recognize", targetDistanceM=7.25, distanceM=16),
    ])
    restored = CCTVRequirements.model_validate(req.model_dump())
    assert [c.imageObjective for c in restored.cameras] == ["identify", "recognize"]
    assert [c.viewingRange for c in restored.cameras] == ["far", "medium"]
    assert [c.targetDistanceM for c in restored.cameras] == [28.5, 7.25]
    assert [c.distanceM for c in restored.cameras] == [62, 16]


def test_night_requirements_remain_separate_for_two_cameras():
    req = CCTVRequirements(camera_count=2, cameras=[
        camera(imageObjective="identify", nightObjectiveRequired="yes", nightLighting="motion", nightColorRequired="yes"),
        camera("C2", imageObjective="overview", nightObjectiveRequired="no", nightColorRequired="no"),
    ])
    restored = CCTVRequirements.model_validate_json(req.model_dump_json())
    assert restored.cameras[0].nightObjectiveRequired == "yes"
    assert restored.cameras[0].nightLighting == "motion"
    assert restored.cameras[0].nightColorRequired == "yes"
    assert restored.cameras[1].imageObjective == "overview"
    assert restored.cameras[1].nightObjectiveRequired == "no"


@pytest.mark.parametrize("mode", ["continuous", "events"])
def test_explicit_recording_modes_always_use_24_hours(mode):
    full_day = estimate_quote(CCTVRequirements(camera_count=4, recording_hours_per_day=24, recordingMode="continuous"))
    result = estimate_quote(CCTVRequirements(camera_count=4, recording_hours_per_day=3, recordingMode=mode))
    assert result.storage_hours_per_day == 24
    assert result.storage_tb_raw == full_day.storage_tb_raw
    if mode == "events":
        assert "El almacenamiento se estimó con grabación continua como referencia. El consumo real con grabación por eventos dependerá de la actividad de la escena." in result.warnings


def test_undefined_recording_keeps_legacy_hours_and_exposes_assumption():
    result = estimate_quote(CCTVRequirements(camera_count=4, recording_hours_per_day=6))
    continuous = estimate_quote(CCTVRequirements(camera_count=4, recordingMode="continuous"))
    assert result.storage_hours_per_day == 6
    assert result.storage_tb_raw == round(continuous.storage_tb_raw / 4, 2)
    assert any("provisional" in warning and "6 h/día" in warning for warning in result.warnings)
    assert "Definir modalidad de grabación." in result.technical_pending


@pytest.mark.parametrize("event,target", [("motion", "any"), ("line_crossing", "person"), ("intrusion_zone", "vehicle"), ("motion", "person_vehicle")])
def test_continuous_recording_coexists_with_events_and_notifications(event, target):
    row = camera(imageObjective="overview", nightObjectiveRequired="no", detectionEvent=event,
                 detectionTarget=target, eventActions=["mobile_notification"])
    req = CCTVRequirements(camera_count=1, recordingMode="continuous", cameras=[row])
    restored = CCTVRequirements.model_validate(req.model_dump())
    assert restored.cameras[0].detectionEvent == event
    assert restored.cameras[0].detectionTarget == target
    assert restored.cameras[0].eventActions == ["mobile_notification"]
    result = estimate_quote(restored)
    assert result.storage_hours_per_day == 24
    assert result.technical_pending == []


def test_pending_requirements_never_block_and_siren_adds_no_bom_item():
    row = camera(imageObjective="identify", nightObjectiveRequired="yes", detectionEvent="undefined",
                 eventActions=["external_siren"])
    req = CCTVRequirements(camera_count=1, recordingMode="events", cameras=[row])
    result = estimate_quote(req)
    assert any("distancia de identificación" in item for item in result.technical_pending)
    assert any("iluminación nocturna" in item for item in result.technical_pending)
    assert any("evento para grabación por eventos" in item for item in result.technical_pending)
    siren = next(item for item in result.technical_pending if "sirena externa" in item)
    for requirement in ["equipo", "interfaz", "relé/contacto seco", "alimentación", "compatibilidad", "materiales", "configuración"]:
        assert requirement in siren
    assert not any("siren" in item.category or "sirena" in item.description.lower() for item in result.bom)
    assert camera_technical_pending(row, "events")


def test_legacy_defaults_dont_invent_customer_answers():
    req = normalize_cctv_requirements(CCTVRequirements(camera_count=2, outdoor_camera_count=1))
    assert req.recordingMode == "undefined"
    assert len(req.cameras) == 2
    assert [row.environment for row in req.cameras] == ["outdoor", "indoor"]
    for row in req.cameras:
        assert row.imageObjective == row.nightObjectiveRequired == row.nightColorRequired == "undefined"
        assert row.detectionEvent == row.detectionTarget == "undefined"
        assert row.nightLighting == "unknown"
        assert row.eventActions == []
        assert row.targetDistanceM is None


def test_mixed_cameras_keep_existing_conservative_engine():
    req = CCTVRequirements(camera_count=2, cameras=[
        camera(resolutionMp=8, distanceM=42, customized=True),
        camera("C2", resolutionMp=2, connectivity="wifi", distanceM=12),
    ])
    result = estimate_quote(req)
    reference = estimate_quote(CCTVRequirements(camera_count=2, resolution_mp=8, average_cable_m_per_camera=42))
    assert result.storage_tb_raw == reference.storage_tb_raw
    assert result.poe_ports_required == 2
    assert result.estimated_cable_m == reference.estimated_cable_m
    assert any("mixtas PoE/Wi-Fi" in warning for warning in result.warnings)
    assert any("mayor resolución" in warning for warning in result.warnings)


@pytest.mark.parametrize("value", [0, -1, float("nan"), float("inf"), True])
def test_invalid_supplied_target_is_an_error(value):
    with pytest.raises(ValidationError):
        camera(imageObjective="identify", targetDistanceM=value)


@pytest.mark.parametrize("value", [0, 181, 3.5, float("nan"), float("inf"), True])
def test_retention_requires_an_integer_between_1_and_180(value):
    with pytest.raises(ValidationError):
        CCTVRequirements(camera_count=1, retention_days=value)


@pytest.mark.parametrize("field", ["recording_hours_per_day", "average_cable_m_per_camera", "extra_material_cost", "labor_cost", "margin_percent"])
def test_aggregate_real_numbers_reject_nonfinite_values(field):
    with pytest.raises(ValidationError):
        CCTVRequirements(camera_count=1, **{field: float("inf")})


async def api_request(app, payload, path="/quotes/estimate", method="POST"):
    sent = []
    async def receive():
        return {"type": "http.request", "body": json.dumps(payload).encode(), "more_body": False}
    async def send(message):
        sent.append(message)
    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
               "method": method, "scheme": "http", "path": path,
               "raw_path": path.encode(), "query_string": b"", "headers": [(b"content-type", b"application/json")],
               "client": ("127.0.0.1", 1), "server": ("test", 80)}, receive, send)
    return sent[0]["status"], json.loads(sent[1]["body"])


def test_current_endpoint_accepts_legacy_and_detailed_requests_and_rejects_errors():
    app = FastAPI()
    app.include_router(router)
    status, result = asyncio.run(api_request(app, {"camera_count": 1}))
    assert status == 200
    assert result["storage_hours_per_day"] == 24
    payload = CCTVRequirements(camera_count=1, recordingMode="events", cameras=[camera(imageObjective="identify")]).model_dump(mode="json")
    status, result = asyncio.run(api_request(app, payload))
    assert status == 200
    assert any("distancia de identificación" in item for item in result["technical_pending"])
    payload["cameras"][0]["targetDistanceM"] = 0
    assert asyncio.run(api_request(app, payload))[0] == 422
    assert asyncio.run(api_request(app, {"camera_count": 1, "retention_days": 2.25}))[0] == 422
