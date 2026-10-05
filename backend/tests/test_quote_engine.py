from app.models.quote import CCTVRequirements
from app.services.quote_engine import estimate_quote


def test_eight_camera_quote():
    req = CCTVRequirements(
        camera_count=8,
        outdoor_camera_count=3,
        resolution_mp=4,
        retention_days=30,
        recording_hours_per_day=24,
        average_cable_m_per_camera=25,
        wired_poe=True,
        extra_material_cost=1000,
        labor_cost=300,
        margin_percent=35,
    )

    result = estimate_quote(req)

    assert result.nvr_channels == 8
    assert result.poe_ports_required == 8
    assert result.poe_switch_ports_selected == 8
    assert result.estimated_cable_m == 230.0
    assert result.total_cost == 1300
    assert result.sale_price == 2000
