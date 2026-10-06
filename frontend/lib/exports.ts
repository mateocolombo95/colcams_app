import type { CameraRequirement, QuoteEstimate, QuoteRequest, Survey } from "../types/quote";
import { getLensRecommendation } from "./cameras";

export type ExportProject = { estimate: QuoteEstimate; survey: Survey; cameras: CameraRequirement[]; requirements: QuoteRequest };

export function createExportSnapshot(project: ExportProject, now = new Date()) {
  // Use the installer's local date, independent of UTC day boundaries.
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return {
    client: project.survey.client || undefined,
    // The current survey has one site reference, no separate project/address fields.
    site: project.survey.site || undefined,
    date,
    retention_days: project.requirements.retention_days,
    recording_hours_per_day: project.requirements.recording_hours_per_day,
    estimate: project.estimate,
    cameras: project.cameras.map(camera => {
      const recommendation = getLensRecommendation(camera);
      return { ...camera, lensRecommendation: [recommendation.text, ...recommendation.warnings].join(" ") };
    }),
  };
}

export function exportFilename(snapshot: ReturnType<typeof createExportSnapshot>): string {
  const sanitize = (value: string | undefined, fallback: string) => value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 60) || fallback;
  return `colcams_${sanitize(snapshot.client, "cliente")}_${sanitize(snapshot.site, "proyecto")}_${snapshot.date}.xlsx`;
}

export async function fetchMaterialsExcel(snapshot: ReturnType<typeof createExportSnapshot>, signal?: AbortSignal): Promise<Blob> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  let response: Response;
  try {
    response = await fetch(apiUrl.replace(/\/$/, "") + "/api/v1/exports/materials.xlsx", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot), signal,
    });
  } catch {
    throw new Error(signal?.aborted ? "La generación tardó demasiado. Volvé a intentar." : "No se pudo conectar con la API para generar la planilla. Volvé a intentar.");
  }
  if (!response.ok) throw new Error(response.status === 422 ? "No se pudo generar la planilla con los datos actuales. Revisá el relevamiento." : "No se pudo generar la planilla. Volvé a intentar.");
  if (!response.headers.get("Content-Type")?.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) throw new Error("La API no devolvió una planilla Excel válida. Volvé a intentar.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("La planilla recibida está vacía. Volvé a intentar.");
  return blob;
}

export function downloadMaterialsExcel(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click(); link.remove();
  // Give browsers time to begin the download before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
