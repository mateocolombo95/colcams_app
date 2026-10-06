"""Deterministic preliminary alarm sizing, independent of CCTV and suppliers.

All loads below are conceptual watts, not manufacturer DC current ratings.
The 36 W panel supply threshold is a placeholder, not a panel specification.
Battery energy = total load W * autonomy h * 1.20, with a conceptual 12 V bank.
This treats sirens as sustained loads (conservative); validate standby/alarm
currents, usable battery capacity, charging limits and enclosures on real equipment.
Wired sensor cable = sum(quantity * route distance) * 1.15; no CCTV UTP involved.
Expanders add eight conceptual zones and include the requested future reserve.
"""

from math import ceil
from decimal import Decimal

from app.models.alarm import AlarmConfiguration, AlarmEstimate, AlarmResolvedDevice
from app.models.quote import BOMItem


PANEL_CAPACITIES = (8, 16, 32, 64)
BATTERY_CAPACITIES_AH = (7, 12, 18, 26, 40)
BATTERY_SAFETY_FACTOR = 1.20
BATTERY_VOLTAGE = 12
CABLE_SAFETY_FACTOR = 1.15
EXPANDER_ZONES = 8
PANEL_SUPPLY_CAPACITY_W = 36
PANEL_LOAD_W = 15
KEYPAD_LOAD_W = {"lcd": 3, "touch": 5, "wireless": 2}
SENSOR_LOAD_W = {
    "pir_indoor": 1, "pir_outdoor": 2, "magnetic_contact": 0,
    "beam": 3, "glass_break": 1, "smoke": 1, "gas": 3,
    "flood": 1, "panic_button": 0, "other": 1,
}
INDOOR_SIREN_LOAD_W = 8
OUTDOOR_SIREN_LOAD_W = 12
COMMUNICATOR_LOAD_W = 5
EXPANDER_LOAD_W = 3
TECHNICAL_TYPES = {"smoke", "gas", "flood"}
OUTDOOR_TYPES = {"pir_outdoor", "beam"}
DEVICE_LABELS = {
    "pir_indoor": "Sensor PIR interior", "pir_outdoor": "Sensor PIR exterior",
    "magnetic_contact": "Contacto magnético", "beam": "Barrera infrarroja",
    "glass_break": "Detector de rotura de vidrio", "smoke": "Detector de humo",
    "gas": "Detector de gas", "flood": "Detector de inundación",
    "panic_button": "Pulsador de pánico", "other": "Dispositivo de alarma auxiliar",
}


def resolve_alarm_devices(config: AlarmConfiguration) -> list[AlarmResolvedDevice]:
    devices = []
    for device in config.devices:
        connection = device.connection
        if connection == "auto":
            connection = "wireless" if config.systemType == "wireless" else "wired"
        devices.append(AlarmResolvedDevice(
            **{**device.model_dump(), "connection": connection, "zoneLabel": ""}
        ))
    return _assign_zones(devices)[0]


def _assign_zones(
    devices: list[AlarmResolvedDevice],
) -> tuple[list[AlarmResolvedDevice], int]:
    """A quantity uses individual zones unless the installer explicitly shares it.

    A shared row without a named group occupies one zone. Named groups can span
    rows, but different connection technologies keep separate physical zones.
    """
    next_zone = 1
    shared: dict[tuple[bool, str, str], int] = {}
    resolved = []
    for device in devices:
        if device.requiresSeparateZone:
            first = next_zone
            next_zone += device.quantity
            label = f"Zona {first}" if device.quantity == 1 else f"Zonas {first}–{next_zone - 1}"
        else:
            named_group = (device.zoneGroup or "").strip()
            group = named_group or device.id
            # Named groups cannot collide with implicit groups for independent rows.
            key = (bool(named_group), group, device.connection)
            if key not in shared:
                shared[key] = next_zone
                next_zone += 1
            label = f"Zona {shared[key]}"
            if device.zoneGroup and device.zoneGroup.strip():
                label += f" · {device.zoneGroup.strip()}"
            label += " (compartida)"
        resolved.append(device.model_copy(update={"zoneLabel": label}))
    return resolved, next_zone - 1


def calculate_alarm_zones(devices: list[AlarmResolvedDevice]) -> int:
    return _assign_zones(devices)[1]


def recommend_alarm_panel(zones_required: int, reserve_percent: float = 0) -> int | None:
    zones_with_reserve = _zones_with_reserve(zones_required, reserve_percent)
    return next((capacity for capacity in PANEL_CAPACITIES if capacity >= zones_with_reserve), None)


def _zones_with_reserve(zones_required: int, reserve_percent: float) -> int:
    # Decimal prevents exact integer boundaries from gaining a floating-point zone.
    return ceil(Decimal(zones_required) * (Decimal(1) + Decimal(str(reserve_percent)) / 100))


