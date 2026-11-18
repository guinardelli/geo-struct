import { expect, test, type Page } from "@playwright/test";
import { addAnalysisCase } from "../../src/domain/analysis";
import { newProject, type Project } from "../../src/domain/model";

function fixture() {
  const base = newProject("Fellenius na interface");
  Object.assign(base.materials[0], {
    name: "Solo do talude",
    gamma: 18,
    cohesion: 5,
    friction: 30,
    mode: "effective",
    source: "Caso próprio de conferência",
  });
  Object.assign(base.sections[0], {
    terrain: [
      { x: -10, y: 5 },
      { x: 10, y: -5 },
    ],
    base: -10,
    backgroundMaterialId: base.materials[0].id,
    waterMode: "dry",
    loadCondition: "none",
  });
  const { project: p, analysisCase: c } = addAnalysisCase(
    base,
    base.sections[0].id,
  );
  Object.assign(c, {
    name: "Círculo de referência",
    direction: "left-to-right",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return p;
}
async function select(page: Page, name = "Círculo de referência") {
  await page.getByRole("button", { name, exact: true }).click();
  const details = page.locator(".fixed-circle-preview");
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
}
async function open(page: Page, p: Project) {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "fellenius.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await select(page);
}
async function prepare(page: Page, angle = "3") {
  await page
    .getByLabel("Tolerância geométrica (m)", { exact: true })
    .fill("1e-8");
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill(angle);
  await page
    .getByRole("button", { name: "Preparar fatias", exact: true })
    .click();
}
async function calculate(page: Page, driving = "0", tension = "0") {
  await page
    .getByLabel("Limiar motriz τD (kN/m)", { exact: true })
    .fill(driving);
  await page
    .getByLabel("Tolerância de tração τt (kPa)", { exact: true })
    .fill(tension);
  await page
    .getByRole("button", { name: "Calcular Fellenius", exact: true })
    .click();
}
async function save(page: Page): Promise<Project> {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const stream = (await (await event).createReadStream())!;
  let data = "";
  for await (const chunk of stream) data += chunk.toString();
  return JSON.parse(data);
}
const fs = (page: Page) =>
  page.getByLabel("Fator de segurança Fellenius", { exact: true });
const diagnostics = (page: Page) =>
  page.getByLabel("Diagnósticos de Fellenius", { exact: true });

test("calcula e inspeciona na janela mínima, exige limiares e preserva o arquivo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  const p = fixture();
  await open(page, p);
  await prepare(page);
  await page
    .getByRole("button", { name: "Calcular Fellenius", exact: true })
    .click();
  await expect(diagnostics(page)).toContainText("Informe limiar motriz");
  await expect(fs(page)).toHaveCount(0);
  await calculate(page);
  await expect(fs(page)).toContainText("FS =");
  await page
    .getByRole("button", { name: "Inspecionar Fellenius", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção de Fellenius",
    exact: true,
  });
  await expect(dialog.getByLabel("Perfil de Fellenius")).toContainText(
    "τD = 0 kN/m · τt = 0 kPa",
  );
  await expect(dialog.getByLabel("Balanço de Fellenius")).toContainText(
    "D = ΣW sin α + ΣMq/R",
  );
  expect(
    await dialog
      .getByRole("table", { name: "Parcelas de Fellenius por fatia" })
      .getByRole("row")
      .count(),
  ).toBeGreaterThan(20);
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(960);
  await dialog
    .getByRole("button", { name: "Fechar janela", exact: true })
    .click();
  expect(await save(page)).toEqual(p);
  await page.getByLabel("Limiar motriz τD (kN/m)", { exact: true }).fill("1e6");
  await expect(fs(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Calcular Fellenius", exact: true })
    .click();
  await expect(diagnostics(page)).toContainText("não supera o limiar");
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  await page
    .getByLabel("Abertura máxima por fatia (°)", { exact: true })
    .fill("1,5");
  await expect(fs(page)).toHaveCount(0);
  await prepare(page, "1,5");
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  expect(await save(page)).toEqual(p);
  await page.locator("input[type=file]").setInputFiles({
    name: "fellenius.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await select(page);
  await expect(fs(page)).toHaveCount(0);
});

test("rascunho, edição de material e histórico invalidam o cálculo anterior", async ({
  page,
}) => {
  await open(page, fixture());
  await prepare(page);
  await calculate(page);
  const before = await fs(page).textContent();
  await page
    .getByLabel("Direção de deslizamento", { exact: true })
    .selectOption("right-to-left");
  await expect(fs(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await calculate(page);
  await expect(fs(page)).toHaveText(before!);
  await page
    .getByRole("button", { name: "Solo do talude", exact: true })
    .click();
  await page.getByLabel("Coesão c′ (kPa)", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).not.toHaveText(before!);
  const after = await fs(page).textContent();
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toHaveText(before!);
  await page.getByRole("tab", { name: "Geometria", exact: true }).click();
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await select(page);
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toHaveText(after!);
});

test("método selecionado e casos isolam resultado, sentido e resistência nula", async ({
  page,
}) => {
  let p = fixture();
  const opposite = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = opposite.project;
  Object.assign(opposite.analysisCase, {
    name: "Sentido contrário",
    direction: "right-to-left",
  });
  const bishop = addAnalysisCase(p, p.sections[0].id, p.analysisCases[0].id);
  p = bishop.project;
  Object.assign(bishop.analysisCase, {
    name: "Somente Bishop",
    methods: ["bishop"],
  });
  await open(page, p);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  await select(page, "Sentido contrário");
  await expect(fs(page)).toHaveCount(0);
  await prepare(page);
  await calculate(page);
  await expect(diagnostics(page)).toContainText("não supera o limiar");
  await expect(fs(page)).toHaveCount(0);
  await select(page, "Somente Bishop");
  await prepare(page);
  await expect(
    page.getByRole("button", { name: "Calcular Fellenius", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Fellenius no círculo fixo" }),
  ).toContainText("Bishop Simplificado ainda não está disponível");
  await select(page);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toBeVisible();
  expect(await save(page)).toEqual(p);
});

test("resistência nula é FS zero destacado; tração mantém diagnósticos sem FS", async ({
  page,
}) => {
  const p = fixture();
  p.materials[0].cohesion = 0;
  p.materials[0].friction = 0;
  await open(page, p);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toContainText("Resistência nula · FS = 0");
  const wet = fixture();
  Object.assign(wet.sections[0], {
    waterMode: "piezometric",
    waterUnitWeight: 1000,
    water: [
      { x: -10, y: 4 },
      { x: 10, y: -6 },
    ],
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "tracao.geo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(wet)),
  });
  await select(page);
  await prepare(page);
  await calculate(page);
  await expect(fs(page)).toHaveCount(0);
  await expect(diagnostics(page)).toContainText("Tração na base");
  await page
    .getByRole("button", { name: "Inspecionar Fellenius", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Inspeção de Fellenius",
    exact: true,
  });
  await expect(dialog.getByLabel("Balanço de Fellenius")).toContainText(
    "FS indisponível",
  );
});
