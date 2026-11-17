import { describe, it, expect } from "vitest";
import {
  exampleProject,
  newSection,
  serializeProject,
  readProject,
} from "../../src/domain/model";
import { addAnalysisCase } from "../../src/domain/analysis";
import { auditProject } from "../../src/domain/audit";
function fixture() {
  const p = exampleProject();
  const r = addAnalysisCase(p, p.sections[0].id);
  Object.assign(r.analysisCase, {
    description: "Teste",
    direction: "left-to-right",
    methods: ["bishop"],
    surfaceMode: "fixed",
    fixedCircle: { x: 20, y: 30, radius: 15 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return r;
}
describe("conferência integrada", () => {
  it("indica falta de caso sem criar dados ou modificar o projeto", () => {
    const p = exampleProject(),
      text = serializeProject(p);
    expect(
      auditProject(p)[0].diagnostics.some((d) => d.target === "cases"),
    ).toBe(true);
    expect(serializeProject(p)).toBe(text);
  });
  it("inclui geometria e materiais compartilhados nos casos afetados", () => {
    const { project: p, analysisCase: c } = fixture();
    p.sections[0].base = 100;
    p.materials[0].cohesion = null;
    const scope = auditProject(p).find((s) => s.id === c.id)!;
    expect(scope.diagnostics.some((d) => d.level === "error")).toBe(true);
    expect(scope.diagnostics.some((d) => d.target === p.materials[0].id)).toBe(
      true,
    );
  });
  it("isola seções e materiais sem uso", () => {
    const { project: p, analysisCase: c } = fixture();
    p.sections.push(newSection());
    p.materials.push({ ...p.materials[0], id: "unused", cohesion: null });
    const ds = auditProject(p).find((s) => s.id === c.id)!.diagnostics;
    expect(ds).toEqual([]);
    expect(auditProject(p).at(-1)!.diagnostics.length).toBeGreaterThan(0);
  });
  it("avalia condições próprias, não as cargas ativas da seção", () => {
    const { project: p, analysisCase: c } = fixture();
    p.sections[0].loads[0].x2 = 999;
    c.loadCondition = "none";
    expect(
      auditProject(p)[0].diagnostics.some((d) => d.level === "error"),
    ).toBe(true);
    expect(auditProject(p)[1].diagnostics).toEqual([]);
  });
  it("encaminha a hipótese de água própria para o caso", () => {
    const { project: p, analysisCase: c } = fixture();
    c.waterCondition = "dry";
    expect(
      auditProject(p)[1].diagnostics.some(
        (d) => d.target === c.id && d.message.includes("origem"),
      ),
    ).toBe(true);
  });
  it("reabrir v4 preserva a conferência e os dados inativos", () => {
    const { project: p, analysisCase: c } = fixture();
    c.loadCondition = "none";
    c.loadIds = [p.sections[0].loads[0].id];
    const reopened = readProject(serializeProject(p));
    expect(reopened.migrated).toBe(false);
    expect(reopened.project).toEqual(p);
    expect(auditProject(reopened.project)).toEqual(auditProject(p));
  });
  it("recusa serializar projeto acima do limite de leitura", () => {
    const p = exampleProject();
    p.sections = Array.from({ length: 20 }, (_, i) => ({
      ...newSection(),
      id: `s${i}`,
      regions: Array.from({ length: 32 }, (_, j) => ({
        id: `r${i}-${j}`,
        name: "Região",
        materialId: null,
        points: Array.from({ length: 500 }, (_, k) => ({
          x: k + 0.123456789,
          y: k + 0.987654321,
        })),
      })),
    }));
    expect(() => serializeProject(p)).toThrow("8 MB");
  });
});
