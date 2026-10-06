"""Business rules and API compatibility for the shared alarm engine."""

import asyncio
import json

import pytest
from fastapi import FastAPI
from pydantic import ValidationError

from app.api.routes.quotes import router
from app.models.alarm import AlarmConfiguration, AlarmDeviceRequirement
from app.models.quote import CCTVRequirements
from app.services.alarm_engine import (
    build_alarm_bom,
    calculate_alarm_expanders,
    estimate_alarm,
    estimate_backup_battery,
    recommend_alarm_panel,
)
from app.services.quote_engine import estimate_quote


def device(device_id="pir", device_type="pir_indoor", quantity=1, **overrides):
    return AlarmDeviceRequirement(id=device_id, name=device_id, type=device_type,
                                  quantity=quantity, **overrides)


def configuration(devices=None, **overrides):
    return AlarmConfiguration(enabled=True, devices=devices or [device(quantity=10)], **overrides)


def warning_contains(result, text):
    return any(text in warning for warning in result.warnings)


def test_disabled_alarm_adds_no_materials_and_keeps_cctv_totals():
    baseline = estimate_quote(CCTVRequirements(camera_count=4, extra_material_cost=500, labor_cost=100))
    disabled = estimate_quote(CCTVRequirements(camera_count=4, extra_material_cost=500, labor_cost=100,
                                              alarm=AlarmConfiguration(enabled=False, devices=[device(quantity=10)])))
    assert estimate_alarm(None) is None
    assert estimate_alarm(AlarmConfiguration()) is None
    assert disabled.alarm is None
    assert disabled.bom == baseline.bom
    assert disabled.total_cost == baseline.total_cost == 600
    assert build_alarm_bom(None) == []


def test_devices_sum_zones_and_expose_resolved_rows():
    result = estimate_alarm(configuration([
        device(quantity=4), device("contacts", "magnetic_contact", 5),
        device("panic", "panic_button"),
    ]))
    assert result.deviceCount == result.zonesRequired == 10
    assert result.zonesWithReserve == 12
    assert result.recommendedPanelZones == 16
    assert [row.zoneLabel for row in result.devices] == ["Zonas 1–4", "Zonas 5–9", "Zona 10"]
    assert all(row.connection == "wired" for row in result.devices)


@pytest.mark.parametrize("zones,panel", [(7, 8), (10, 16), (22, 32), (33, 64), (65, None)])
def test_smallest_panel_capacity_without_reserve(zones, panel):
    assert recommend_alarm_panel(zones) == panel


def test_future_reserve_affects_panel_and_handles_integer_boundaries():
    assert recommend_alarm_panel(7, 0) == 8
    assert recommend_alarm_panel(7, 20) == 16
    result = estimate_alarm(configuration([device(quantity=100)], expansionReservePercent=10))
    assert result.zonesWithReserve == 110


def test_manual_panel_and_expanders_cover_reserve_without_hiding_warning():
    result = estimate_alarm(configuration(panelMode="manual", panelZones=8))
    assert result.recommendedPanelZones == 16
    assert result.selectedPanelZones == 8
    assert result.panelOverridden
    assert result.expanderCount == 1
    assert result.installedZoneCapacity == 16
    assert warning_contains(result, "La capacidad seleccionada es inferior a las zonas requeridas.")
    bom = build_alarm_bom(result)
    assert any(row.category == "alarm_expander" and row.quantity == 1 for row in bom)
    assert any(row.category == "alarm_panel" and "8 zonas" in row.description for row in bom)
    assert calculate_alarm_expanders(16, 16) == 0
    assert calculate_alarm_expanders(25, 8) == 3


def test_manual_equal_to_recommendation_has_no_override_badge():
    result = estimate_alarm(configuration(panelMode="manual", panelZones=16))
    assert not result.panelOverridden
    assert result.expanderCount == 0


