import type { QuoteEstimate, QuoteRequest } from "../types/quote";

import type { Project, ProjectInput } from "../types/quote";

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

async function projectRequest(path: string, options: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(API_URL.replace(/\/$/, "") + "/api/v1/projects" + path, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("No se pudo conectar con la API de proyectos. Verificá la conexión y volvé a intentar.");
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error("El proyecto ya no está disponible. Actualizá la lista de proyectos.");
    if (response.status === 422) throw new Error("La API rechazó los datos del proyecto. Revisá los valores ingresados; los pendientes pueden guardarse.");
    throw new Error("No se pudo completar la operación del proyecto (HTTP " + response.status + "). Volvé a intentar.");
  }
  return response;
}

export async function saveProject(data: ProjectInput, projectId?: string, signal?: AbortSignal): Promise<Project> {
  const response = await projectRequest(projectId ? "/" + encodeURIComponent(projectId) : "", {
    method: projectId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: data.survey.client,
      site_name: data.survey.site,
      notes: data.survey.notes,
      survey: data.survey,
      requirements: data.requirements,
    }),
    signal,
  });
  return response.json() as Promise<Project>;
}

export async function fetchProject(projectId: string, signal?: AbortSignal): Promise<Project> {
  const response = await projectRequest("/" + encodeURIComponent(projectId), { signal });
  return response.json() as Promise<Project>;
}

export async function listProjects(signal?: AbortSignal): Promise<Project[]> {
  const response = await projectRequest("", { signal });
  return response.json() as Promise<Project[]>;
}
