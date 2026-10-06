from math import ceil

from app.models.quote import BOMItem, CCTVRequirements, QuoteEstimate
from app.services.alarm_engine import build_alarm_bom, estimate_alarm


BITRATE_Mbps_BY_MP = {
    2: 2.0,
    4: 4.0,
    5: 5.0,
    8: 8.0,
}

COMMON_DISK_TB = [1, 2, 4, 6, 8, 10, 12, 16, 20]
COMMON_SWITCH_PORTS = [4, 8, 16, 24, 48]


def choose_nvr_channels(camera_count: int) -> int:
    for channels in (4, 8, 16, 32):
        if camera_count <= channels:
            return channels
    return 64


def choose_common_capacity(required: float, capacities: list[int]) -> int:
    for capacity in capacities:
        if required <= capacity:
            return capacity
    return capacities[-1]


def estimate_storage_tb(req: CCTVRequirements) -> float:
    bitrate_mbps = BITRATE_Mbps_BY_MP[req.resolution_mp]
    seconds = req.retention_days * req.recording_hours_per_day * 3600

    # Mbps -> MB/s: divide by 8.
    # MB -> TB: divide by 1_000_000.
    tb = (
        bitrate_mbps
        * req.camera_count
        * seconds
        / 8
        / 1_000_000
    )

    # Initial engineering safety factor.
    return tb * 1.15


def estimate_quote(req: CCTVRequirements) -> QuoteEstimate:
    warnings: list[str] = []

    if req.outdoor_camera_count > req.camera_count:
        warnings.append("Outdoor camera count exceeds total camera count.")

    nvr_channels = choose_nvr_channels(req.camera_count)

    if req.camera_count > 32:
        warnings.append("More than 32 cameras requires manual architecture review.")

    storage_raw = estimate_storage_tb(req)
    storage_selected = choose_common_capacity(storage_raw, COMMON_DISK_TB)

    if storage_raw > COMMON_DISK_TB[-1]:
        warnings.append(
            "Estimated storage exceeds the largest single-disk placeholder capacity. "
            "Multi-disk/NVR bay design is required."
        )

    estimated_cable_m = (
        req.camera_count * req.average_cable_m_per_camera * 1.15
        if req.wired_poe
        else 0
    )

    poe_ports_required = req.camera_count if req.wired_poe else 0
    switch_ports = (
        choose_common_capacity(poe_ports_required, COMMON_SWITCH_PORTS)
        if poe_ports_required
        else None
    )

    bom: list[BOMItem] = [
        BOMItem(
            category="camera",
            description=f"IP camera {req.resolution_mp} MP",
            quantity=req.camera_count,
        ),
        BOMItem(
            category="nvr",
            description=f"NVR {nvr_channels} channels",
            quantity=1,
        ),
        BOMItem(
            category="storage",
            description=f"Surveillance HDD {storage_selected} TB",
            quantity=1,
        ),
    ]

    if req.wired_poe:
        bom.extend(
            [
                BOMItem(
                    category="switch",
                    description=f"PoE switch {switch_ports} ports",
                    quantity=1,
                ),
                BOMItem(
                    category="cable",
                    description="Cat6 cable",
                    quantity=ceil(estimated_cable_m),
                ),
            ]
        )

    alarm = estimate_alarm(req.alarm)
    bom.extend(build_alarm_bom(alarm))

    # Product costs will come from supplier catalogs in v0.2.
    equipment_cost = req.extra_material_cost
    total_cost = equipment_cost + req.labor_cost

    margin_fraction = req.margin_percent / 100
    sale_price = (
        total_cost / (1 - margin_fraction)
        if total_cost > 0 and margin_fraction < 1
        else 0
    )

    return QuoteEstimate(
        nvr_channels=nvr_channels,
        storage_tb_raw=round(storage_raw, 2),
        storage_tb_selected=storage_selected,
        poe_ports_required=poe_ports_required,
        poe_switch_ports_selected=switch_ports,
        estimated_cable_m=round(estimated_cable_m, 1),
        bom=bom,
        equipment_cost=round(equipment_cost, 2),
        labor_cost=round(req.labor_cost, 2),
        total_cost=round(total_cost, 2),
        margin_percent=req.margin_percent,
        sale_price=round(sale_price, 2),
        warnings=warnings,
        **({"alarm": alarm} if alarm is not None else {}),
    )