def calculate_alarm_expanders(zones_required: int, panel_zones: int | None) -> int:
    if panel_zones is None:
        return 0
    return max(0, ceil((zones_required - panel_zones) / EXPANDER_ZONES))


def estimate_alarm_cable(config: AlarmConfiguration, devices: list[AlarmResolvedDevice]) -> float:
    metres = sum(
        device.quantity * (
            device.cableDistanceM
            if device.cableDistanceM is not None
            else config.averageCableMPerWiredDevice
        )
        for device in devices if device.connection == "wired"
    )
    return round(metres * CABLE_SAFETY_FACTOR, 1)


def estimate_alarm_load(
    config: AlarmConfiguration, devices: list[AlarmResolvedDevice], expander_count: int,
) -> float:
    return round(
        PANEL_LOAD_W
        + config.keypadCount * KEYPAD_LOAD_W[config.keypadType]
        + sum(device.quantity * SENSOR_LOAD_W[device.type] for device in devices if device.connection == "wired")
        + config.indoorSirens * INDOOR_SIREN_LOAD_W
        + config.outdoorSirens * OUTDOOR_SIREN_LOAD_W
        + len(config.communications) * COMMUNICATOR_LOAD_W
        + expander_count * EXPANDER_LOAD_W,
        1,
    )


def estimate_backup_battery(load_w: float, autonomy_hours: float) -> tuple[float, float, int | None]:
    energy_wh = load_w * autonomy_hours * BATTERY_SAFETY_FACTOR
    capacity_ah = energy_wh / BATTERY_VOLTAGE
    selected = (
        next((capacity for capacity in BATTERY_CAPACITIES_AH if capacity >= capacity_ah), None)
        if autonomy_hours > 0 else 0
    )
    return round(energy_wh, 1), round(capacity_ah, 1), selected


