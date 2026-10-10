"""Normalization and outstanding requirements shared by the project and quote flow."""

from copy import deepcopy

from app.models.quote import CCTVRequirements, CameraRequirement, GlobalCameraDefaults


EXTERNAL_SIREN_CHECKLIST = (
    "Verificar integración de sirena externa: equipo que ejecutará la acción, "
    "salida o interfaz necesaria, relé/contacto seco si aplica, alimentación, "
    "compatibilidad, materiales adicionales y configuración."
)


def load_saved_cctv_requirements(values: dict) -> CCTVRequirements:
    """Migrate the old accepted zero target only when opening an old camera schema.

    Submitted requests still use the strictly positive Pydantic constraint. No
    valid customer answer is inferred from an old zero-distance placeholder.
    """
    values = deepcopy(values)
    rows = list(values.get("cameras") or [])
    if isinstance(values.get("cameraDefaults"), dict):
        rows.append(values["cameraDefaults"])
    for row in rows:
        if "imageObjective" not in row and row.get("targetDistanceM") == 0:
            row["targetDistanceM"] = None
    return normalize_cctv_requirements(CCTVRequirements.model_validate(values))


def normalize_cctv_requirements(req: CCTVRequirements) -> CCTVRequirements:
    """Keep saved overrides intact, generating individual rows only for old aggregates."""
    normalized = req.model_copy(deep=True)
    defaults = normalized.cameraDefaults
    if defaults is None:
        defaults = GlobalCameraDefaults(
            cameraCount=req.camera_count,
            outdoorCount=min(req.outdoor_camera_count, req.camera_count),
            resolutionMp=req.resolution_mp,
            connectivity="poe" if req.wired_poe else "wifi",
            distanceM=req.average_cable_m_per_camera,
        )
        normalized.cameraDefaults = defaults
    if not normalized.cameras:
        settings = defaults.model_dump(exclude={"cameraCount", "outdoorCount"})
        normalized.cameras = [
            CameraRequirement(
                id=f"C{index + 1}", name=f"Cámara {index + 1}",
                environment="outdoor" if index < defaults.outdoorCount else "indoor",
                **settings,
            )
            for index in range(defaults.cameraCount)
        ]
    return normalized


def aggregate_camera_requirements(req: CCTVRequirements) -> CCTVRequirements:
    """Use the existing conservative aggregate engine, without a second per-camera engine."""
    if not req.cameras:
        return req
    cameras = req.cameras
    poe = [camera for camera in cameras if camera.connectivity == "poe"]
    average = req.average_cable_m_per_camera
    if any(camera.customized for camera in cameras):
        average = sum(camera.distanceM for camera in poe) / len(poe) if poe else 0
    return req.model_copy(update={
        "camera_count": len(cameras),
        "outdoor_camera_count": sum(camera.environment == "outdoor" for camera in cameras),
        "resolution_mp": max(camera.resolutionMp for camera in cameras),
        "wired_poe": bool(poe),
        "average_cable_m_per_camera": average,
    })


def camera_technical_pending(camera: CameraRequirement, recording_mode: str) -> list[str]:
    pending: list[str] = []
    if camera.imageObjective == "undefined":
        pending.append("Definir objetivo de imagen.")
    if camera.imageObjective in {"recognize", "identify"} and camera.targetDistanceM is None:
        objective = "reconocimiento" if camera.imageObjective == "recognize" else "identificación"
        pending.append(f"Definir distancia de {objective}.")
    if camera.nightObjectiveRequired == "undefined":
        pending.append("Definir si necesita cumplir el objetivo de noche.")
    if camera.nightObjectiveRequired == "yes":
        if camera.nightLighting == "unknown":
            pending.append("Verificar iluminación nocturna.")
        if camera.nightColorRequired == "undefined":
            pending.append("Definir necesidad de color nocturno.")
    configured_event = camera.detectionEvent not in {"none", "undefined"}
    if recording_mode == "events" and not configured_event:
        pending.append("Definir evento para grabación por eventos.")
    if configured_event and camera.detectionTarget == "undefined":
        pending.append("Definir qué debe generar el evento.")
    if "external_siren" in camera.eventActions:
        pending.append(EXTERNAL_SIREN_CHECKLIST)
    return pending


def technical_pending(req: CCTVRequirements) -> list[str]:
    normalized = normalize_cctv_requirements(req)
    pending = []
    if req.recordingMode == "undefined":
        pending.append("Definir modalidad de grabación.")
    for camera in normalized.cameras:
        pending.extend(f"Cámara {camera.id}: {item}" for item in camera_technical_pending(camera, req.recordingMode))
    return pending
