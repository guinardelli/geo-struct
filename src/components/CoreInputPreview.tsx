import type { InputPreparation } from "../core/input";
import { directionLabel, surfaceLabel } from "../domain/analysis";
import { waterModeLabel, loadConditionLabel } from "../domain/conditions";

export function CoreInputPreview({
  prepared,
  dirty,
}: {
  prepared: InputPreparation;
  dirty: boolean;
}) {
  const input = prepared.snapshot?.input;
  return (
    <details className="core-input-preview">
      <summary>Entradas para o núcleo</summary>
      <section aria-label="Entradas para o núcleo">
        <p role="status">
          <strong>
            {prepared.status === "collected"
              ? "Entradas reunidas"
              : prepared.status === "pending"
                ? "Entradas com pendências"
                : "Entrada indisponível"}
          </strong>
        </p>
        <p className="hint">
          {dirty
            ? "Há alterações em edição. Esta conferência usa os dados anteriores até Aplicar caso."
            : "Conferência dos dados aplicados. Atualiza ao alterar o caso ou seus dados compartilhados."}
        </p>
        {input && (
          <>
            <p>
              {directionLabel(input.analysis.direction)} ·{" "}
              {surfaceLabel(input.surface.mode)}
            </p>
            <p>
              {input.geometry.terrain.length} pontos no terreno ·{" "}
              {input.geometry.regions.length} regiões · {input.materials.length}{" "}
              materiais referenciados.
            </p>
            <p>
              {waterModeLabel(input.water.mode)} ·{" "}
              {input.water.selection === "section"
                ? "herdada da seção"
                : input.water.selection === null
                  ? "escolha pendente no caso"
                  : "definida no caso"}
            </p>
            {input.water.mode === "piezometric" && (
              <p>
                {input.water.line?.length ?? 0} pontos na linha · γw:{" "}
                {input.water.unitWeight ?? "pendente"} kN/m³
              </p>
            )}
            <p>
              {loadConditionLabel(input.loads.condition)} ·{" "}
              {input.loads.items.length} faixas ativas.
            </p>
            {!!input.loads.items.length && (
              <ul>
                {input.loads.items.map((load) => (
                  <li key={load.id}>
                    {load.name}: q = {load.q ?? "pendente"} kPa
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">
              Coordenadas originais X/Z em m; tensões em kPa; ângulos em graus.
            </p>
          </>
        )}
        {!!prepared.diagnostics.length && (
          <ul aria-label="Diagnósticos das entradas">
            {prepared.diagnostics.map((d, i) => (
              <li key={i}>
                {d.level === "error"
                  ? "Erro: "
                  : d.level === "info"
                    ? "Informação: "
                    : "Revisar: "}
                {d.message}
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          Esta conferência reúne entradas. O cálculo de Fellenius é executado
          separadamente, após preparar as fatias do círculo fixo.
        </p>
      </section>
    </details>
  );
}
