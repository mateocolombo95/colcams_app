from fastapi import APIRouter, Response
from app.models.export import MaterialsExport
from app.services.excel_export import MIME_XLSX, export_filename, generate_materials_excel
from app.services.cctv_requirements import camera_technical_pending

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("/materials.xlsx")
def export_materials(data: MaterialsExport):
    # Normalize outstanding requirements through the shared helper. The renderer
    # consumes this snapshot and never recalculates the quote or optics.
    for camera in data.cameras:
        camera.technicalPending = camera_technical_pending(camera, data.recordingMode)
    return Response(
        content=generate_materials_excel(data), media_type=MIME_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{export_filename(data)}"', "Cache-Control": "no-store"},
    )