def test_reserve_only_shortfall_warns_and_adds_expander():
    result = estimate_alarm(configuration([device(quantity=7)], panelMode="manual", panelZones=8))
    assert result.zonesRequired == 7
    assert result.zonesWithReserve == 9
    assert result.expanderCount == 1
    assert warning_contains(result, "reserva de ampliación")
    assert not warning_contains(result, "inferior a las zonas requeridas")


def test_above_supported_panel_or_battery_is_manual_not_clamped():
    result = estimate_alarm(configuration([device(quantity=65)], backupAutonomyHours=24))
    assert result.recommendedPanelZones is None
    assert result.selectedPanelZones is None
    assert result.installedZoneCapacity is None
    assert result.expanderCount == 0
    assert result.batteryAhSelected is None
    assert warning_contains(result, "más de 64 zonas")
    assert warning_contains(result, "supera 40 Ah")
    assert any("definir manualmente" in row.description for row in build_alarm_bom(result))


def test_wireless_has_no_sensor_cable_and_battery_maintenance_warning():
    result = estimate_alarm(configuration(systemType="wireless"))
    assert result.systemType == "wireless"
    assert result.wiredDeviceCount == 0
    assert result.wirelessDeviceCount == 10
    assert result.estimatedCableM == 0
    assert not any(row.category == "alarm_cable" for row in build_alarm_bom(result))
    assert warning_contains(result, "mantenimiento periódico de baterías")


def test_mixed_devices_cable_distance_override_and_global_fallback():
    result = estimate_alarm(configuration([
        device(quantity=2, cableDistanceM=10),
        device("fallback", quantity=3),
        device("wireless", quantity=20, connection="wireless", cableDistanceM=500),
    ], averageCableMPerWiredDevice=20))
    assert result.systemType == "hybrid"
    assert result.wiredDeviceCount == 5
    assert result.wirelessDeviceCount == 20
    assert result.estimatedCableM == 92
    cable = next(row for row in build_alarm_bom(result) if row.category == "alarm_cable")
    assert cable.quantity == 92
    assert cable.unit == "m"


def test_zero_custom_distance_is_preserved():
    result = estimate_alarm(configuration([device(quantity=2, cableDistanceM=0)]))
    assert result.estimatedCableM == 0


def test_battery_grows_with_autonomy_and_uses_unrounded_capacity():
    shorter = estimate_alarm(configuration(backupAutonomyHours=2))
    longer = estimate_alarm(configuration(backupAutonomyHours=8))
    assert longer.batteryWhRequired == shorter.batteryWhRequired * 4
    assert longer.batteryAhApprox > shorter.batteryAhApprox
    assert longer.batteryAhSelected > shorter.batteryAhSelected
    assert estimate_backup_battery(30, 4) == (144, 12, 12)
    assert estimate_backup_battery(30.01, 4)[2] == 18


def test_zero_autonomy_no_battery_and_outdoor_warning():
    result = estimate_alarm(configuration(backupAutonomyHours=0, outdoorSirens=1))
    assert result.batteryAhSelected == 0
    assert result.batteryWhRequired == 0
    assert not any(row.category == "alarm_battery" for row in build_alarm_bom(result))
    assert warning_contains(result, "Sirena exterior sin respaldo")


@pytest.mark.parametrize("communication,label", [("lte", "Comunicador LTE"), ("ethernet", "Comunicador IP"), ("wifi", "Wi-Fi"), ("telephone", "telefónica")])
def test_communication_modules_are_added_to_bom(communication, label):
    result = estimate_alarm(configuration(communications=[communication]))
    assert any(row.category == "alarm_communication" and label in row.description for row in build_alarm_bom(result))


def test_communications_deduplicated_and_redundancy_noted():
    single = estimate_alarm(configuration(communications=["ethernet", "lte"]))
    repeated = estimate_alarm(configuration(communications=["ethernet", "lte", "ethernet", "lte"]))
    assert repeated.estimatedLoadW == single.estimatedLoadW
    assert len([row for row in build_alarm_bom(repeated) if row.category == "alarm_communication"]) == 2
    assert warning_contains(repeated, "comunicación redundante IP + LTE")


