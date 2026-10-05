import type { QuoteEstimate, QuoteRequest } from "../types/quote";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function estimateQuote(data: QuoteRequest, signal?: AbortSignal): Promise<QuoteEstimate> {
  let response: Response;
  try {
    response = await fetch(API_URL.replace(/\/$/, "") + "/api/v1/quotes/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("No se pudo conectar con el backend. Verificá la conexión y que la API esté disponible, y volvé a intentar.");
  }
  if (!response.ok) {
    throw new Error(response.status === 422
      ? "La API rechazó los datos. Volvé a editar y revisá los valores ingresados."
      : "No se pudo calcular la cotización (HTTP " + response.status + "). Intentá nuevamente.");
  }
  return response.json() as Promise<QuoteEstimate>;
}
