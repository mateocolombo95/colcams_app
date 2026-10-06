import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function EmailExportModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return createPortal(<dialog ref={dialog} className="camera-dialog" aria-labelledby="export-email-title" onCancel={onClose}>
    <form onSubmit={event => { event.preventDefault(); setMessage("El envío por email todavía no está configurado. Podés descargar la planilla."); }}>
      <h2 id="export-email-title">Enviar por email</h2>
      <div className="field"><label htmlFor="export-email">Email</label><input id="export-email" autoFocus type="email" autoComplete="email" required /></div>
      <p className="muted small">El envío por email todavía no está configurado. Podés descargar la planilla.</p>
      <p role="status">{message}</p>
      <div className="camera-editor-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button type="submit" className="primary">Enviar</button></div>
    </form>
  </dialog>, document.body);
}
