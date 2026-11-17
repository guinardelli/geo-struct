import { useState } from "react";
import type { CoreInput } from "../core/input";
import type { SliceWeightPreparation } from "../core/slice-weights";

const number = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumSignificantDigits: 8,
    notation: n !== 0 && Math.abs(n) < 1e-6 ? "scientific" : "standard",
  });
type Prepared = Extract<SliceWeightPreparation, { status: "prepared" }>;

export function SliceWeightInspection({
  result,
  input,
}: {
  result: SliceWeightPreparation;
  input: CoreInput;
}) {
  const [selected, setSelected] = useState(0);
  const sourceName = (id: string | null) =>
    id === null
      ? "Solo de fundo"
      : (input.geometry.regions.find((r) => r.id === id)?.name ?? id);
  const table = (
    label: string,
    materials: Prepared["weights"]["materials"],
  ) => (
    <div className="materials-table-wrap slice-table-wrap">
      <table className="materials-table" aria-label={label}>
        <thead>
          <tr>
            <th>Material</th>
            <th>Área (m²)</th>
            <th>γ total (kN/m³)</th>
            <th>Peso próprio (kN/m)</th>
            <th>Parcelas por origem</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => (
            <tr
              key={material.materialId}
              data-weight-material-id={material.materialId}
            >
              <td>
                {material.materialName}
                <p className="hint">
                  Origem de γ:{" "}
                  {material.parameterSource.trim()
                    ? material.parameterSource
                    : "não informada"}
                </p>
              </td>
              <td>{number(material.areaM2)}</td>
              <td>{number(material.unitWeightKNPerM3)}</td>
              <td>{number(material.weightKNPerM)}</td>
              <td>
                <ul>
                  {material.sources.map((source) => (
                    <li
                      key={
                        source.regionId === null
                          ? "background"
                          : `region:${source.regionId}`
                      }
                    >
                      {sourceName(source.regionId)}: {number(source.areaM2)} m²
                      → {number(source.weightKNPerM)} kN/m
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const weights = result.status === "prepared" ? result.weights : null;
  const slice = weights?.slices[selected] ?? weights?.slices[0];
  return (
    <details className="slice-weight-inspection">
      <summary>Pesos por fatia</summary>
      <p>
        Peso próprio = soma de γ total × área. Valores em kN/m, por metro de
        largura fora do plano, dirigidos para baixo. Água e sobrecargas não são
        adicionadas ao peso próprio.
      </p>
      {result.status === "blocked" && (
        <>
          <p>
            Pesos não preparados. A geometria e suas áreas permanecem
            disponíveis.
          </p>
          <ul aria-label="Diagnósticos dos pesos">
            {result.diagnostics.map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
        </>
      )}
      {weights && slice && (
        <>
          <p aria-label="Peso próprio total na inspeção">
            <strong>
              Peso próprio total: {number(weights.totalWeightKNPerM)} kN/m
            </strong>
          </p>
          <h3>Totais por material</h3>
          {table("Pesos totais por material", weights.materials)}
          <label className="field">
            <span>Contribuições de uma fatia</span>
            <select
              aria-label="Fatia para inspecionar pesos"
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {weights.slices.map((s, i) => (
                <option key={s.number} value={i}>
                  Fatia {s.number} · {number(s.weightKNPerM)} kN/m
                </option>
              ))}
            </select>
          </label>
          <p aria-label="Peso próprio da fatia selecionada">
            Fatia {slice.number}:{" "}
            <strong>{number(slice.weightKNPerM)} kN/m</strong>.
          </p>
          {table(
            `Pesos por material da fatia ${slice.number}`,
            slice.materials,
          )}
        </>
      )}
      <p className="hint">
        Pressões, resultantes de sobrecarga, momentos, equilíbrio e fator de
        segurança ainda não calculados.
      </p>
    </details>
  );
}
