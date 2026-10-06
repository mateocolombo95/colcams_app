"use client";

import { useState } from "react";
import { createExportSnapshot, downloadMaterialsExcel, exportFilename, fetchMaterialsExcel, type ExportProject } from "../../lib/exports";
import EmailExportModal from "./EmailExportModal";

export default function ProjectExport({ project }: { project: ExportProject }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  async function download() {
    setLoading(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const snapshot = createExportSnapshot(project);
      const blob = await fetchMaterialsExcel(snapshot, controller.signal);
      downloadMaterialsExcel(blob, exportFilename(snapshot));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "No se pudo descargar la planilla. Volvé a intentar.");
    } finally { clearTimeout(timeout); setLoading(false); }
  }
  return <section className="card" aria-labelledby="project-export-title">
    <h2 id="project-export-title">Exportar proyecto</h2>
    <div className="camera-editor-actions"><button type="button" className="primary" disabled={loading} onClick={download}>{loading ? "Generando Excel…" : "Descargar Excel"}</button><button type="button" className="secondary" onClick={() => setEmailOpen(true)}>Enviar por email</button></div>
    <p role="status" aria-live="polite">{loading ? "Generando la planilla del resultado actual…" : ""}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {emailOpen && <EmailExportModal onClose={() => setEmailOpen(false)} />}
  </section>;
}
