import { describe, expect, it } from "vitest";
import {
  newProject,
  serializeProject,
  type Project,
} from "../../src/domain/model";
import { addAnalysisCase } from "../../src/domain/analysis";
import { prepareCoreInput } from "../../src/domain/core-input";
import { prepareFixedCircleGeometry } from "../../src/core/fixed-circle";
import { prepareSliceWeights } from "../../src/core/slice-weights";
import { prepareSlicePressures } from "../../src/core/slice-pressures";
import { prepareSliceLoads } from "../../src/core/slice-loads";
import { prepareSliceMechanics } from "../../src/core/slice-mechanics";

const profile = { toleranceM: 1e-8, maxArcDegrees: 2.8 };
type Mutable<T> = T extends object
  ? { -readonly [K in keyof T]: Mutable<T[K]> }
  : T;
const copy = <T>(value: T): Mutable<T> => structuredClone(value) as Mutable<T>;
function fixture() {
  const base = newProject("Entrada mecânica analítica");
  Object.assign(base.materials[0], {
    name: "Base",
    gamma: 18,
    cohesion: 5,
    friction: 30,
    mode: "effective",
    source: "Parâmetros de conferência",
  });
  const s = base.sections[0];
  Object.assign(s, {
    terrain: [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ],
    base: -2,
    backgroundMaterialId: base.materials[0].id,
    waterMode: "piezometric",
    waterUnitWeight: 10,
    water: [
      { x: -10, y: -0.5 },
      { x: 10, y: -0.5 },
    ],
    waterSource: "Hipótese piezométrica",
    loadCondition: "none",
  });
  const { project: p, analysisCase: c } = addAnalysisCase(base, s.id);
  Object.assign(c, {
    direction: "left-to-right",
    description: "Consolidação sem FS",
    methods: ["fellenius"],
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return { p, c, s: p.sections[0] };
}
function stages(p: Project, settings = profile) {
  const input = prepareCoreInput(p, p.analysisCases[0].id);
  const geometry = prepareFixedCircleGeometry(input, settings);
  const dependencies = {
    weights: prepareSliceWeights(input, geometry),
    pressures: prepareSlicePressures(input, geometry),
    loads: prepareSliceLoads(input, geometry),
  };
  return { input, geometry, dependencies };
}
function result(p: Project, settings = profile) {
  const b = stages(p, settings);
  return prepareSliceMechanics(b.input, b.geometry, b.dependencies);
}
function mechanics(p: Project, settings = profile) {
  const r = result(p, settings);
  if (r.status !== "prepared") throw new Error(JSON.stringify(r.diagnostics));
  return r.mechanics;
}
function ready() {
  const b = stages(fixture().p);
  if (
    !b.input.snapshot ||
    b.geometry.status !== "prepared" ||
    b.dependencies.weights.status !== "prepared" ||
    b.dependencies.pressures.status !== "prepared" ||
    b.dependencies.loads.status !== "prepared"
  )
    throw new Error("Fixture indisponível");
  return copy({
    input: b.input,
    geometry: b.geometry,
    dependencies: {
      weights: b.dependencies.weights,
      pressures: b.dependencies.pressures,
      loads: b.dependencies.loads,
    },
  });
}
function evaluate(b: ReturnType<typeof ready>) {
  return prepareSliceMechanics(b.input, b.geometry, b.dependencies);
}
function revise(b: ReturnType<typeof ready>) {
  const revision = JSON.stringify(b.input.snapshot!.input);
  b.input.snapshot!.revision = revision;
  b.geometry.inputRevision = revision;
  Object.values(b.dependencies).forEach((d) => (d.inputRevision = revision));
}

describe("entrada mecânica com referências independentes", () => {
  it("confere base de 2 m a 30°, W=100, Q=15 e u=10, sem resolver equilíbrio", () => {
    const b = ready();
    const g = b.geometry.geometry.slices[0];
    Object.assign(g, {
      number: 1,
      left: { x: -1, baseZ: 0, topZ: 1 },
      right: { x: Math.sqrt(3) - 1, baseZ: -1, topZ: 1 },
      widthM: Math.sqrt(3),
      chordLengthM: 2,
      chordAngleRadians: -Math.PI / 6,
      arcMidpoint: { x: -0.1, z: -0.5 },
    });
    b.geometry.geometry.slices = [g];
    const w = b.dependencies.weights.weights.slices[0];
    w.number = 1;
    w.weightKNPerM = 100;
    b.dependencies.weights.weights.slices = [w];
    b.dependencies.weights.weights.totalWeightKNPerM = 100;
    const p = b.dependencies.pressures.pressures.slices[0];
    p.number = 1;
    p.basePoint = { ...g.arcMidpoint };
    p.pressureKPa = 10;
    b.dependencies.pressures.pressures.slices = [p];
    b.dependencies.loads.loads.slices = [
      {
        number: 1,
        forceKNPerM: 15,
        momentCCWKNmPerM: 3,
        momentDrivingKNmPerM: 3,
        contributions: [],
      },
    ];
    b.dependencies.loads.loads.forceKNPerM = 15;
    const r = evaluate(b);
    expect(r.status).toBe("prepared");
    const s = r.mechanics!.slices[0];
    expect(s.widthM).toBeCloseTo(Math.sqrt(3), 14);
    expect(s.sinAlpha).toBeCloseTo(0.5, 14);
    expect(s.cosAlpha).toBeCloseTo(Math.sqrt(3) / 2, 14);
    expect(s.baseMaterial.tanPhi).toBeCloseTo(1 / Math.sqrt(3), 14);
    expect(s.downwardForceKNPerM).toBe(115);
    expect(s.water).toMatchObject({
      usedPressureKPa: 10,
      physicalBaseResultantKNPerM: 20,
      usedBaseResultantKNPerM: 20,
    });
    expect(r.mechanics!.totalDownwardForceKNPerM).toBe(115);
    expect(r).not.toHaveProperty("factorOfSafety");
    expect(s).not.toHaveProperty("normalForce");
  });

  it("no círculo analítico confere área, peso, pressão central e corda, sem usar arco em U", () => {
    const { p } = fixture();
    const d = mechanics(p);
    expect(d.totalWeightKNPerM).toBeCloseTo(
      18 * (25 * Math.acos(0.8) - 12),
      10,
    );
    const central = d.slices.find(
      (s) => Math.abs(s.original.basePoint.x) < 1e-12,
    )!;
    expect(central.water.prescribed.pressureKPa).toBeCloseTo(5, 12);
    expect(central.water.usedPressureKPa).toBeCloseTo(5, 12);
    // A linha z = −0,5 cria cortes em ±acos(0,9). O intervalo central tem
    // ceil(2 acos(0,9) / 2,8°) = 19 fatias; há outras quatro de cada lado.
    const chord = 10 * Math.sin(Math.acos(0.9) / 19);
    expect(central.baseLengthM).toBeCloseTo(chord, 12);
    expect(central.water.physicalBaseResultantKNPerM).toBeCloseTo(
      5 * chord,
      12,
    );
    expect(
      Math.abs(
        central.water.physicalBaseResultantKNPerM -
          (5 * 10 * Math.acos(0.9)) / 19,
      ),
    ).toBeGreaterThan(1e-5);
    for (const s of d.slices) {
      expect(s.widthM).toBeCloseTo(s.baseLengthM * s.cosAlpha, 12);
      expect(s.weightArmM).toBeCloseTo(-s.local.basePoint.x, 12);
      expect(s.downwardForceKNPerM).toBe(s.weight.weightKNPerM);
      expect(s.original.basePoint.z - 4).toBe(s.local.basePoint.z);
    }
  });

  it("modo total zera somente ue/Ue, mantendo pressão física, peso e dados de origem", () => {
    const { p } = fixture();
    const effective = mechanics(p);
    p.materials[0].mode = "total";
    const total = mechanics(p);
    expect(total.totalWeightKNPerM).toBe(effective.totalWeightKNPerM);
    expect(total.water).toEqual(effective.water);
    total.slices.forEach((s, i) => {
      expect(s.water.prescribed).toEqual(effective.slices[i].water.prescribed);
      expect(s.water.physicalBaseResultantKNPerM).toBe(
        effective.slices[i].water.physicalBaseResultantKNPerM,
      );
      expect(s.water.usedPressureKPa).toBe(0);
      expect(s.water.usedBaseResultantKNPerM).toBe(0);
      expect(s.baseMaterial).toMatchObject({
        mode: "total",
        cohesionKPa: 5,
        frictionDegrees: 30,
        source: "Parâmetros de conferência",
      });
    });
  });

  it("modo da base não dispensa γw ou converte a condição piezométrica em seca", () => {
    const { p, s } = fixture();
    p.materials[0].mode = "total";
    s.waterUnitWeight = null;
    expect(result(p).diagnostics[0].code).toBe(
      "mechanics-pressures-unavailable",
    );
    s.waterMode = "dry";
    expect(
      mechanics(p).slices.every(
        (s) =>
          s.water.physicalBaseResultantKNPerM === 0 &&
          s.water.usedBaseResultantKNPerM === 0,
      ),
    ).toBe(true);
  });

  it("material superior que pesa mais não fornece resistência e pode ter c/φ/modo pendentes", () => {
    const { p, s } = fixture();
    p.materials.push({
      ...p.materials[0],
      id: "upper",
      name: "Solo superior",
      gamma: 30,
      cohesion: null,
      friction: null,
      mode: null,
    });
    s.regions = [
      {
        id: "inclusion",
        name: "Inclusão superior",
        materialId: "upper",
        points: [
          { x: -0.6, y: -0.95 },
          { x: 0.6, y: -0.95 },
          { x: 0.6, y: 0 },
          { x: -0.6, y: 0 },
        ],
      },
    ];
    const d = mechanics(p);
    const center = d.slices.find(
      (s) => Math.abs(s.original.basePoint.x) < 1e-12,
    )!;
    expect(
      center.weight.materials.find((m) => m.materialId === "upper")!
        .weightKNPerM,
    ).toBeGreaterThan(
      center.weight.materials.find((m) => m.materialId === p.materials[0].id)!
        .weightKNPerM,
    );
    expect(center.baseMaterial.id).toBe(p.materials[0].id);
    expect(center.baseMaterial.cohesionKPa).toBe(5);
  });

  it("identifica modos distintos em bases distintas e mantém a pressão física em ambas", () => {
    const { p, s } = fixture();
    p.materials.push({
      ...p.materials[0],
      id: "right",
      name: "Solo direito",
      gamma: 20,
      cohesion: 12,
      friction: 0,
      mode: "total",
    });
    s.regions = [
      {
        id: "right-region",
        name: "Região direita",
        materialId: "right",
        points: [
          { x: 0, y: -2 },
          { x: 10, y: -2 },
          { x: 10, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ];
    const d = mechanics(p);
    expect(d.resistanceModes).toEqual(["effective", "total"]);
    for (const s of d.slices) {
      const right = s.original.basePoint.x > 0;
      expect(s.baseMaterial.mode).toBe(right ? "total" : "effective");
      expect(s.water.usedPressureKPa).toBe(
        right ? 0 : s.water.prescribed.pressureKPa,
      );
    }
    expect(
      d.slices.some(
        (s) =>
          s.baseMaterial.mode === "total" && s.water.prescribed.pressureKPa > 0,
      ),
    ).toBe(true);
  });

  it("mantém c=0 e φ=0 como conhecidos, sem declarar estabilidade ou resistência global nula", () => {
    const { p } = fixture();
    p.materials[0].cohesion = 0;
    p.materials[0].friction = 0;
    expect(
      mechanics(p).slices.every(
        (s) => s.baseMaterial.cohesionKPa === 0 && s.baseMaterial.tanPhi === 0,
      ),
    ).toBe(true);
    p.materials[0].cohesion = null;
    expect(result(p).diagnostics[0].code).toBe("mechanics-strength-missing");
  });
});

describe("sentido, geometria local e sobrecargas", () => {
  it("inverter sentido reordena fatias e inverte α/braços, mantendo IDs originais e forças", () => {
    const { p, c } = fixture();
    const original = mechanics(p);
    c.direction = "right-to-left";
    const reversed = mechanics(p);
    expect(reversed.frame.horizontalSign).toBe(-1);
    expect(reversed.slices.map((s) => s.number)).toEqual(
      original.slices.map((s) => s.number).reverse(),
    );
    reversed.slices.forEach((s, i) => {
      const old = original.slices[original.slices.length - i - 1];
      expect(s.order).toBe(i + 1);
      expect(s.alphaRadians).toBeCloseTo(-old.alphaRadians, 14);
      expect(s.local.entry.x).toBeLessThan(s.local.exit.x);
      expect(s.local.entry.x).toBeCloseTo(-old.local.exit.x, 14);
      expect(s.weightArmM).toBeCloseTo(-old.weightArmM, 14);
      expect(s.downwardForceKNPerM).toBe(old.downwardForceKNPerM);
      expect(s.water).toEqual(old.water);
    });
  });

  it("espelhar terreno/água/faixa e inverter movimento preserva a preparação local", () => {
    const { p, c, s } = fixture();
    s.loads = [
      {
        id: "q",
        name: "Faixa",
        x1: -2,
        x2: -1,
        q: 15,
        enabled: true,
        source: "Hipótese",
      },
    ];
    s.loadCondition = "loads";
    s.water = [
      { x: -10, y: -1.1 },
      { x: 10, y: -0.1 },
    ];
    const first = mechanics(p);
    s.terrain = s.terrain.map((p) => ({ x: -p.x, y: p.y })).reverse();
    s.water = s.water.map((p) => ({ x: -p.x, y: p.y })).reverse();
    s.loads[0].x1 = 1;
    s.loads[0].x2 = 2;
    c.direction = "right-to-left";
    const mirror = mechanics(p);
    expect(mirror.slices.length).toBe(first.slices.length);
    mirror.slices.forEach((s, i) => {
      const old = first.slices[i];
      expect(s.local.basePoint.x).toBeCloseTo(old.local.basePoint.x, 10);
      expect(s.alphaRadians).toBeCloseTo(old.alphaRadians, 10);
      expect(s.water.usedBaseResultantKNPerM).toBeCloseTo(
        old.water.usedBaseResultantKNPerM,
        10,
      );
      expect(s.surcharge.momentDrivingKNmPerM).toBeCloseTo(
        old.surcharge.momentDrivingKNmPerM,
        10,
      );
      s.surcharge.contributions.forEach((q, j) =>
        expect(q.localApplicationPoint.x).toBeCloseTo(
          old.surcharge.contributions[j].localApplicationPoint.x,
          10,
        ),
      );
    });
  });

  it("preserva braços próprios de faixas sobrepostas e não soma água a W+Q", () => {
    const { p, s } = fixture();
    s.loadCondition = "loads";
    s.loads = [
      {
        id: "one",
        name: "Faixa",
        x1: -2,
        x2: 0,
        q: 20,
        enabled: true,
        source: "Um",
      },
      {
        id: "two",
        name: "Faixa",
        x1: -1,
        x2: 1,
        q: 10,
        enabled: true,
        source: "Dois",
      },
    ];
    const d = mechanics(p);
    expect(d.totalSurchargeKNPerM).toBeCloseTo(60, 12);
    expect(d.totalDownwardForceKNPerM).toBeCloseTo(
      d.totalWeightKNPerM + 60,
      12,
    );
    expect(d.slices.some((s) => s.surcharge.contributions.length === 2)).toBe(
      true,
    );
    expect(
      d.slices
        .flatMap((s) => s.surcharge.contributions)
        .some((q) => q.momentDrivingKNmPerM! < 0),
    ).toBe(true);
    const loaded = d.slices.find((s) => s.surcharge.forceKNPerM > 0)!;
    expect(
      Math.abs(
        loaded.weightArmM - loaded.surcharge.contributions[0].armDrivingM!,
      ),
    ).toBeGreaterThan(1e-6);
    d.slices.forEach((s) =>
      expect(s.downwardForceKNPerM).toBe(
        s.weight.weightKNPerM + s.surcharge.forceKNPerM,
      ),
    );
  });

  it("translação conserva coordenadas locais, água e inclinações", () => {
    const { p, c, s } = fixture();
    const before = mechanics(p);
    const dx = 800000,
      dz = 900000;
    s.terrain.forEach((p) => {
      p.x += dx;
      p.y += dz;
    });
    s.water!.forEach((p) => {
      p.x += dx;
      p.y += dz;
    });
    s.base += dz;
    c.fixedCircle.x! += dx;
    c.fixedCircle.y! += dz;
    mechanics(p).slices.forEach((s, i) => {
      expect(s.local.basePoint.x).toBeCloseTo(
        before.slices[i].local.basePoint.x,
        8,
      );
      expect(s.alphaRadians).toBeCloseTo(before.slices[i].alphaRadians, 8);
      expect(s.water.usedBaseResultantKNPerM).toBeCloseTo(
        before.slices[i].water.usedBaseResultantKNPerM,
        8,
      );
    });
  });

  it.each([0.001, 100])(
    "escala %s conserva ângulos; W e U variam com L²",
    (scale) => {
      const { p, c, s } = fixture();
      const before = mechanics(p);
      s.terrain.forEach((p) => {
        p.x *= scale;
        p.y *= scale;
      });
      s.water!.forEach((p) => {
        p.x *= scale;
        p.y *= scale;
      });
      s.base *= scale;
      c.fixedCircle.x! *= scale;
      c.fixedCircle.y! *= scale;
      c.fixedCircle.radius! *= scale;
      mechanics(p, {
        ...profile,
        toleranceM: profile.toleranceM * scale,
      }).slices.forEach((s, i) => {
        expect(s.alphaRadians).toBeCloseTo(before.slices[i].alphaRadians, 10);
        expect(s.weight.weightKNPerM / scale ** 2).toBeCloseTo(
          before.slices[i].weight.weightKNPerM,
          10,
        );
        expect(s.water.usedBaseResultantKNPerM / scale ** 2).toBeCloseTo(
          before.slices[i].water.usedBaseResultantKNPerM,
          10,
        );
      });
    },
  );

  it("refinamento conserva peso global e lei física sem somar pressões", () => {
    const { p } = fixture();
    const coarse = mechanics(p);
    const fine = mechanics(p, { ...profile, maxArcDegrees: 1.4 });
    expect(fine.slices.length).toBeGreaterThan(coarse.slices.length);
    expect(fine.totalWeightKNPerM).toBeCloseTo(coarse.totalWeightKNPerM, 10);
    for (const s of fine.slices) {
      const { x, z } = s.original.basePoint;
      expect(z).toBeCloseTo(4 - Math.sqrt(25 - x * x), 11);
      expect(s.water.usedPressureKPa).toBeCloseTo(
        10 * Math.max(0, -0.5 - z),
        11,
      );
    }
  });
});

describe("integridade e recusas da consolidação", () => {
  it("resultado é imutável sem alterar ou congelar os dados fornecidos", () => {
    const b = ready();
    const before = JSON.stringify(b);
    const r = evaluate(b);
    expect(r).toMatchObject({
      contract: "geostruct-slice-mechanics/1",
      stage: "mechanical-inputs-only",
      inputRevision: b.input.snapshot!.revision,
      geometryProfile: profile,
    });
    expect(JSON.stringify(b)).toBe(before);
    expect(
      Object.isFrozen(r.mechanics!.slices[0].weight.materials[0].sources),
    ).toBe(true);
    expect(
      Object.isFrozen(b.dependencies.weights.weights.slices[0].materials[0]),
    ).toBe(false);
    b.dependencies.weights.weights.slices[0].materials[0].sources[0].areaM2 += 1;
    expect(
      r.mechanics!.slices[0].weight.materials[0].sources[0].areaM2,
    ).not.toBe(
      b.dependencies.weights.weights.slices[0].materials[0].sources[0].areaM2,
    );
    const { p } = fixture();
    const serialized = serializeProject(p);
    mechanics(p);
    expect(serializeProject(p)).toBe(serialized);
  });

  it("direção pendente bloqueia somente a entrada mecânica", () => {
    const { p, c } = fixture();
    c.direction = null;
    const b = stages(p);
    expect(
      Object.values(b.dependencies).every((r) => r.status === "prepared"),
    ).toBe(true);
    expect(
      prepareSliceMechanics(b.input, b.geometry, b.dependencies).diagnostics[0]
        .code,
    ).toBe("mechanics-direction-missing");
  });

  it.each(["weights", "pressures", "loads"] as const)(
    "não aceita estágio %s ausente, de outra revisão ou perfil",
    (key) => {
      const b = ready();
      const d = b.dependencies;
      expect(
        prepareSliceMechanics(b.input, b.geometry, { ...d, [key]: null })
          .diagnostics[0].code,
      ).toBe(`mechanics-${key}-unavailable`);
      d[key].inputRevision = "other";
      expect(evaluate(b).diagnostics[0].code).toBe(
        "mechanics-stale-dependency",
      );
      d[key].inputRevision = b.input.snapshot!.revision;
      d[key].geometryProfile!.maxArcDegrees = 1.4;
      expect(evaluate(b).diagnostics[0].code).toBe(
        "mechanics-profile-mismatch",
      );
    },
  );

  it.each(["cohesion", "frictionDegrees", "parameterMode"] as const)(
    "parâmetro %s nulo na base bloqueia sem total parcial",
    (field) => {
      const b = ready();
      b.input.snapshot!.input.materials[0][field] = null;
      revise(b);
      const r = evaluate(b);
      expect(r.mechanics).toBeNull();
      expect(r.diagnostics[0]).toMatchObject({
        code: "mechanics-strength-missing",
        materialId: b.input.snapshot!.input.materials[0].id,
      });
    },
  );

  it.each([
    { cohesion: -1 },
    { cohesion: Infinity },
    { frictionDegrees: -1 },
    { frictionDegrees: 90 },
    { frictionDegrees: NaN },
  ])("recusa parâmetros inválidos: %j", (change) => {
    const b = ready();
    Object.assign(b.input.snapshot!.input.materials[0], change);
    revise(b);
    expect(evaluate(b).diagnostics[0].code).toBe("mechanics-strength-invalid");
  });

  it.each(["missing", "duplicate", "unknown"])(
    "recusa correspondência de fatias: %s",
    (kind) => {
      const b = ready();
      const list = b.dependencies.pressures.pressures.slices;
      if (kind === "missing") list.pop();
      if (kind === "duplicate") list[1].number = list[0].number;
      if (kind === "unknown") list[1].number = 99999;
      expect(evaluate(b).diagnostics[0].code).toBe("mechanics-slice-mismatch");
    },
  );

  it("une por número, não por posição dos registros recebidos", () => {
    const b = ready();
    const before = evaluate(b);
    b.dependencies.weights.weights.slices.reverse();
    b.dependencies.pressures.pressures.slices.reverse();
    b.dependencies.loads.loads.slices.reverse();
    expect(evaluate(b)).toEqual(before);
  });

  it("recusa pressão de outro ponto e área de outra discretização", () => {
    const b = ready();
    b.dependencies.pressures.pressures.slices[0].basePoint.x += 0.01;
    expect(evaluate(b).diagnostics[0].code).toBe(
      "mechanics-discretization-mismatch",
    );
    const other = ready();
    other.dependencies.weights.weights.slices[0].areaM2 += 0.01;
    expect(evaluate(other).diagnostics[0].code).toBe(
      "mechanics-discretization-mismatch",
    );
  });

  it("recusa estágio bloqueado sem ocultar preparações disponíveis", () => {
    const { p, s } = fixture();
    p.materials[0].gamma = null;
    const b = stages(p);
    expect(
      prepareSliceMechanics(b.input, b.geometry, b.dependencies).diagnostics[0]
        .code,
    ).toBe("mechanics-weights-unavailable");
    expect(b.geometry.status).toBe("prepared");
    expect(b.dependencies.pressures.status).toBe("prepared");
    p.materials[0].gamma = 18;
    s.loadCondition = "loads";
    s.loads = [
      {
        id: "q",
        name: "Sem q",
        x1: -1,
        x2: 1,
        q: null,
        enabled: true,
        source: "Hipótese",
      },
    ];
    expect(result(p).diagnostics[0].code).toBe("mechanics-loads-unavailable");
  });

  it("recusa entrada/geométrica indisponível, obsoleta e erros de cadastro", () => {
    const b = ready();
    expect(
      prepareSliceMechanics(
        { status: "unavailable", snapshot: null, diagnostics: [] },
        b.geometry,
        b.dependencies,
      ).diagnostics[0].code,
    ).toBe("input-unavailable");
    expect(
      prepareSliceMechanics(b.input, null, b.dependencies).diagnostics[0].code,
    ).toBe("geometry-unavailable");
    b.geometry.inputRevision = "other";
    expect(evaluate(b).diagnostics[0].code).toBe("stale-geometry");
    b.geometry.inputRevision = b.input.snapshot!.revision;
    b.input.diagnostics.push({
      code: "model-diagnostic",
      level: "error",
      message: "Erro",
    });
    expect(evaluate(b).diagnostics[0].code).toBe("input-error");
  });

  it.each([Infinity, -1, Number.MIN_VALUE])(
    "recusa pressão inválida ou produto não representável: %s",
    (u) => {
      const b = ready();
      b.dependencies.pressures.pressures.slices[0].pressureKPa = u;
      expect(evaluate(b).status).toBe("blocked");
      expect(evaluate(b).mechanics).toBeNull();
    },
  );
});
