import type { Project } from "./model";
import { diagnose, type Diagnostic } from "./geometry";
import { caseIssues, resolveCaseSection } from "./analysis";
export type AuditScope = {
  id: string;
  name: string;
  diagnostics: Diagnostic[];
};
// Derived from the current applied model; never persisted as approval or results.
export function auditProject(p: Project): AuditScope[] {
  const usedMaterials = (section: Project["sections"][number]) =>
    p.materials.filter(
      (m) =>
        m.id === section.backgroundMaterialId ||
        section.regions.some((r) => r.materialId === m.id),
    );
  const scopes = p.sections.flatMap((s) => {
    const cases = p.analysisCases.filter((c) => c.sectionId === s.id);
    const base = diagnose({
      ...p,
      sections: [s],
      materials: usedMaterials(s),
      analysisCases: [],
    });
    if (!cases.length)
      base.push({
        level: "warning",
        sectionId: s.id,
        target: "cases",
        message: `${s.name}: nenhum caso de análise cadastrado.`,
      });
    return [
      { id: s.id, name: `Seção · ${s.name}`, diagnostics: base },
      ...cases.map((c) => {
        const resolved = resolveCaseSection(s, c);
        const diagnostics = diagnose({
          ...p,
          sections: [resolved],
          materials: usedMaterials(s),
          analysisCases: [],
        })
          .filter(
            (d) =>
              !(
                (c.waterCondition === null && d.target === "water") ||
                (c.loadCondition === null &&
                  (d.target === "loads" ||
                    s.loads.some((l) => l.id === d.target)))
              ),
          )
          .map((d) => ({
            ...d,
            sectionId: s.id,
            target:
              d.target === "water" && c.waterCondition !== "section"
                ? c.id
                : d.target,
          }));
        diagnostics.push(
          ...caseIssues(c).map((d) => ({
            ...d,
            sectionId: s.id,
            target: c.id,
            message: `${c.name}: ${d.message}`,
          })),
        );
        return { id: c.id, name: `Caso · ${s.name} / ${c.name}`, diagnostics };
      }),
    ];
  });
  const unused = p.materials.filter(
    (m) =>
      !p.sections.some((s) =>
        usedMaterials(s).some((used) => used.id === m.id),
      ),
  );
  if (unused.length)
    scopes.push({
      id: p.id,
      name: "Cadastro · materiais sem uso",
      diagnostics: diagnose({
        ...p,
        sections: [],
        analysisCases: [],
        materials: unused,
      }),
    });
  return scopes;
}
export const auditCounts = (diagnostics: Diagnostic[]) => ({
  errors: diagnostics.filter((d) => d.level === "error").length,
  warnings: diagnostics.filter((d) => d.level === "warning").length,
});
