import { useMemo, useState } from "react";
import type { InputPreparation } from "../core/input";
import {
  prepareFixedCircleGeometry,
  type CutReason,
  type FixedCirclePreparation,
} from "../core/fixed-circle";
import { parseNumber } from "../domain/geometry";
import { Dialog } from "./Dialog";
import { MaterialAreaInspection } from "./MaterialAreaInspection";
import { prepareSliceWeights } from "../core/slice-weights";
import { SliceWeightInspection } from "./SliceWeightInspection";

export type GeometryFields = { tolerance: string; angle: string };
export type FixedCirclePreviewProps = {
  preparation: InputPreparation;
  values: GeometryFields;
  result: FixedCirclePreparation | null;
  dirty: boolean;
  onChange: (values: GeometryFields) => void;
  onPrepare: (result: FixedCirclePreparation) => void;
};
const number = (n: number) =>
  n.toLocaleString("pt-BR", { maximumSignificantDigits: 8 });
const reasonLabel: Record<CutReason["kind"], string> = {
  "terrain-intersection": "Encontro com terreno",
  "terrain-vertex": "Vértice do terreno",
  "material-interface": "Interface de região",
  "water-node": "Nó da linha piezométrica",
  "water-intersection": "Encontro com linha piezométrica",
  "load-boundary": "Extremo de faixa",
  refinement: "Refinamento angular",
};

