"use client";

import { FormEvent, useState } from "react";

type Estimate = {
  nvr_channels: number;
  storage_tb_raw: number;
  storage_tb_selected: number;
  poe_ports_required: number;
  poe_switch_ports_selected: number | null;
  estimated_cable_m: number;
  bom: {
    category: string;
    description: string;
    quantity: number;
    unit_cost: number;
    subtotal: number;
    source: string;
  }[];
  total_cost: number;
  margin_percent: number;
  sale_price: number;
  warnings: string[];
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [cameraCount, setCameraCount] = useState(8);
  const [outdoorCount, setOutdoorCount] = useState(3);
  const [resolution, setResolution] = useState(4);
  const [retentionDays, setRetentionDays] = useState(30);
  const [averageCable, setAverageCable] = useState(25);
  const [extraMaterialCost, setExtraMaterialCost] = useState(1000);
  const [laborCost, setLaborCost] = useState(300);
  const [margin, setMargin] = useState(35);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/v1/quotes/estimate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          camera_count: cameraCount,
          outdoor_camera_count: outdoorCount,
          resolution_mp: resolution,
          retention_days: retentionDays,
          recording_hours_per_day: 24,
          average_cable_m_per_camera: averageCable,
          wired_poe: true,
          extra_material_cost: extraMaterialCost,
          labor_cost: laborCost,
          margin_percent: margin,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setEstimate(await response.json());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo calcular la cotización."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Security Quote — MVP</h1>
      <div className="subtitle">
        Primera prueba del motor técnico-comercial para CCTV IP.
      </div>

      <form onSubmit={calculate}>
        <div className="card">
          <div className="grid">
            <div>
              <label>Cantidad de cámaras</label>
              <input
                type="number"
                min={1}
                max={64}
                value={cameraCount}
                onChange={(e) => setCameraCount(Number(e.target.value))}
              />
            </div>

            <div>
              <label>Cámaras exteriores</label>
              <input
                type="number"
                min={0}
                value={outdoorCount}
                onChange={(e) => setOutdoorCount(Number(e.target.value))}
              />
            </div>

            <div>
              <label>Resolución</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value))}
              >
                <option value={2}>2 MP</option>
                <option value={4}>4 MP</option>
                <option value={5}>5 MP</option>
                <option value={8}>8 MP</option>
              </select>
            </div>

            <div>
              <label>Días de grabación</label>
              <input
                type="number"
                min={1}
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
              />
            </div>

            <div>
              <label>Metros promedio por cámara</label>
              <input
                type="number"
                min={0}
                value={averageCable}
                onChange={(e) => setAverageCable(Number(e.target.value))}
              />
            </div>

            <div>
              <label>Materiales / equipos ($)</label>
              <input
                type="number"
                min={0}
                value={extraMaterialCost}
                onChange={(e) => setExtraMaterialCost(Number(e.target.value))}
              />
            </div>

            <div>
              <label>Mano de obra ($)</label>
              <input
                type="number"
                min={0}
                value={laborCost}
                onChange={(e) => setLaborCost(Number(e.target.value))}
              />
            </div>

            <div>
              <label>Margen bruto (%)</label>
              <input
                type="number"
                min={0}
                max={94}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={loading}>
              {loading ? "Calculando..." : "Calcular solución"}
            </button>
          </div>
        </div>
      </form>

      {error && <div className="warning">{error}</div>}

      {estimate && (
        <section className="result">
          <div className="grid">
            <div className="card">
              <div className="muted">NVR</div>
              <div className="metric">{estimate.nvr_channels} ch</div>
            </div>

            <div className="card">
              <div className="muted">Almacenamiento</div>
              <div className="metric">
                {estimate.storage_tb_selected} TB
              </div>
              <div className="muted">
                cálculo: {estimate.storage_tb_raw} TB
              </div>
            </div>

            <div className="card">
              <div className="muted">Switch PoE</div>
              <div className="metric">
                {estimate.poe_switch_ports_selected ?? "—"} puertos
              </div>
            </div>

            <div className="card">
              <div className="muted">Cable estimado</div>
              <div className="metric">{estimate.estimated_cable_m} m</div>
            </div>

            <div className="card">
              <div className="muted">Costo total</div>
              <div className="metric">${estimate.total_cost}</div>
            </div>

            <div className="card">
              <div className="muted">Venta sugerida</div>
              <div className="metric">${estimate.sale_price}</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>BOM inicial</h2>
            <table>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {estimate.bom.map((item, index) => (
                  <tr key={`${item.category}-${index}`}>
                    <td>{item.category}</td>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {estimate.warnings.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Advertencias</h2>
              {estimate.warnings.map((warning) => (
                <div className="warning" key={warning}>
                  {warning}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
