import { useState } from "react";
import type { CoreInput } from "../core/input";
import type { FixedCircleGeometry } from "../core/fixed-circle";

const number = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumSignificantDigits: 8,
    notation: n !== 0 && Math.abs(n) < 1e-6 ? "scientific" : "standard",
  });

export function MaterialAreaInspection({
  geometry,
  input,
}: {
  geometry: FixedCircleGeometry;
  input: CoreInput;
}) {
  const [selected, setSelected] = useState(0);
  const slice = geometry.slices[selected];
  const materialName = (id: string) =>
    input.materials.find((m) => m.id === id)?.name ?? id;
  const sourceName = (id: string | null) =>
    id === null
      ? "Solo de fundo"
      : (input.geometry.regions.find((r) => r.id === id)?.name ?? id);
  const table = (
    label: string,
    materials: FixedCircleGeometry["materialAreas"],
  ) => (
    <div className="materials-table-wrap slice-table-wrap">
      <table className="materials-table" aria-label={label}>
        <thead>
          <tr>
            <th>Material</th>
            <th>Área (m²)</th>
            <th>Origem das parcelas</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => (
            <tr
              key={material.materialId}
              data-material-id={material.materialId}
            >
              <td>{materialName(material.materialId)}</td>
              <td>{number(material.areaM2)}</td>
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
  const conservation = (
    label: string,
    item: Pick<FixedCircleGeometry, "areaM2" | "areaBalance">,
  ) => (
    <p className="hint" aria-label={label}>
      Área geométrica: {number(item.areaM2)} m² · soma das subáreas:{" "}
      {number(item.areaBalance.sumM2)} m² · diferença:{" "}
      {number(item.areaBalance.residualM2)} m² · limite de comparação:{" "}
      {number(item.areaBalance.limitM2)} m².
    </p>
  );
  return (
    <details className="slice-material-inspection">
      <summary>Áreas por material</summary>
      <p>
        Composição entre o terreno e o arco. O material da base é identificado
        separadamente. Os pesos próprios estão no painel Pesos por fatia.
      </p>
      <h3>Totais da massa</h3>
      {table("Áreas totais por material", geometry.materialAreas)}
      {conservation("Conservação da área total", geometry)}
      <label className="field">
        <span>Composição de uma fatia</span>
        <select
          aria-label="Fatia para inspecionar materiais"
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
        >
          {geometry.slices.map((s, i) => (
            <option key={s.number} value={i}>
              Fatia {s.number} · X = {number(s.left.x)} a {number(s.right.x)} m
            </option>
          ))}
        </select>
      </label>
      <p>
        Material na base da fatia {slice.number}:{" "}
        <strong>{materialName(slice.baseMaterialId)}</strong>.
      </p>
      {table(
        `Áreas por material da fatia ${slice.number}`,
        slice.materialAreas,
      )}
      {conservation("Conservação da área da fatia", slice)}
    </details>
  );
}
