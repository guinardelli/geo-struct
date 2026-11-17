import { describe, expect, it } from "vitest";
import { addAnalysisCase } from "../../src/domain/analysis";
import { prepareCoreInput } from "../../src/domain/core-input";
import {
  newProject,
  serializeProject,
  type Project,
} from "../../src/domain/model";
import {
  prepareFixedCircleGeometry,
  type FixedCirclePreparation,
} from "../../src/core/fixed-circle";
import { prepareSliceWeights } from "../../src/core/slice-weights";
import type { InputPreparation } from "../../src/core/input";

const profile = { toleranceM: 1e-8, maxArcDegrees: 3 };
const analyticArea = 25 * Math.acos(4 / 5) - 12;
function fixture(inclusion = false) {
  const base = newProject("Pesos analíticos");
  base.materials[0].gamma = 18;
  base.materials[0].source = "Hipótese explícita do caso independente";
  const s = base.sections[0];
  s.terrain = [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ];
  s.base = -2;
  s.backgroundMaterialId = base.materials[0].id;
  s.waterMode = "dry";
  s.waterSource = "Caso próprio";
  s.loadCondition = "none";
  if (inclusion) {
    base.materials.push({
      ...base.materials[0],
      id: "inclusion",
      name: "Solo da inclusão",
      gamma: 20,
      source: "Segunda hipótese explícita",
    });
    s.regions.push({
      id: "region",
      name: "Região interna",
      materialId: "inclusion",
      points: [
        { x: -1, y: -0.4 },
        { x: 1, y: -0.4 },
        { x: 1, y: -0.2 },
        { x: -1, y: -0.2 },
      ],
    });
  }
  const { project: p, analysisCase: c } = addAnalysisCase(base, s.id);
  Object.assign(c, {
    description: "Peso próprio por material",
    direction: "left-to-right",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return { p, c, s: p.sections[0], backgroundId: p.materials[0].id };
}
function prepare(p: Project, settings = profile) {
  const input = prepareCoreInput(p, p.analysisCases[0].id);
  const geometry = prepareFixedCircleGeometry(input, settings);
  return { input, geometry, result: prepareSliceWeights(input, geometry) };
}
function weights(p: Project, settings = profile) {
  const { result } = prepare(p, settings);
  if (result.status !== "prepared")
    throw new Error(JSON.stringify(result.diagnostics));
  return result.weights;
}
function alteredGamma(
  input: InputPreparation,
  geometry: FixedCirclePreparation,
  gamma: number,
) {
  const data = {
    ...input.snapshot!.input,
    materials: input.snapshot!.input.materials.map((m) => ({
      ...m,
      unitWeight: gamma,
    })),
  };
  const revision = JSON.stringify(data);
  return prepareSliceWeights(
    { ...input, snapshot: { input: data, revision }, status: "collected" },
    { ...geometry, inputRevision: revision },
  );
}

describe("peso próprio com referências independentes", () => {
  it("reproduz 2 × 18 + 3 × 20 = 96 kN/m a partir do contrato de subáreas", () => {
    const { p, backgroundId } = fixture(true);
    const { input, geometry } = prepare(p);
    if (geometry.status !== "prepared")
      throw new Error("Geometria do teste indisponível");
    // Caso aritmético isolado: a geometria analítica completa é testada separadamente.
    const materialAreas = [
      {
        materialId: backgroundId,
        areaM2: 2,
        sources: [{ regionId: null, areaM2: 2 }],
      },
      {
        materialId: "inclusion",
        areaM2: 3,
        sources: [{ regionId: "region", areaM2: 3 }],
      },
    ];
    const result = prepareSliceWeights(input, {
      ...geometry,
      geometry: {
        ...geometry.geometry,
        areaM2: 5,
        materialAreas,
        slices: [{ ...geometry.geometry.slices[0], areaM2: 5, materialAreas }],
      },
    });
    if (result.status !== "prepared")
      throw new Error(JSON.stringify(result.diagnostics));
    expect(
      result.weights.slices[0].materials.map((m) => m.weightKNPerM),
    ).toEqual([36, 60]);
    expect(result.weights.slices[0].weightKNPerM).toBe(96);
    expect(result.weights.totalWeightKNPerM).toBe(96);
    expect(result.weights.units).toEqual({
      area: "m²",
      unitWeight: "kN/m³",
      weightPerLength: "kN/m",
    });
    expect(result.weights.direction).toBe("-Z");
  });

  it("confere o peso homogêneo pela área analítica do segmento circular", () => {
    const { p, backgroundId } = fixture();
    const w = weights(p);
    expect(w.totalWeightKNPerM).toBeCloseTo(18 * analyticArea, 10);
    expect(w.materials).toHaveLength(1);
    expect(w.materials[0]).toMatchObject({
      materialId: backgroundId,
      unitWeightKNPerM3: 18,
      parameterSource: "Hipótese explícita do caso independente",
    });
    expect(w.materials[0].sources[0].regionId).toBeNull();
    expect(w.slices.reduce((a, s) => a + s.weightKNPerM, 0)).toBeCloseTo(
      w.totalWeightKNPerM,
      12,
    );
  });

  it("inclui o peso de uma região acima da base, sem usar só γ do material da base", () => {
    const { p, backgroundId } = fixture(true);
    const { geometry } = prepare(p);
    expect(
      geometry.geometry?.slices.every((s) => s.baseMaterialId === backgroundId),
    ).toBe(true);
    const w = weights(p);
    expect(w.totalWeightKNPerM).toBeCloseTo(
      18 * (analyticArea - 0.4) + 20 * 0.4,
      10,
    );
    const inclusion = w.materials.find((m) => m.materialId === "inclusion")!;
    expect(inclusion.weightKNPerM).toBeCloseTo(8, 12);
    expect(inclusion.sources[0]).toMatchObject({
      regionId: "region",
      areaM2: expect.closeTo(0.4, 12),
      weightKNPerM: expect.closeTo(8, 12),
    });
    expect(w.slices.some((s) => s.materials.length === 2)).toBe(true);
  });

  it("confere estratos por segmentos circulares independentes", () => {
    const { p, s } = fixture(true);
    s.regions[0].points = [
      { x: -10, y: -2 },
      { x: 10, y: -2 },
      { x: 10, y: -0.5 },
      { x: -10, y: -0.5 },
    ];
    const lowerArea = 25 * Math.acos(4.5 / 5) - 4.5 * Math.sqrt(25 - 4.5 ** 2);
    const w = weights(p);
    expect(w.totalWeightKNPerM).toBeCloseTo(
      18 * (analyticArea - lowerArea) + 20 * lowerArea,
      10,
    );
    expect(
      w.materials.find((m) => m.materialId === "inclusion")!.weightKNPerM,
    ).toBeCloseTo(20 * lowerArea, 10);
  });

  it("agrega regiões e fundo do mesmo material sem duplicar o peso", () => {
    const { p, s, backgroundId } = fixture(true);
    s.regions[0].materialId = backgroundId;
    const w = weights(p);
    expect(w.materials).toHaveLength(1);
    expect(w.materials[0].sources.map((source) => source.regionId)).toEqual([
      null,
      "region",
    ]);
    expect(w.totalWeightKNPerM).toBeCloseTo(18 * analyticArea, 10);
    expect(w.materials[0].sources[1].weightKNPerM).toBeCloseTo(7.2, 12);
  });

  it("identifica materiais por ID e conserva γ sem arredondamento intermediário", () => {
    const { p } = fixture(true);
    p.materials[1].name = p.materials[0].name;
    p.materials[1].gamma = 20.123456789;
    const w = weights(p);
    expect(w.materials).toHaveLength(2);
    expect(
      w.materials.find((m) => m.materialId === "inclusion")!.weightKNPerM,
    ).toBeCloseTo(20.123456789 * 0.4, 12);
  });

  it("mantém pesos ao refinar as fatias e ao mudar ordem dos materiais e sentido", () => {
    const { p, c } = fixture(true);
    const before = weights(p);
    p.materials.reverse();
    c.direction = "right-to-left";
    const fine = weights(p, { ...profile, maxArcDegrees: 0.3 });
    expect(fine.slices.length).toBeGreaterThan(before.slices.length);
    expect(fine.totalWeightKNPerM).toBeCloseTo(before.totalWeightKNPerM, 10);
    for (const m of before.materials)
      expect(
        fine.materials.find((other) => other.materialId === m.materialId)!
          .weightKNPerM,
      ).toBeCloseTo(m.weightKNPerM, 10);
  });

  it.each([0.001, 1000])(
    "escala peso por unidade de largura com o quadrado da escala %s",
    (scale) => {
      const { p, s, c } = fixture(true);
      const original = weights(p).totalWeightKNPerM;
      for (const point of [
        ...s.terrain,
        ...s.regions.flatMap((r) => r.points),
      ]) {
        point.x *= scale;
        point.y *= scale;
      }
      s.base *= scale;
      c.fixedCircle.y! *= scale;
      c.fixedCircle.radius! *= scale;
      expect(
        weights(p, { ...profile, toleranceM: profile.toleranceM * scale })
          .totalWeightKNPerM /
          scale ** 2,
      ).toBeCloseTo(original, 10);
    },
  );

  it("preserva os pesos sob espelhamento e translação", () => {
    const { p, s, c } = fixture(true);
    const original = weights(p).totalWeightKNPerM;
    for (const point of [...s.terrain, ...s.regions.flatMap((r) => r.points)]) {
      point.x = 100000 - point.x;
      point.y += 100000;
    }
    s.terrain.reverse();
    s.base += 100000;
    c.fixedCircle.x = 100000;
    c.fixedCircle.y! += 100000;
    expect(weights(p).totalWeightKNPerM).toBeCloseTo(original, 7);
  });
});

describe("regras físicas restritas e integridade", () => {
  it("não adiciona água ou sobrecarga nem subtrai γw do peso específico total", () => {
    const { p, s } = fixture(true);
    const dry = weights(p).totalWeightKNPerM;
    s.waterMode = "piezometric";
    s.waterUnitWeight = 10;
    s.water = [
      { x: -10, y: -0.5 },
      { x: 10, y: -0.5 },
    ];
    s.loadCondition = "loads";
    s.loads = [
      {
        id: "q",
        name: "Sobrecarga",
        x1: -1,
        x2: 1,
        q: 100,
        enabled: true,
        source: "Teste",
      },
    ];
    const wet = weights(p);
    expect(wet.totalWeightKNPerM).toBeCloseTo(dry, 10);
    expect(wet).not.toHaveProperty("waterForce");
    expect(wet).not.toHaveProperty("surcharge");
  });

  it("não requer resistência para calcular peso e não altera γ ao trocar modos", () => {
    const { p } = fixture(true);
    const original = weights(p).totalWeightKNPerM;
    p.materials.forEach((m, i) => {
      m.cohesion = null;
      m.friction = null;
      m.mode = i ? "total" : "effective";
      m.source = "";
    });
    expect(weights(p).totalWeightKNPerM).toBe(original);
    p.materials.forEach((m) => {
      m.mode = null;
    });
    expect(weights(p).totalWeightKNPerM).toBe(original);
    expect(weights(p).materials.every((m) => m.parameterSource === "")).toBe(
      true,
    );
  });

  it("bloqueia γ ausente em inclusão acima da base, preservando geometria", () => {
    const { p } = fixture(true);
    p.materials[1].gamma = null;
    const { geometry, result } = prepare(p);
    expect(geometry.status).toBe("prepared");
    expect(result.weights).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "unit-weight-missing",
      materialId: "inclusion",
    });
  });

  it("lista todos os γ ausentes uma vez por material e não fornece total parcial", () => {
    const { p } = fixture(true);
    p.materials.forEach((m) => {
      m.gamma = null;
    });
    const { result } = prepare(p);
    expect(result.status).toBe("blocked");
    expect(result.weights).toBeNull();
    expect(result.diagnostics).toHaveLength(2);
  });

  it("não bloqueia por γ de região fora da massa", () => {
    const { p, s } = fixture(true);
    s.regions[0].points.forEach((point) => {
      point.x += 6;
    });
    p.materials[1].gamma = null;
    expect(weights(p).totalWeightKNPerM).toBeCloseTo(18 * analyticArea, 10);
  });

  it.each([0, -1, NaN, Infinity])(
    "recusa γ inválido no contrato independente: %s",
    (gamma) => {
      const { p } = fixture();
      const { input, geometry } = prepare(p);
      const result = alteredGamma(input, geometry, gamma);
      expect(result.weights).toBeNull();
      expect(result.diagnostics[0].code).toBe("unit-weight-invalid");
    },
  );

  it.each([Number.MAX_VALUE, Number.MIN_VALUE])(
    "recusa overflow ou perda de representação com γ = %s",
    (gamma) => {
      const { p } = fixture();
      const { input, geometry } = prepare(p);
      const result = alteredGamma(input, geometry, gamma);
      expect(result.weights).toBeNull();
      expect(result.diagnostics[0].code).toBe("weight-numerical");
    },
  );

  it("recusa áreas de revisão antiga após editar γ", () => {
    const { p } = fixture();
    const { geometry } = prepare(p);
    p.materials[0].gamma = 19;
    const result = prepareSliceWeights(
      prepareCoreInput(p, p.analysisCases[0].id),
      geometry,
    );
    expect(result.weights).toBeNull();
    expect(result.diagnostics[0].code).toBe("stale-geometry");
  });

  it("propaga entrada indisponível e exige geometria preparada", () => {
    const { p, c } = fixture();
    expect(
      prepareSliceWeights(prepareCoreInput({}, c.id), null).diagnostics[0].code,
    ).toBe("input-unavailable");
    c.fixedCircle.y = 5;
    const { result } = prepare(p);
    expect(result.diagnostics[0].code).toBe("geometry-unavailable");
    expect(result.weights).toBeNull();
  });

  it("recusa parcelas de origem incompatíveis, sem ajustar áreas", () => {
    const { p } = fixture();
    const { input, geometry } = prepare(p);
    if (geometry.status !== "prepared")
      throw new Error("Geometria indisponível");
    const first = geometry.geometry.slices[0];
    const parts = first.materialAreas.map((m) => ({
      ...m,
      areaM2: m.areaM2 + 1,
    }));
    const altered = {
      ...geometry,
      geometry: {
        ...geometry.geometry,
        slices: [
          { ...first, materialAreas: parts },
          ...geometry.geometry.slices.slice(1),
        ],
      },
    };
    expect(prepareSliceWeights(input, altered).diagnostics[0].code).toBe(
      "weight-area-source",
    );
  });

  it("preserva arquivo, entrada e geometria, e entrega rastreabilidade imutável sem FS", () => {
    const { p } = fixture(true);
    const file = serializeProject(p);
    const { input, geometry } = prepare(p);
    const before = JSON.stringify({ input, geometry });
    const result = prepareSliceWeights(input, geometry);
    if (result.status !== "prepared") throw new Error("Pesos indisponíveis");
    expect(result.inputRevision).toBe(input.snapshot!.revision);
    expect(result.geometryProfile).toEqual(profile);
    expect(Object.isFrozen(result.weights.materials[0].sources[0])).toBe(true);
    expect(JSON.stringify({ input, geometry })).toBe(before);
    expect(serializeProject(p)).toBe(file);
    expect(result.weights).not.toHaveProperty("factorOfSafety");
    expect(result.weights.slices[0]).not.toHaveProperty("normalForce");
    expect(result.weights.slices[0]).not.toHaveProperty("moment");
  });
});
