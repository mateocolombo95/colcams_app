from fastapi import APIRouter, Response
from app.models.export import MaterialsExport
from app.services.excel_export import MIME_XLSX, export_filename, generate_materials_excel

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("/materials.xlsx")
def export_materials(data: MaterialsExport):
    return Response(
        content=generate_materials_excel(data), media_type=MIME_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{export_filename(data)}"', "Cache-Control": "no-store"},
    )