def get_alarm_warnings(result: AlarmEstimate) -> list[str]:
    config = result.configuration
    devices = result.devices
    warnings = [
        "Estimación preliminar de carga. Validar consumos reales según equipos seleccionados.",
        "Batería estimada. Validar según corriente real, batería y características del panel.",
    ]
    if result.deviceCount == 0:
        warnings.append("No se configuraron sensores o dispositivos para las zonas de alarma.")
    if result.recommendedPanelZones is None:
        warnings.append("Se requieren más de 64 zonas con reserva. Definir manualmente panel y arquitectura de expansión.")
    if result.selectedPanelZones is None:
        warnings.append("La capacidad del panel debe definirse manualmente.")
    elif result.selectedPanelZones < result.zonesRequired:
        warnings.append("La capacidad seleccionada es inferior a las zonas requeridas.")
    elif result.selectedPanelZones < result.zonesWithReserve:
        warnings.append("La capacidad base seleccionada no cubre la reserva de ampliación; validar los expansores propuestos.")
    if result.expanderCount:
        warnings.append("Verificar que el panel admita los expansores y la capacidad total de zonas propuesta.")
    if result.zonesRequired > 16 and result.selectedPanelZones is not None and result.selectedPanelZones <= 8:
        warnings.append("Muchas zonas en un panel base pequeño: revisar arquitectura y límites de expansión.")
    if config.expansionReservePercent == 0:
        warnings.append("Sin reserva de ampliación. Evaluar capacidad para futuros dispositivos.")
    if result.wirelessDeviceCount:
        warnings.append("Los dispositivos inalámbricos requieren mantenimiento periódico de baterías.")
    if result.wirelessDeviceCount > 32:
        warnings.append("Gran cantidad de sensores inalámbricos: validar capacidad, cobertura y supervisión del panel.")
    if config.systemType == "wired" and result.wirelessDeviceCount:
        warnings.append("Se seleccionó sistema cableado con dispositivos inalámbricos. Validar receptor o arquitectura híbrida.")
    if config.systemType == "wireless" and result.wiredDeviceCount:
        warnings.append("Se seleccionó sistema inalámbrico con dispositivos cableados. Validar entradas o arquitectura híbrida.")
    if config.systemType == "hybrid" and not (result.wiredDeviceCount and result.wirelessDeviceCount):
        warnings.append("Sistema híbrido solicitado: confirmar conexiones cableadas e inalámbricas y compatibilidad del receptor.")
    if config.systemType == "auto" and result.wirelessDeviceCount:
        warnings.append("Validar compatibilidad y receptor inalámbrico para los dispositivos configurados.")
    if not config.communications and (config.professionalMonitoringRequired or config.remoteAppRequired or config.pushNotificationsRequired):
        warnings.append("Se solicitó app, notificaciones o monitoreo sin medio de comunicación remota.")
    if config.localOnly and (config.communications or config.remoteAppRequired or config.pushNotificationsRequired or config.professionalMonitoringRequired):
        warnings.append("Solo alarma local está seleccionado junto con requisitos remotos. Revisar el alcance de comunicaciones.")
    if config.remoteAppRequired or config.pushNotificationsRequired:
        warnings.append("Verificar soporte de app y notificaciones push en el panel y el servicio seleccionado.")
    if "lte" in config.communications and any(item in config.communications for item in ("ethernet", "wifi")):
        warnings.append("Se configuró comunicación redundante IP + LTE.")
    if "lte" in config.communications:
        warnings.append("Validar compatibilidad del comunicador LTE, cobertura y plan de datos.")
    if config.professionalMonitoringRequired:
        warnings.append("Verificar compatibilidad del panel y protocolo con la central de monitoreo seleccionada.")
    if config.partitions > 1:
        warnings.append("Verificar que el panel seleccionado soporte la cantidad de particiones requeridas.")
    if config.backupAutonomyHours >= 8 or result.batteryAhSelected is None and config.backupAutonomyHours > 0:
        warnings.append("La autonomía solicitada requiere verificar batería, corriente de carga y capacidad del gabinete.")
    if result.batteryAhSelected is None and config.backupAutonomyHours > 0:
        warnings.append("La batería requerida supera 40 Ah. Definir manualmente el respaldo y la alimentación.")
    if config.backupAutonomyHours == 0:
        warnings.append("El sistema no tiene autonomía de respaldo configurada.")
        if config.outdoorSirens:
            warnings.append("Sirena exterior sin respaldo configurado: verificar batería y continuidad ante cortes.")
    elif config.outdoorSirens:
        warnings.append("Verificar respaldo y supervisión anti-sabotaje de la sirena exterior.")
    if result.estimatedLoadW > PANEL_SUPPLY_CAPACITY_W:
        warnings.append("Carga conceptual elevada: evaluar fuente auxiliar y capacidad real de alimentación del panel.")
        if config.auxiliaryPowerMode == "no":
            warnings.append("Se desactivó manualmente la fuente auxiliar pese a la carga estimada elevada.")
    if not config.tamperRequired:
        warnings.append("No se solicitó supervisión anti-sabotaje / tamper. Revisar los requisitos de seguridad.")
    if any(device.type in OUTDOOR_TYPES for device in devices):
        warnings.append("Sensores exteriores: validar grado IP, temperatura y antimasking; recomendar zonas separadas.")
    if any(device.type == "panic_button" for device in devices):
        warnings.append("Los pulsadores de pánico deben disponer preferentemente de una zona separada.")
    if any(device.type in TECHNICAL_TYPES for device in devices) or "technical_detection" in config.objectives:
        warnings.append("Los detectores técnicos integrados al sistema de intrusión no deben considerarse automáticamente equivalentes a un sistema certificado de detección de incendio o gas.")
        warnings.append("Recomendar zona separada por tipo para detectores de humo, gas e inundación.")
    if "perimeter" in config.objectives and not any(device.type in OUTDOOR_TYPES for device in devices):
        warnings.append("Se solicitó protección perimetral sin sensores exteriores o barreras; revisar el relevamiento.")
    if "access_protection" in config.objectives and not any(device.type == "magnetic_contact" for device in devices):
        warnings.append("Se solicitó protección de accesos sin contactos magnéticos; revisar el relevamiento.")
    groups: dict[str, list[AlarmResolvedDevice]] = {}
    for device in devices:
        if not device.requiresSeparateZone:
            if device.type in TECHNICAL_TYPES | {"panic_button"} | OUTDOOR_TYPES:
                warnings.append(f"{device.name}: se configuró zona compartida; recomendar zona separada para este dispositivo.")
            if device.connection == "wireless":
                warnings.append(f"{device.name}: validar que el panel permita la agrupación solicitada de dispositivos inalámbricos.")
            if device.zoneGroup and device.zoneGroup.strip():
                groups.setdefault(device.zoneGroup.strip(), []).append(device)
    for group, members in groups.items():
        if len({device.connection for device in members}) > 1:
            warnings.append(f"El grupo {group} mezcla conexiones cableadas e inalámbricas. Se calcularon zonas separadas por conexión.")
        types = {device.type for device in members}
        if len(types) > 1 and types & (TECHNICAL_TYPES | {"panic_button"}):
            warnings.append(f"El grupo {group} comparte tipos con funciones distintas. Separar pánico y detección técnica por tipo.")
    return list(dict.fromkeys(warnings))