def test_panic_partition_technical_and_remote_warnings():
    result = estimate_alarm(configuration([
        device("panic", "panic_button"), device("smoke", "smoke"),
        device("gas", "gas"), device("flood", "flood"),
    ], partitions=2, professionalMonitoringRequired=True, remoteAppRequired=True,
       pushNotificationsRequired=True))
    assert warning_contains(result, "pánico")
    assert warning_contains(result, "particiones requeridas")
    assert warning_contains(result, "sistema certificado de detección de incendio o gas")
    assert warning_contains(result, "sin medio de comunicación remota")
    assert warning_contains(result, "central de monitoreo seleccionada")


def test_explicit_sharing_across_rows_and_special_types_warn():
    result = estimate_alarm(configuration([
        device("doors", "magnetic_contact", 4, requiresSeparateZone=False, zoneGroup="Accesos"),
        device("windows", "magnetic_contact", 3, requiresSeparateZone=False, zoneGroup="Accesos"),
        device("panic", "panic_button", requiresSeparateZone=False, zoneGroup="Auxiliares"),
        device("smoke", "smoke", requiresSeparateZone=False, zoneGroup="Auxiliares"),
    ]))
    assert result.deviceCount == 9
    assert result.zonesRequired == 2
    assert result.devices[0].zoneLabel == result.devices[1].zoneLabel
    assert warning_contains(result, "funciones distintas")


def test_mixed_connections_cannot_share_physical_zone():
    result = estimate_alarm(configuration([
        device("wired", quantity=3, connection="wired", requiresSeparateZone=False, zoneGroup="Común"),
        device("wireless", quantity=2, connection="wireless", requiresSeparateZone=False, zoneGroup="Común"),
    ]))
    assert result.zonesRequired == 2
    assert result.devices[0].zoneLabel != result.devices[1].zoneLabel
    assert warning_contains(result, "mezcla conexiones cableadas e inalámbricas")


def test_zone_group_is_ignored_when_separate_requested():
    result = estimate_alarm(configuration([
        device("a", quantity=2, zoneGroup="Grupo"), device("b", quantity=3, zoneGroup="Grupo"),
    ]))
    assert result.zonesRequired == 5


def test_manual_auxiliary_supply_honored_and_high_load_warns():
    result = estimate_alarm(configuration(auxiliaryPowerMode="automatic"))
    assert result.estimatedLoadW == 36
    assert not result.auxiliaryPowerRequired
    forced = estimate_alarm(configuration(auxiliaryPowerMode="yes"))
    assert forced.auxiliaryPowerRequired
    suppressed = estimate_alarm(configuration([device(quantity=20)], auxiliaryPowerMode="no"))
    assert not suppressed.auxiliaryPowerRequired
    assert warning_contains(suppressed, "desactivó manualmente")
    automatic = estimate_alarm(configuration([device(quantity=20)]))
    assert any(row.category == "alarm_power" for row in build_alarm_bom(automatic))


def test_architecture_and_outdoor_warnings():
    result = estimate_alarm(configuration([device("outdoor", "pir_outdoor", 33, connection="wireless")],
                                         systemType="wired", expansionReservePercent=0, tamperRequired=False,
                                         localOnly=True, communications=["lte"]))
    for text in ["sin reserva", "Gran cantidad", "sistema cableado", "Solo alarma local", "anti-sabotaje", "grado IP"]:
        assert any(text.lower() in warning.lower() for warning in result.warnings)


def test_bom_reuses_engine_result_with_no_alarm_prices():
    config = configuration([device(quantity=2), device("outdoor", "pir_outdoor")],
                           communications=["ethernet", "lte"], outdoorSirens=1, outdoorSirenWithStrobe=True)
    quote = estimate_quote(CCTVRequirements(camera_count=4, alarm=config, extra_material_cost=100, labor_cost=50))
    assert quote.alarm is not None
    alarm_bom = [row for row in quote.bom if row.category.startswith("alarm_")]
    assert alarm_bom == build_alarm_bom(quote.alarm)
    assert all(row.source == "alarm_engine" and row.unit_cost == row.subtotal == 0 for row in alarm_bom)
    assert quote.total_cost == 150
    assert any("con flash / baliza" in row.description for row in alarm_bom)
    assert any(row.category == "alarm_cable" for row in alarm_bom)
    assert any(row.category == "cable" for row in quote.bom)


