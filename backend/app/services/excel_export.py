from io import BytesIO
import re
import unicodedata

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

from app.models.export import MaterialsExport

MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def export_filename(data: MaterialsExport) -> str:
    def sanitize(value: str | None, fallback: str) -> str:
        ascii_value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
        return re.sub(r"[^a-zA-Z0-9_-]+", "_", ascii_value).strip("_-")[:60] or fallback
    return f"colcams_{sanitize(data.client, 'cliente')}_{sanitize(data.project or data.site, 'proyecto')}_{data.date.isoformat()}.xlsx"


def append_row(sheet, values):
    # All user/BOM text is literal, never an Excel formula. Strip illegal XML controls.
    sheet.append([ILLEGAL_CHARACTERS_RE.sub("", value)[:32767] if isinstance(value, str) else value for value in values])
    for cell in sheet[sheet.max_row]:
        if isinstance(cell.value, str):
            cell.data_type = "s"


def style_sheet(sheet, widths):
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="243B53")
    for index, width in enumerate(widths, 1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    for row in sheet.iter_rows():
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.print_title_rows = "1:1"


def generate_materials_excel(data: MaterialsExport) -> bytes:
    """Render the current estimate snapshot; do not invoke the quote engine."""
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Resumen"
    append_row(summary, ["Concepto", "Valor"])
    estimate = data.estimate
    rows = [
        ("Cliente", data.client), ("Proyecto", data.project), ("Dirección / sitio", data.site),
        ("Fecha", data.date), ("Cantidad total de cámaras", len(data.cameras)),
        ("Cámaras interiores", sum(c.environment == "indoor" for c in data.cameras)),
        ("Cámaras exteriores", sum(c.environment == "outdoor" for c in data.cameras)),
        ("Días de grabación", data.retention_days), ("Horas de grabación por día", data.recording_hours_per_day),
        ("NVR recomendado (canales)", estimate.nvr_channels),
        ("Almacenamiento estimado (TB)", estimate.storage_tb_raw),
        ("Almacenamiento seleccionado (TB)", estimate.storage_tb_selected),
        ("Switch PoE recomendado (puertos)", estimate.poe_switch_ports_selected),
        ("Metros estimados de cable", estimate.estimated_cable_m),
        ("Mano de obra", estimate.labor_cost), ("Costo estimado", estimate.total_cost),
        ("Margen", estimate.margin_percent / 100), ("Precio de venta", estimate.sale_price),
    ]
    for label, value in rows:
        if value is None or value == "":
            continue
        append_row(summary, [label, value])
        cell = summary.cell(summary.max_row, 2)
        if label in {"Mano de obra", "Costo estimado", "Precio de venta"}:
            cell.number_format = '"$" #,##0.00'
        elif label == "Margen":
            cell.number_format = "0.00%"
        elif label == "Fecha":
            cell.number_format = "yyyy-mm-dd"
    for warning in estimate.warnings:
        append_row(summary, ["Advertencia del resultado", warning])
    append_row(summary, ["Alcance", "Estimación preliminar. Los costos no incluyen precios de catálogo. Las recomendaciones de lente requieren revisión técnica."])
    materials = workbook.create_sheet("Materiales")
    append_row(materials, ["Categoría", "Descripción", "Cantidad", "Unidad", "Observaciones"])
    categories = {"camera": "Cámaras", "nvr": "Grabación", "storage": "Almacenamiento", "switch": "Red", "cable": "Cableado"}
    for item in estimate.bom:
        # Unit metadata is absent in the current BOM; only map known categories.
        unit = "m" if item.category == "cable" else "un" if item.category in categories else None
        append_row(materials, [categories.get(item.category, item.category), item.description, item.quantity, unit, "Estimado" if item.source == "engine" else None])
    cameras = workbook.create_sheet("Cámaras")
    append_row(cameras, ["ID", "Nombre", "Ubicación", "Ambiente", "Formato", "Resolución (MP)", "Conectividad", "Distancia de cableado (m)", "Objetivo de visualización", "Distancia al punto de interés (m)", "Recomendación preliminar de lente", "Notas"])
    ranges = {"near": "Vista general / corta distancia", "medium": "Distancia media", "far": "Objetivo lejano", "mixed": "Cercano y lejano"}
    formats = {"turret": "Torreta", "bullet": "Tipo bala", "dome": "Domo", "other": "Otro"}
    for camera in data.cameras:
        append_row(cameras, [camera.id, camera.name, camera.location, "Interior" if camera.environment == "indoor" else "Exterior", formats[camera.formFactor], camera.resolutionMp, "PoE" if camera.connectivity == "poe" else "Wi-Fi", camera.distanceM, ranges[camera.viewingRange], camera.targetDistanceM, camera.lensRecommendation, camera.notes])
    style_sheet(summary, [40, 85])
    style_sheet(materials, [22, 55, 15, 12, 35])
    style_sheet(cameras, [12, 25, 30, 16, 16, 18, 18, 24, 35, 30, 85, 45])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()
