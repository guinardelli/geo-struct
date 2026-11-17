import { loadCaseUses } from "../domain/analysis";
import { useState } from "react";
import { projectSchema, type Project, type Section } from "../domain/model";
import {
  duplicateLoad,
  enableLoad,
  isLoadActive,
  loadPending,
  removeLoad,
  setLoadCondition,
} from "../domain/conditions";
import { introducedError, loadOverlaps } from "../domain/geometry";

const number = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });

export function Loads({
  project,
  section,
  onApply,
  onEdit,
  onNew,
}: {
  project: Project;
  section: Section;
  onApply: (p: Project) => void;
  onEdit: (id: string) => void;
  onNew: () => void;
}) {
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const removed = section.loads.find((l) => l.id === deleting);
  const overlaps = loadOverlaps(section);
  const apply = (operation: () => Section) => {
    try {
      const next = structuredClone(project);
      next.sections[next.sections.findIndex((s) => s.id === section.id)] =
        operation();
      const parsed = projectSchema.parse(next);
      const added = introducedError(project, parsed);
      if (added) throw new Error(added.message);
      onApply(parsed);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  return (
    <div className="materials-manager">
      <p>
        Seção: <strong>{section.name}</strong>. Alterações de condição e
        habilitação são aplicadas imediatamente e podem ser desfeitas.
      </p>
      <label className="field">
        <span>Condição de sobrecargas</span>
        <select
          value={section.loadCondition}
          onChange={(e) =>
            apply(() =>
              setLoadCondition(
                section,
                e.target.value as Section["loadCondition"],
              ),
            )
          }
        >
          <option value="unspecified">Não definida</option>
          <option value="none">Sem sobrecargas</option>
          <option value="loads">Usar sobrecargas cadastradas</option>
        </select>
      </label>
      <p className="hint">
        Somente faixas habilitadas na condição Usar sobrecargas cadastradas
        ficam ativas. Desativar preserva os dados; duplicar cria uma cópia
        desabilitada. Uma nova faixa ativa a condição de sobrecargas.
      </p>
      <button
        className="primary"
        onClick={onNew}
        disabled={section.loads.length >= 100}
      >
        Desenhar nova faixa
      </button>
      {!section.loads.length && (
        <p>
          Nenhuma faixa cadastrada. Escolha Sem sobrecargas se essa for a
          hipótese da seção.
        </p>
      )}
      <div className="materials-table-wrap">
        <table className="materials-table">
          <thead>
            <tr>
              <th>Habilitada</th>
              <th>Sobrecarga / faixa</th>
              <th>q (kPa)</th>
              <th>Estado / cadastro</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {section.loads.map((l) => (
              <tr key={l.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Habilitar ${l.name}`}
                    checked={l.enabled}
                    onChange={(e) =>
                      apply(() => enableLoad(section, l.id, e.target.checked))
                    }
                  />
                </td>
                <td>
                  <strong>{l.name}</strong>
                  <small>
                    {number(l.x1)} a {number(l.x2)} m
                  </small>
                </td>
                <td>{l.q === null ? "Não informado" : number(l.q)}</td>
                <td>
                  {isLoadActive(section, l) ? "Ativa" : "Inativa"}
                  <small>
                    {loadPending(l).length
                      ? `Falta: ${loadPending(l).join(", ")}.`
                      : "Dados preenchidos."}
                  </small>
                </td>
                <td>
                  <div className="material-row-actions">
                    <button
                      className="secondary"
                      aria-label={`Editar ${l.name}`}
                      onClick={() => onEdit(l.id)}
                    >
                      Editar
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Duplicar ${l.name}`}
                      disabled={section.loads.length >= 100}
                      onClick={() =>
                        apply(() => duplicateLoad(section, l.id).section)
                      }
                    >
                      Duplicar
                    </button>
                    <button
                      className="secondary"
                      aria-label={`Excluir ${l.name}`}
                      onClick={() => {
                        setDeleting(l.id);
                        setError("");
                      }}
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overlaps.length > 0 && (
        <div className="info-card">
          <strong>Confira as sobreposições entre faixas ativas:</strong>
          <ul>
            {overlaps.map((o) => (
              <li key={`${o.firstId}:${o.secondId}`}>
                {section.loads.find((l) => l.id === o.firstId)!.name} e{" "}
                {section.loads.find((l) => l.id === o.secondId)!.name}:{" "}
                {number(o.x1)} a {number(o.x2)} m.
              </li>
            ))}
          </ul>
          Confirme se a coexistência é intencional. Esta etapa não calcula
          esforços.
        </div>
      )}
      {removed && (
        <div
          className="material-removal"
          role="group"
          aria-label="Exclusão de sobrecarga"
        >
          <h3>Excluir {removed.name}</h3>
          <p>
            A faixa será removida desta seção. A operação pode ser desfeita.
            Excluir a última faixa não define automaticamente a condição Sem
            sobrecargas.
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              Cancelar exclusão
            </button>
            <button
              className="primary"
              onClick={() => {
                if (
                  apply(() => {
                    const uses = loadCaseUses(project, removed.id);
                    if (uses.length)
                      throw new Error(
                        `Esta faixa é selecionada nos casos: ${uses.map((c) => c.name).join(", ")}. Retire a seleção nesses casos antes de excluir.`,
                      );
                    return removeLoad(section, removed.id);
                  })
                )
                  setDeleting(null);
              }}
            >
              Confirmar exclusão
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