@pytest.mark.parametrize("change", [{"quantity": 0}, {"quantity": -1}, {"quantity": 1001},
                                  {"cableDistanceM": -1}, {"cableDistanceM": float("inf")}])
def test_invalid_device_values_rejected(change):
    with pytest.raises(ValidationError):
        AlarmDeviceRequirement(id="x", name="x", type="pir_indoor", **change)


def test_duplicate_ids_and_total_limits_rejected():
    with pytest.raises(ValidationError, match="identificadores únicos"):
        configuration([device(), device()])
    with pytest.raises(ValidationError, match="10000"):
        configuration([device(str(i), quantity=1000) for i in range(11)])


async def _request_json(path, payload):
    """Exercise FastAPI ASGI without introducing httpx/test client dependencies."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    sent = []
    raw = json.dumps(payload).encode()
    scope = {"type": "http", "http_version": "1.1", "method": "POST", "scheme": "http",
             "path": path, "raw_path": path.encode(), "query_string": b"",
             "headers": [(b"content-type", b"application/json")], "server": ("test", 80), "client": ("test", 1234)}

    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}

    async def send(message):
        sent.append(message)

    await app(scope, receive, send)
    status = next(message["status"] for message in sent if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in sent if message["type"] == "http.response.body")
    return status, json.loads(body)


def test_api_without_alarm_keeps_previous_response_shape():
    status, result = asyncio.run(_request_json("/api/v1/quotes/estimate", {"camera_count": 4, "wired_poe": False}))
    assert status == 200
    assert result["nvr_channels"] == 4
    assert result["poe_switch_ports_selected"] is None
    assert "alarm" not in result
    old_bom_fields = {"category", "description", "quantity", "unit_cost", "subtotal", "source"}
    assert all(set(row) == old_bom_fields for row in result["bom"])
    assert all(row["unit_cost"] == row["subtotal"] == 0 and row["source"] == "engine" for row in result["bom"])


def test_preview_and_final_api_share_same_engine_and_optional_alarm():
    config = configuration(panelMode="manual", panelZones=8)
    preview_status, preview = asyncio.run(_request_json("/api/v1/quotes/alarm/estimate", config.model_dump()))
    final_status, final = asyncio.run(_request_json("/api/v1/quotes/estimate", {"camera_count": 4, "alarm": config.model_dump()}))
    assert preview_status == final_status == 200
    assert preview == final["alarm"]
    assert preview["zonesRequired"] == final["alarm"]["zonesRequired"] == 10
    assert preview["selectedPanelZones"] == final["alarm"]["selectedPanelZones"] == 8
    assert any(row["category"] == "alarm_panel" for row in final["bom"])
    inactive_status, inactive = asyncio.run(_request_json("/api/v1/quotes/alarm/estimate", {"enabled": False}))
    assert inactive_status == 200 and inactive is None


def test_minimal_api_input_returns_complete_alarm_configuration_defaults():
    status, response = asyncio.run(_request_json("/api/v1/quotes/estimate", {
        "camera_count": 4, "alarm": {"enabled": True},
    }))
    assert status == 200
    assert response["alarm"]["configuration"]["keypadCount"] == 1
    assert response["alarm"]["configuration"]["backupAutonomyHours"] == 4
    assert response["alarm"]["configuration"]["communications"] == []


def test_api_validates_malformed_alarm_configuration():
    status, response = asyncio.run(_request_json("/api/v1/quotes/estimate", {
        "camera_count": 4,
        "alarm": {"enabled": True, "devices": [{"id": "x", "name": "X", "type": "pir_indoor", "quantity": -1}]},
    }))
    assert status == 422
    assert any("quantity" in error["loc"] for error in response["detail"])
