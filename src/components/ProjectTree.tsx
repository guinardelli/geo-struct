import {
  ChevronDown,
  Mountain,
  Layers3,
  Waves,
  ArrowDownToLine,
  CircleDashed,
  Folder,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { Project, Section, Selection } from "../domain/model";
import {
  waterModeLabel,
  loadConditionLabel,
  isLoadActive,
} from "../domain/conditions";
import { materialName, materialPending } from "../domain/materials";
export function ProjectTree({
  project,
  section,
  selection,
  onSelect,
  onSection,
  onAddSection,
  onManageLoads,
  onManageCases,
}: {
  project: Project;
  section: Section;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onSection: (id: string) => void;
  onAddSection: () => void;
  onManageLoads: () => void;
  onManageCases: () => void;
}) {
  const active = (kind: Selection["kind"], id?: string) =>
    selection.kind === kind &&
    (!id || ("id" in selection && selection.id === id));
  return (
    <aside className="project-tree" aria-label="Navegador do projeto">
      <div className="panel-heading">
        <span>PROJETO</span>
        <button
          className="icon-button"
          onClick={onAddSection}
          title="Nova seção"
          aria-label="Adicionar seção"
        >
          <Plus size={16} />
        </button>
      </div>
      <button
        className={`tree-root ${active("project") ? "selected" : ""}`}
        onClick={() => onSelect({ kind: "project" })}
      >
        <Folder size={17} />
        <span>{project.name}</span>
      </button>
      <div className="tree-section-label">
        <ChevronDown size={14} /> Seções <span>{project.sections.length}</span>
      </div>
      {project.sections.map((s) => (
        <div key={s.id}>
          <button
            className={`tree-item section ${s.id === section.id ? "current" : ""}`}
            onClick={() => onSection(s.id)}
          >
            <Mountain size={16} />
            <span>{s.name}</span>
            {s.id === section.id && <span className="active-dot" />}
          </button>
          {s.id === section.id && (
            <div className="tree-children">
              <button
                className={`tree-item ${active("section") ? "selected" : ""}`}
                onClick={() => onSelect({ kind: "section" })}
              >
                <SlidersHorizontal size={14} />
                Dados da seção
              </button>
              <button
                className={`tree-item ${active("terrain") ? "selected" : ""}`}
                onClick={() => onSelect({ kind: "terrain" })}
                title={`Solo de fundo: ${materialName(project, s.backgroundMaterialId)}`}
              >
                <Mountain size={14} />
                Terreno
                {s.backgroundMaterialId === null && (
                  <span
                    className="material-marker"
                    title="Solo de fundo sem material"
                    aria-hidden="true"
                  >
                    !
                  </span>
                )}
              </button>
              {s.regions.map((r) => (
                <button
                  key={r.id}
                  className={`tree-item ${active("region", r.id) ? "selected" : ""}`}
                  onClick={() => onSelect({ kind: "region", id: r.id })}
                  title={`Material: ${materialName(project, r.materialId)}`}
                >
                  <span
                    className="soil-swatch"
                    style={{
                      background:
                        project.materials.find((m) => m.id === r.materialId)
                          ?.color ?? "#a4a7a9",
                    }}
                  />
                  <span>{r.name}</span>
                  {r.materialId === null && (
                    <span
                      className="material-marker"
                      title="Sem material"
                      aria-hidden="true"
                    >
                      !
                    </span>
                  )}
                </button>
              ))}
              <button
                className={`tree-item ${active("water") ? "selected" : ""}`}
                onClick={() => onSelect({ kind: "water" })}
              >
                <Waves size={14} />
                <span>{waterModeLabel(s.waterMode)}</span>
              </button>
              <button className="tree-item" onClick={onManageLoads}>
                <ArrowDownToLine size={14} />
                <span>{loadConditionLabel(s.loadCondition)}</span>
              </button>
              {s.loads.map((l) => (
                <button
                  key={l.id}
                  className={`tree-item ${active("load", l.id) ? "selected" : ""}`}
                  onClick={() => onSelect({ kind: "load", id: l.id })}
                >
                  <ArrowDownToLine size={14} />
                  <span>{l.name}</span>
                  {!isLoadActive(s, l) && (
                    <span className="draft-badge" aria-hidden="true">
                      Inativa
                    </span>
                  )}
                </button>
              ))}
              <button className="tree-item" onClick={onManageCases}>
                <CircleDashed size={14} />
                <span>Casos de análise</span>
              </button>
              {project.analysisCases
                .filter((c) => c.sectionId === s.id)
                .map((c) => (
                  <button
                    key={c.id}
                    className={`tree-item ${active("case", c.id) ? "selected" : ""}`}
                    onClick={() => onSelect({ kind: "case", id: c.id })}
                  >
                    <CircleDashed size={14} />
                    <span>{c.name}</span>
                  </button>
                ))}
              {s.circle && (
                <button
                  className={`tree-item ${active("circle") ? "selected" : ""}`}
                  onClick={() => onSelect({ kind: "circle" })}
                >
                  <CircleDashed size={14} />
                  Círculo de tentativa
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="tree-section-label">
        <ChevronDown size={14} /> Materiais{" "}
        <span>{project.materials.length}</span>
      </div>
      {project.materials.map((m) => (
        <button
          key={m.id}
          className={`tree-item ${active("material", m.id) ? "selected" : ""}`}
          onClick={() => onSelect({ kind: "material", id: m.id })}
          title={
            materialPending(m).length
              ? `Falta: ${materialPending(m).join(", ")}`
              : "Dados preenchidos"
          }
        >
          <span className="soil-swatch" style={{ background: m.color }} />
          <span>{m.name}</span>
          {materialPending(m).length > 0 && (
            <span className="material-marker" aria-hidden="true">
              !
            </span>
          )}
        </button>
      ))}
      <div className="tree-footer">
        <Layers3 size={15} />
        <span>
          Materiais compartilhados
          <br />
          entre as seções do projeto
        </span>
      </div>
    </aside>
  );
}
