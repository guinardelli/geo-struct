import { useState } from "react";
import type { SliceMechanicsPreparation } from "../core/slice-mechanics";

const number = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumSignificantDigits: 8,
    notation: n !== 0 && Math.abs(n) < 1e-6 ? "scientific" : "standard",
  });
const mode = (m: "effective" | "total") =>
  m === "effective" ? "Efetivas" : "Totais";

export function SliceMechanicsInspection({
  result,
}: {
  result: SliceMechanicsPreparation;
}) {
  const [selected, setSelected] = useState(0);
  const data = result.status === "prepared" ? result.mechanics : null;
  const slice = data?.slices[selected] ?? data?.slices[0];
  return (
    <details className="slice-mechanics-inspection">
      <summary>Entrada mecânica</summary>
      <p>
        Dados consolidados para os métodos: base pela corda, peso próprio,
        pressão prescrita, sobrecargas e resistência do solo na base. Sem
        equilíbrio ou fator de segurança.
      </p>
      {result.status === "blocked" && (
        <>
          <p>
            Entrada mecânica não consolidada. As preparações independentes
            disponíveis podem ser inspecionadas.
          </p>
          <ul aria-label="Diagnósticos da entrada mecânica">
            {result.diagnostics.map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
        </>
      )}
      {data && slice && (
        <>
          <p aria-label="Referencial da entrada mecânica">
            Movimento:{" "}
            {data.frame.direction === "left-to-right"
              ? "esquerda → direita"
              : "direita → esquerda"}
            . Origem local no centro ({number(data.frame.origin.x)};{" "}
            {number(data.frame.origin.z)}) m; x cresce no movimento e z para
            cima. A numeração original das fatias é preservada. α positivo
            quando a base desce no movimento. O braço do peso usa a aproximação
            R sin α.
          </p>
          <p aria-label="Totais da entrada mecânica">
            W = {number(data.totalWeightKNPerM)} kN/m; Q ={" "}
            {number(data.totalSurchargeKNPerM)} kN/m; W + Q ={" "}
            {number(data.totalDownwardForceKNPerM)} kN/m, descendente. Tensões
            nas bases: {data.resistanceModes.map(mode).join(" e ")}.
          </p>
          <label className="field">
            <span>Conferir uma fatia consolidada</span>
            <select
              aria-label="Fatia para inspecionar entrada mecânica"
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {data.slices.map((s, i) => (
                <option key={s.number} value={i}>
                  Ordem {s.order} · Fatia {s.number} · {s.baseMaterial.name}
                </option>
              ))}
            </select>
          </label>
          <div className="info-card" aria-label="Geometria mecânica da fatia">
            <p>
              Ordem {slice.order} · Fatia original {slice.number}.
            </p>
            <p>
              X original: {number(slice.original.leftX)} a{" "}
              {number(slice.original.rightX)} m. Base original (X; Z): (
              {number(slice.original.basePoint.x)};{" "}
              {number(slice.original.basePoint.z)}) m.
            </p>
            <p>
              Entrada local (x; z): ({number(slice.local.entry.x)};{" "}
              {number(slice.local.entry.z)}) m. Saída local: (
              {number(slice.local.exit.x)}; {number(slice.local.exit.z)}) m.{" "}
              Ponto do arco local: ({number(slice.local.basePoint.x)};{" "}
              {number(slice.local.basePoint.z)}) m.
            </p>
            <p>
              b = {number(slice.widthM)} m · ℓ (corda) ={" "}
              {number(slice.baseLengthM)} m · α ={" "}
              {number((slice.alphaRadians * 180) / Math.PI)}°. sin α ={" "}
              {number(slice.sinAlpha)} · cos α = {number(slice.cosAlpha)} ·
              braço do peso = {number(slice.weightArmM)} m.
            </p>
          </div>
          <div className="info-card" aria-label="Resistência da base da fatia">
            <p>
              <strong>{slice.baseMaterial.name}</strong> · ID:{" "}
              {slice.baseMaterial.id} · Tensões{" "}
              {mode(slice.baseMaterial.mode).toLowerCase()}.
            </p>
            <p>
              c = {number(slice.baseMaterial.cohesionKPa)} kPa · φ ={" "}
              {number(slice.baseMaterial.frictionDegrees)}° (
              {number(slice.baseMaterial.frictionRadians)} rad) · tan φ ={" "}
              {number(slice.baseMaterial.tanPhi)}.
            </p>
            <p>
              Origem dos parâmetros:{" "}
              {slice.baseMaterial.source.trim() || "não informada"}.
            </p>
          </div>
          <div className="info-card" aria-label="Água e forças da fatia">
            <p>
              W = {number(slice.weight.weightKNPerM)} kN/m · Q ={" "}
              {number(slice.surcharge.forceKNPerM)} kN/m · W + Q ={" "}
              {number(slice.downwardForceKNPerM)} kN/m.
            </p>
            <p>
              u física = {number(slice.water.prescribed.pressureKPa)} kPa · ue
              para resistência = {number(slice.water.usedPressureKPa)} kPa.
            </p>
            <p>
              U = uℓ = {number(slice.water.physicalBaseResultantKNPerM)} kN/m ·
              Ue = ueℓ = {number(slice.water.usedBaseResultantKNPerM)} kN/m.
            </p>
            <p>
              Água:{" "}
              {data.water.mode === "dry"
                ? "condição seca"
                : "linha piezométrica"}
              ; origem: {data.water.source.trim() || "não informada"}.
            </p>
            {slice.baseMaterial.mode === "total" && (
              <p>
                O modo total zera ue e Ue; u e U físicos permanecem registrados.
              </p>
            )}
            <p>
              U representa a pressão física normal à base aproximada; Ue é a
              parcela usada conforme o modo resistente. Não são somados à carga
              vertical W + Q.
            </p>
          </div>
          {slice.surcharge.contributions.length > 0 && (
            <div className="materials-table-wrap slice-table-wrap">
              <table
                className="materials-table"
                aria-label="Sobrecargas na entrada mecânica"
              >
                <thead>
                  <tr>
                    <th>Faixa / origem</th>
                    <th>Q (kN/m)</th>
                    <th>x local (m)</th>
                    <th>z local (m)</th>
                    <th>Braço no movimento (m)</th>
                    <th>Momento no movimento (kN·m/m)</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.surcharge.contributions.map((c) => {
                    const load = data.loadDefinitions.items.find(
                      (l) => l.id === c.loadId,
                    );
                    return (
                      <tr key={c.loadId}>
                        <td>
                          {load?.name ?? c.loadId}
                          <small>ID: {c.loadId}</small>
                          <small>
                            Origem: {load?.source.trim() || "não informada"}
                          </small>
                        </td>
                        <td>{number(c.forceKNPerM)}</td>
                        <td>{number(c.localApplicationPoint.x)}</td>
                        <td>{number(c.localApplicationPoint.z)}</td>
                        <td>{number(c.armDrivingM!)}</td>
                        <td>{number(c.momentDrivingKNmPerM!)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="materials-table-wrap slice-table-wrap">
            <table
              className="materials-table"
              aria-label="Entradas mecânicas por fatia"
            >
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Fatia original</th>
                  <th>α (°)</th>
                  <th>ℓ (m)</th>
                  <th>Material da base</th>
                  <th>Modo</th>
                  <th>c (kPa)</th>
                  <th>φ (°)</th>
                  <th>W (kN/m)</th>
                  <th>Q (kN/m)</th>
                  <th>u (kPa)</th>
                  <th>ue (kPa)</th>
                  <th>U (kN/m)</th>
                  <th>Ue (kN/m)</th>
                </tr>
              </thead>
              <tbody>
                {data.slices.map((s) => (
                  <tr key={s.number}>
                    <td>{s.order}</td>
                    <td>{s.number}</td>
                    <td>{number((s.alphaRadians * 180) / Math.PI)}</td>
                    <td>{number(s.baseLengthM)}</td>
                    <td>{s.baseMaterial.name}</td>
                    <td>{mode(s.baseMaterial.mode)}</td>
                    <td>{number(s.baseMaterial.cohesionKPa)}</td>
                    <td>{number(s.baseMaterial.frictionDegrees)}</td>
                    <td>{number(s.weight.weightKNPerM)}</td>
                    <td>{number(s.surcharge.forceKNPerM)}</td>
                    <td>{number(s.water.prescribed.pressureKPa)}</td>
                    <td>{number(s.water.usedPressureKPa)}</td>
                    <td>{number(s.water.physicalBaseResultantKNPerM)}</td>
                    <td>{number(s.water.usedBaseResultantKNPerM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="hint">
        U usa a pressão constante representada no ponto médio angular e o
        comprimento de corda. A consolidação não avalia normal, tração,
        convergência, resistência mobilizada ou estabilidade.
      </p>
    </details>
  );
}