export function FixedCirclePreview({
  preparation,
  values,
  result,
  dirty,
  onChange,
  onPrepare,
}: FixedCirclePreviewProps) {
  const [table, setTable] = useState(false);
  const weights = useMemo(
    () =>
      result?.status === "prepared"
        ? prepareSliceWeights(preparation, result)
        : null,
    [preparation, result],
  );
  const weightsBySlice = new Map(
    !dirty && weights?.status === "prepared"
      ? weights.weights.slices.map((s) => [s.number, s.weightKNPerM])
      : [],
  );
  const input = preparation.snapshot?.input;
  const allowed =
    !!input &&
    input.surface.mode === "fixed" &&
    !dirty &&
    !!values.tolerance.trim();
  const prepare = () => {
    if (!allowed) return;
    onPrepare(
      prepareFixedCircleGeometry(preparation, {
        toleranceM: parseNumber(values.tolerance) ?? NaN,
        maxArcDegrees: parseNumber(values.angle) ?? NaN,
      }),
    );
  };
  const material = (id: string) =>
    input?.materials.find((m) => m.id === id)?.name ?? id;
  const source = (r: CutReason) => {
    const name =
      input?.geometry.regions.find((region) => region.id === r.sourceId)
        ?.name ??
      input?.loads.items.find((load) => load.id === r.sourceId)?.name;
    return `${reasonLabel[r.kind]}${name ? ` · ${name}` : ""}${r.index !== undefined ? ` · ${r.index + 1}` : ""}`;
  };
  return (
    <details className="fixed-circle-preview">
      <summary>Geometria do círculo fixo</summary>
      <section aria-label="Geometria do círculo fixo">
        <p className="hint">
          Prepare as interseções e fatias dos dados aplicados. A tolerância é
          explícita e independente da captura do editor.
        </p>
        <label className="field">
          <span>Tolerância geométrica (m)</span>
          <input
            aria-label="Tolerância geométrica (m)"
            inputMode="decimal"
            value={values.tolerance}
            onChange={(e) => onChange({ ...values, tolerance: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                prepare();
              }
            }}
          />
        </label>
        <label className="field">
          <span>Abertura máxima por fatia (°)</span>
          <input
            aria-label="Abertura máxima por fatia (°)"
            inputMode="decimal"
            value={values.angle}
            onChange={(e) => onChange({ ...values, angle: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                prepare();
              }
            }}
          />
        </label>
        <p className="hint">
          Até 3° por fatia; use um valor menor para refinar. Perfil usado apenas
          nesta sessão.
        </p>
        {dirty && (
          <p className="hint">
            Aplique ou descarte o rascunho do caso antes de preparar as fatias.
          </p>
        )}
        {input?.surface.mode !== "fixed" && (
          <p className="hint">
            Selecione círculo fixo nas propriedades do caso.
          </p>
        )}
        <button
          className="secondary"
          type="button"
          onClick={prepare}
          disabled={!allowed}
        >
          Preparar fatias
        </button>
        {result?.status === "blocked" && (
          <ul aria-label="Diagnósticos da geometria">
            {result.diagnostics.map((d) => (
              <li key={d.code}>{d.message}</li>
            ))}
          </ul>
        )}
        {result?.status === "prepared" && (
          <>
            <p aria-live="polite">
              <strong>{result.geometry.slices.length} fatias preparadas</strong>{" "}
              · área geométrica: {number(result.geometry.areaM2)} m².
            </p>
            {!dirty && weights?.status === "prepared" && (
              <p aria-label="Peso próprio total">
                Peso próprio total:{" "}
                <strong>
                  {number(weights.weights.totalWeightKNPerM)} kN/m
                </strong>
                , por metro de largura fora do plano.
              </p>
            )}
            {!dirty && weights?.status === "blocked" && (
              <>
                <p>Pesos não preparados; as áreas continuam disponíveis.</p>
                <ul aria-label="Diagnósticos dos pesos">
                  {weights.diagnostics.map((d, i) => (
                    <li key={i}>{d.message}</li>
                  ))}
                </ul>
              </>
            )}
            <button
              className="secondary"
              type="button"
              disabled={dirty}
              onClick={() => setTable(true)}
            >
              Inspecionar fatias
            </button>
          </>
        )}
        {!result && (
          <p className="hint">
            Prepare novamente após alterar os dados ou o perfil geométrico.
          </p>
        )}
        <p className="hint">
          Preparação de geometria e peso próprio. Pressões, sobrecargas e fator
          de segurança ainda não calculados.
        </p>
      </section>
      {table && !dirty && result?.status === "prepared" && (
        <Dialog
          title="Inspeção das fatias"
          wide
          onClose={() => setTable(false)}
          description="Coordenadas originais X/Z. Áreas até o arco circular e peso próprio pelos materiais. Inclinação geométrica da corda em relação a +X. Sem equações de equilíbrio ou FS."
        >
          <div className="slice-inspection">
            <p>
              {input?.origin.analysisCase.name} · tolerância{" "}
              {number(result.profile.toleranceM)} m · abertura máxima{" "}
              {number(result.profile.maxArcDegrees)}°.
            </p>
            <p>
              Área total: <strong>{number(result.geometry.areaM2)} m²</strong>.{" "}
              {result.geometry.slices.length} fatias.
            </p>
            <h3>Interseções com o terreno</h3>
            <ul>
              {result.intersections.map((hit, i) => (
                <li key={i}>
                  X = {number(hit.point.x)} m · Z = {number(hit.point.z)} m ·
                  segmentos {hit.segments.map((s) => s + 1).join(", ")}
                </li>
              ))}
            </ul>
            <div className="materials-table-wrap slice-table-wrap">
              <table
                className="materials-table"
                aria-label="Fatias geométricas"
              >
                <thead>
                  <tr>
                    <th>Fatia</th>
                    <th>X inicial (m)</th>
                    <th>X final (m)</th>
                    <th>Largura (m)</th>
                    <th>Área (m²)</th>
                    <th>Arco (m)</th>
                    <th>Corda (m)</th>
                    <th>Inclinação +X (°)</th>
                    <th>Material na base</th>
                    <th>Peso próprio (kN/m)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.geometry.slices.map((s) => (
                    <tr key={s.number}>
                      <td>{s.number}</td>
                      <td>{number(s.left.x)}</td>
                      <td>{number(s.right.x)}</td>
                      <td>{number(s.widthM)}</td>
                      <td>{number(s.areaM2)}</td>
                      <td>{number(s.arcLengthM)}</td>
                      <td>{number(s.chordLengthM)}</td>
                      <td>{number((s.chordAngleRadians * 180) / Math.PI)}</td>
                      <td>{material(s.baseMaterialId)}</td>
                      <td>
                        {weightsBySlice.has(s.number)
                          ? number(weightsBySlice.get(s.number)!)
                          : "Pendente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {input && (
              <MaterialAreaInspection
                geometry={result.geometry}
                input={input}
              />
            )}
            {input && weights && (
              <SliceWeightInspection result={weights} input={input} />
            )}
            <details>
              <summary>Origem dos cortes</summary>
              <div className="materials-table-wrap slice-table-wrap">
                <table
                  className="materials-table"
                  aria-label="Origem dos cortes"
                >
                  <thead>
                    <tr>
                      <th>X (m)</th>
                      <th>Z do arco (m)</th>
                      <th>Motivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.geometry.cuts.map((cut, i) => (
                      <tr key={i}>
                        <td>{number(cut.x)}</td>
                        <td>{number(cut.baseZ)}</td>
                        <td>{cut.reasons.map(source).join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </Dialog>
      )}
    </details>
  );
}
