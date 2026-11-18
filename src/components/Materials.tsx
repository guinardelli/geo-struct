import { useState } from "react";
import type { Project, Section, Selection } from "../domain/model";
import {
  assignMaterial,
  materialMode,
  materialName,
  materialPending,
  materialUses,
  type MaterialUse,
  type MaterialDestination,
} from "../domain/materials";

export function Materials({
  project,
  onEdit,
  onNew,
  onDuplicate,
  onRemove,
  onLocate,
}: {
  project: Project;
  onEdit: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string, replacement?: string) => void;
  onLocate: (use: MaterialUse) => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState("");
  const removed = project.materials.find((m) => m.id === deleting);
  const uses = removed ? materialUses(project, removed.id) : [];
  return (
    <div className="materials-manager">
      <p className="hint">
        Materiais são compartilhados por todas as seções. “Dados preenchidos”
        indica cadastro completo, sem comprovar a adequação dos parâmetros para
        uma análise de estabilidade.
      </p>
      <button
        className="primary"
        onClick={onNew}
        disabled={project.materials.length >= 100}
      >
        Criar material
      </button>
      {!project.materials.length && (
        <p>
          Nenhum material cadastrado. Você pode continuar a geometria e atribuir
          os materiais depois.
        </p>
      )}
      <div className="materials-table-wrap">
        <table className="materials-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Cadastro</th>
              <th>Onde é usado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {project.materials.map((m) => {
              const pending = materialPending(m),
                locations = materialUses(project, m.id);
              return (
                <tr key={m.id}>
                  <td>
                    <span
                      className="soil-swatch"
                      style={{ background: m.color }}
                    />{" "}
                    <strong>{m.name}</strong>
                    <small>{materialMode(m.mode)}</small>
                  </td>
                  <td>
                    {pending.length ? (
                      <>
                        <span className="material-pending">
                          {pending.length} pendências
                        </span>
                        <small>Falta: {pending.join(", ")}.</small>
                      </>
                    ) : (
                      <span>Dados preenchidos</span>
                    )}
                  </td>
                  <td>
                    {locations.length ? (
                      <details>
                        <summary>{locations.length} atribuições</summary>
                        {locations.map((use, i) => (
                          <button
                            className="text-button material-location"
                            key={i}
                            onClick={() => onLocate(use)}
                          >
                            {use.sectionName} · {use.label}
                          </button>
                        ))}
                      </details>
                    ) : (
                      "Sem uso"
                    )}
                  </td>
                  <td>
                    <div className="material-row-actions">
                      <button
                        className="secondary"
                        aria-label={`Editar ${m.name}`}
                        onClick={() => onEdit(m.id)}
                      >
                        Editar
                      </button>
                      <button
                        className="secondary"
                        aria-label={`Duplicar ${m.name}`}
                        disabled={project.materials.length >= 100}
                        onClick={() => {
                          try {
                            onDuplicate(m.id);
                            setError("");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Duplicar
                      </button>
                      <button
                        className="secondary"
                        aria-label={`Excluir ${m.name}`}
                        onClick={() => {
                          setDeleting(m.id);
                          setReplacement("");
                          setError("");
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {removed && (
        <form
          className="material-removal"
          aria-label="Exclusão de material"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onRemove(removed.id, replacement || undefined);
              setDeleting(null);
              setError("");
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <h3>Excluir {removed.name}</h3>
          {uses.length ? (
            <>
              <p>
                Este material tem {uses.length} atribuições. Elas serão
                substituídas em todas as seções, na mesma operação de desfazer.
              </p>
              <label className="field">
                <span>Material substituto</span>
                <select
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                >
                  <option value="">Selecione outro material</option>
                  {project.materials
                    .filter((m) => m.id !== removed.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              {project.materials.length === 1 && (
                <p className="hint">
                  Cadastre outro material ou retire explicitamente as
                  atribuições antes de excluir este.
                </p>
              )}
            </>
          ) : (
            <p>O material não está atribuído. A exclusão pode ser desfeita.</p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleting(null)}
            >
              Cancelar exclusão
            </button>
            <button
              className="primary"
              type="submit"
              disabled={uses.length > 0 && !replacement}
            >
              {uses.length ? "Substituir e excluir" : "Confirmar exclusão"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function MaterialAssignment({
  project,
  section,
  selection,
  onApply,
  onCancel,
}: {
  project: Project;
  section: Section;
  selection: Selection;
  onApply: (p: Project) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState("");
  const [selected, setSelected] = useState<string[]>(
    selection.kind === "terrain" || selection.kind === "section"
      ? ["background"]
      : selection.kind === "region"
        ? [`region:${selection.id}`]
        : [],
  );
  const [error, setError] = useState("");
  const targets = [
    {
      key: "background",
      label: "Solo de fundo",
      materialId: section.backgroundMaterialId,
      destination: { kind: "background" } as MaterialDestination,
    },
    ...section.regions.map((r) => ({
      key: `region:${r.id}`,
      label: r.name,
      materialId: r.materialId,
      destination: { kind: "region", id: r.id } as MaterialDestination,
    })),
  ];
  const chosen = project.materials.find((m) => `material:${m.id}` === choice);
  return (
    <form
      className="material-assignment"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (!choice)
            throw new Error(
              "Escolha um material ou a opção de retirar a atribuição.",
            );
          onApply(
            assignMaterial(
              project,
              section.id,
              targets
                .filter((t) => selected.includes(t.key))
                .map((t) => t.destination),
              choice === "unassigned" ? null : (chosen?.id ?? ""),
            ),
          );
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p>
        Atribuição na seção <strong>{section.name}</strong>. A operação será
        aplicada aos destinos marcados em um único passo de histórico.
      </p>
      <label className="field">
        <span>Material a atribuir</span>
        <select
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setError("");
          }}
        >
          <option value="">Selecione uma opção</option>
          {project.materials.map((m) => (
            <option key={m.id} value={`material:${m.id}`}>
              {m.name}
            </option>
          ))}
          <option value="unassigned">
            Retirar atribuição — deixar sem material
          </option>
        </select>
      </label>
      {chosen && materialPending(chosen).length > 0 && (
        <p className="material-pending">
          O material pode ser atribuído, mas faltam:{" "}
          {materialPending(chosen).join(", ")}.
        </p>
      )}
      <div className="assignment-shortcuts">
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setSelected(
              targets.filter((t) => t.materialId === null).map((t) => t.key),
            )
          }
        >
          Marcar sem material
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setSelected(targets.map((t) => t.key))}
        >
          Marcar todos
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setSelected([])}
        >
          Limpar seleção
        </button>
      </div>
      <fieldset>
        <legend>Destinos</legend>
        {targets.map((t) => (
          <label className="assignment-target" key={t.key}>
            <input
              type="checkbox"
              checked={selected.includes(t.key)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, t.key]
                    : ids.filter((id) => id !== t.key),
                )
              }
            />
            <span>
              {t.label}
              <small>Atual: {materialName(project, t.materialId)}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="primary"
          type="submit"
          disabled={!choice || !selected.length}
        >
          Aplicar atribuição
        </button>
      </div>
    </form>
  );
}
