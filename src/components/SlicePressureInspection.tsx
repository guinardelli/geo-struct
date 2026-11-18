import { useState } from "react";
import type { CoreInput } from "../core/input";
import type { SlicePressurePreparation } from "../core/slice-pressures";

const number = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumSignificantDigits: 8,
    notation: n !== 0 && Math.abs(n) < 1e-6 ? "scientific" : "standard",
  });

export function SlicePressureInspection({
  result,
  input,
}: {
  result: SlicePressurePreparation;
  input: CoreInput;
}) {
  const [selected, setSelected] = useState(0);
  const pressures = result.status === "prepared" ? result.pressures : null;
  const slice = pressures?.slices[selected] ?? pressures?.slices[0];
  const segment = slice?.waterSegmentIndex;
  const a =
    segment !== null && segment !== undefined
      ? input.water.line?.[segment]
      : null;
  const b =
    segment !== null && segment !== undefined
      ? input.water.line?.[segment + 1]
      : null;
  return (
    <details className="slice-pressure-inspection">
      <summary>Pressões de água</summary>
      <p>
        u = γw × max(0, zp − zbase), pela altura vertical no ponto médio angular
        do arco. Pressão em kPa; não representa força resultante.
      </p>
      {result.status === "blocked" && (
        <>
          <p>
            Pressões não preparadas. A geometria e os pesos disponíveis podem
            ser consultados.
          </p>
          <ul aria-label="Diagnósticos das pressões">
            {result.diagnostics.map((d, i) => (
              <li key={i}>
                {d.message}
                {d.x !== undefined && <> X = {number(d.x)} m.</>}
              </li>
            ))}
          </ul>
        </>
      )}
      {pressures && slice && (
        <>
          <p aria-label="Condição de água na inspeção">
            <strong>
              {pressures.water.mode === "dry"
                ? "Condição seca explícita"
                : "Linha piezométrica prescrita"}
            </strong>
            {pressures.water.mode === "piezometric" && (
              <> · γw = {number(pressures.water.unitWeightKNPerM3!)} kN/m³</>
            )}
            . Escolha{" "}
            {pressures.water.selection === "section"
              ? "herdada da seção"
              : "própria do caso"}
            . Origem: {pressures.water.source.trim() || "não informada"}.
          </p>
          <p aria-label="Cobertura da água na inspeção">
            Intervalo do círculo: X de {number(pressures.coverage.leftX)} a{" "}
            {number(pressures.coverage.rightX)} m.
            {pressures.water.mode === "piezometric" ? (
              <>
                {" "}
                Linha: X de {number(pressures.coverage.lineLeftX!)} a{" "}
                {number(pressures.coverage.lineRightX!)} m, sem extrapolação.
              </>
            ) : (
              <> Linha e γw inativos; pressão zero por condição seca.</>
            )}
          </p>
          <p aria-label="Resumo das pressões na inspeção">
            Pressões nos pontos amostrados: {number(pressures.minPressureKPa)} a{" "}
            {number(pressures.maxPressureKPa)} kPa ·{" "}
            {pressures.positivePressureCount} de {pressures.slices.length}{" "}
            fatias com pressão positiva.
          </p>
          <label className="field">
            <span>Conferir um ponto de base</span>
            <select
              aria-label="Fatia para inspecionar pressão"
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {pressures.slices.map((s, i) => (
                <option key={s.number} value={i}>
                  Fatia {s.number} · {number(s.pressureKPa)} kPa
                </option>
              ))}
            </select>
          </label>
          <div className="info-card" aria-label="Pressão da fatia selecionada">
            <p>
              Fatia {slice.number} · ponto do arco: X ={" "}
              {number(slice.basePoint.x)} m; Z = {number(slice.basePoint.z)} m.
            </p>
            {slice.piezometricZ !== null && (
              <p>
                Cota piezométrica: {number(slice.piezometricZ)} m · diferença
                vertical: {number(slice.signedHeadM!)} m · altura positiva
                usada: {number(slice.positiveHeadM)} m.
              </p>
            )}
            {a && b && (
              <p>
                Segmento {segment! + 1}: ({number(a.x)}; {number(a.z)}) → (
                {number(b.x)}; {number(b.z)}) m.
              </p>
            )}
            <p>
              <strong>u = {number(slice.pressureKPa)} kPa</strong>
            </p>
          </div>
          <div className="materials-table-wrap slice-table-wrap">
            <table className="materials-table" aria-label="Pressões por fatia">
              <thead>
                <tr>
                  <th>Fatia</th>
                  <th>X base (m)</th>
                  <th>Z base (m)</th>
                  <th>Z piezométrica (m)</th>
                  <th>h com sinal (m)</th>
                  <th>h positivo (m)</th>
                  <th>u (kPa)</th>
                </tr>
              </thead>
              <tbody>
                {pressures.slices.map((s) => (
                  <tr key={s.number}>
                    <td>{s.number}</td>
                    <td>{number(s.basePoint.x)}</td>
                    <td>{number(s.basePoint.z)}</td>
                    <td>
                      {s.piezometricZ === null
                        ? "Inativa"
                        : number(s.piezometricZ)}
                    </td>
                    <td>
                      {s.signedHeadM === null
                        ? "Inativa"
                        : number(s.signedHeadM)}
                    </td>
                    <td>{number(s.positiveHeadM)}</td>
                    <td>{number(s.pressureKPa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="hint">
        Pressão física prescrita, sem alteração pelo modo de resistência.
        Consulte a entrada mecânica para ue e as resultantes aproximadas da
        base. O cálculo de Fellenius é executado separadamente.
      </p>
    </details>
  );
}