def estimate_alarm(config: AlarmConfiguration | None) -> AlarmEstimate | None:
    if config is None or not config.enabled:
        return None
    devices = resolve_alarm_devices(config)
    zones_required = calculate_alarm_zones(devices)
    zones_with_reserve = _zones_with_reserve(zones_required, config.expansionReservePercent)
    recommended_panel = recommend_alarm_panel(zones_required, config.expansionReservePercent)
    selected_panel = config.panelZones if config.panelMode == "manual" else recommended_panel
    expanders = calculate_alarm_expanders(zones_with_reserve, selected_panel)
    load = estimate_alarm_load(config, devices, expanders)
    energy, amp_hours, battery = estimate_backup_battery(load, config.backupAutonomyHours)
    wired_count = sum(device.quantity for device in devices if device.connection == "wired")
    wireless_count = sum(device.quantity for device in devices if device.connection == "wireless")
    system_type = (
        "hybrid" if wired_count and wireless_count else "wireless" if wireless_count else "wired"
    ) if config.systemType == "auto" else config.systemType
    result = AlarmEstimate(
        systemType=system_type, deviceCount=wired_count + wireless_count,
        wiredDeviceCount=wired_count, wirelessDeviceCount=wireless_count,
        zonesRequired=zones_required, zonesWithReserve=zones_with_reserve,
        expansionReservePercent=config.expansionReservePercent,
        recommendedPanelZones=recommended_panel, selectedPanelZones=selected_panel,
        panelOverridden=config.panelMode == "manual" and selected_panel != recommended_panel,
        expanderCount=expanders, expanderZones=EXPANDER_ZONES,
        installedZoneCapacity=selected_panel + expanders * EXPANDER_ZONES if selected_panel is not None else None,
        estimatedLoadW=load, batteryWhRequired=energy, batteryAhApprox=amp_hours,
        batteryAhSelected=battery,
        auxiliaryPowerRequired=(config.auxiliaryPowerMode == "yes" or config.auxiliaryPowerMode == "automatic" and load > PANEL_SUPPLY_CAPACITY_W),
        estimatedCableM=estimate_alarm_cable(config, devices), warnings=[],
        devices=devices, configuration=config,
    )
    result.warnings = get_alarm_warnings(result)
    return result


def build_alarm_bom(result: AlarmEstimate | None) -> list[BOMItem]:
    """Consume resolved engine output without pricing or a second sizing engine."""
    if result is None:
        return []
    config = result.configuration
    rows: list[BOMItem] = []

    def add(category: str, description: str, quantity: float = 1, unit: str = "un", observations: str | None = None):
        if quantity > 0:
            rows.append(BOMItem(category=f"alarm_{category}", description=description, quantity=quantity,
                                unit=unit, observations=observations, source="alarm_engine"))

    panel = f"{result.selectedPanelZones} zonas" if result.selectedPanelZones is not None else "capacidad a definir manualmente"
    add("panel", f"Panel de alarma {panel}", observations="Validar compatibilidad de dispositivos, particiones y expansión.")
    add("expander", f"Expansor de alarma +{result.expanderZones} zonas", result.expanderCount)
    keypad_label = {"lcd": "LCD / convencional", "touch": "Touch", "wireless": "inalámbrico"}[config.keypadType]
    add("keypad", f"Teclado de alarma {keypad_label}", config.keypadCount)
    totals: dict[tuple[str, str], int] = {}
    for device in result.devices:
        key = (device.type, device.connection)
        totals[key] = totals.get(key, 0) + device.quantity
    for (device_type, connection), quantity in totals.items():
        suffix = "cableado" if connection == "wired" else "inalámbrico"
        add("sensor", f"{DEVICE_LABELS[device_type]} ({suffix})", quantity)
    add("siren", "Sirena interior de alarma", config.indoorSirens)
    add("siren", "Sirena exterior de alarma" + (" con flash / baliza" if config.outdoorSirenWithStrobe else ""), config.outdoorSirens)
    for communication in config.communications:
        labels = {"ethernet": "Comunicador IP / Ethernet", "wifi": "Comunicador IP / Wi-Fi",
                  "lte": "Comunicador LTE / 4G", "telephone": "Comunicador de línea telefónica"}
        add("communication", labels[communication])
    if result.auxiliaryPowerRequired:
        add("power", "Fuente auxiliar de alarma 12 V", observations="Validar corriente real y respaldo de las cargas auxiliares.")
    if config.backupAutonomyHours > 0:
        capacity = f"{result.batteryAhSelected} Ah" if result.batteryAhSelected is not None else "capacidad superior a 40 Ah / manual"
        add("battery", f"Batería de respaldo 12 V {capacity}", observations="Capacidad conceptual; validar fabricante y autonomía real.")
    add("cable", "Cable de alarma", ceil(result.estimatedCableM), "m", "Sensores cableados con 15% de margen; revisar recorridos y sección.")
    add("accessories", "Gabinete y accesorios de alarma", observations="Validar espacio para panel, batería, expansores y tamper.")
    return rows
