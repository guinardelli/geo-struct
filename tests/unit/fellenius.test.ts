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
import { solveFellenius } from "../../src/core/fellenius";

type Mutable<T> = T extends object
  ? { -readonly [K in keyof T]: Mutable<T[K]> }
  : T;
const copy = <T>(x: T): Mutable<T> => structuredClone(x) as Mutable<T>;
const numerical = { drivingThresholdKNPerM: 1e-8, tensionToleranceKPa: 0 };
function fixture() {
  const base = newProject("Talude de conferência");
  Object.assign(base.materials[0], {
    name: "Solo",
    gamma: 18,
    cohesion: 5,
    friction: 30,
    mode: "effective",
    source: "Caso próprio",
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
    name: "Fellenius fixo",
    methods: ["fellenius"],
    direction: "left-to-right",
    surfaceMode: "fixed",
    fixedCircle: { x: 0, y: 4, radius: 5 },
    waterCondition: "section",
    loadCondition: "section",
  });
  return p;
}
function prepare(p = fixture(), angle = 3) {
  const input = prepareCoreInput(p, p.analysisCases[0].id);
  const geometry = prepareFixedCircleGeometry(input, {
    toleranceM: 1e-8,
    maxArcDegrees: angle,
  });
  const mechanics = prepareSliceMechanics(input, geometry, {
    weights: prepareSliceWeights(input, geometry),
    pressures: prepareSlicePressures(input, geometry),
    loads: prepareSliceLoads(input, geometry),
  });
  if (!input.snapshot || mechanics.status !== "prepared")
    throw new Error(JSON.stringify(mechanics.diagnostics));
  return {
    input: copy({ ...input, snapshot: input.snapshot }),
    mechanics: copy(mechanics),
  };
}
function run(p = fixture(), angle = 3) {
  const b = prepare(p, angle);
  return solveFellenius(b.input, b.mechanics, numerical);
}

// Entradas mecânicas manuais, independentes da preparação geométrica.
// Comprimentos, ângulos e forças do caso são impostos para verificar a equação.
function manual(
  rows = [{ w: 100, length: 2, angle: 30, u: 10 }],
  c = 5,
  phi = 30,
) {
  const b = prepare();
  b.input.snapshot.input.surface = {
    mode: "fixed",
    circle: { x: 0, z: 4, radius: 10 },
  };
  b.mechanics.mechanics.circleRadiusM = 10;
  const seed = b.mechanics.mechanics.slices[0];
  b.mechanics.mechanics.slices = rows.map((row, i) => {
    const s = copy(seed),
      a = (row.angle * Math.PI) / 180;
    Object.assign(s, {
      number: i + 1,
      order: i + 1,
      alphaRadians: a,
      sinAlpha: Math.sin(a),
      cosAlpha: Math.cos(a),
      baseLengthM: row.length,
      widthM: row.length * Math.cos(a),
    });
    Object.assign(s.baseMaterial, {
      cohesionKPa: c,
      frictionDegrees: phi,
      frictionRadians: (phi * Math.PI) / 180,
      tanPhi: Math.tan((phi * Math.PI) / 180),
    });
    s.weight.weightKNPerM = row.w;
    s.water.prescribed.pressureKPa = row.u;
    s.water.usedPressureKPa = row.u;
    s.surcharge = {
      forceKNPerM: 0,
      momentDrivingKNmPerM: 0,
      contributions: [],
    };
    return s;
  });
  return b;
}
function load(b: ReturnType<typeof manual>, x: number, force = 15) {
  const s = b.mechanics.mechanics.slices[0];
  s.surcharge = {
    forceKNPerM: force,
    momentDrivingKNmPerM: -x * force,
    contributions: [
      {
        loadId: "faixa-manual",
        leftX: x - 0.5,
        rightX: x + 0.5,
        widthM: 1,
        forceKNPerM: force,
        applicationPoint: { x, z: 0 },
        localApplicationPoint: { x, z: -4 },
        armCCWM: -x,
        momentCCWKNmPerM: -x * force,
        armDrivingM: -x,
        momentDrivingKNmPerM: -x * force,
      },
    ],
  };
}
const evaluate = (b: ReturnType<typeof prepare>, profile = numerical) =>
  solveFellenius(b.input, b.mechanics, profile);
const codes = (r: ReturnType<typeof evaluate>) =>
  r.diagnostics.map((d) => d.code);

describe("Fellenius: referências independentes", () => {
  it.each([-5, 0, 5])(
    "caso de 30° com sobrecarga no braço próprio, x=%s",
    (x) => {
      const b = manual();
      load(b, x);
      const r = evaluate(b),
        s = r.calculation!.slices[0];
      const denominator = 50 - 1.5 * x;
      expect(r.status).toBe("calculated");
      expect(s.projectedWaterKNPerM).toBeCloseTo(15, 12);
      expect(s.normalForResistanceKNPerM).toBeCloseTo(
        (115 * Math.sqrt(3)) / 2 - 15,
        12,
      );
      expect(s.cohesionResistanceKNPerM).toBe(10);
      expect(s.frictionResistanceKNPerM).toBeCloseTo(
        57.5 - 5 * Math.sqrt(3),
        12,
      );
      expect(r.calculation!.drivingKNPerM).toBeCloseTo(denominator, 12);
      expect(r.factorOfSafety).toBeCloseTo(
        (67.5 - 5 * Math.sqrt(3)) / denominator,
        12,
      );
      const historical =
        (10 + ((115 * Math.sqrt(3)) / 2 - 20) / Math.sqrt(3)) / denominator;
      expect(Math.abs(r.factorOfSafety! - historical)).toBeGreaterThan(0.04);
    },
  );
  it("reproduz as nove fatias de Duncan fig. 7.34 após conversão coerente para SI", () => {
    const ft = 0.3048,
      poundForce = 0.0044482216152605;
    const force = poundForce / ft,
      pressure = poundForce / (ft * ft);
    const original = [
      [2392, 11, 48.1, 0],
      [10580, 14.4, 39.8, 213],
      [9866, 8.6, 32.2, 515],
      [11383, 8.4, 26.7, 663],
      [7886, 5.5, 22.1, 745],
      [11153, 7.7, 17.8, 756],
      [15671, 11.9, 11.4, 673],
      [11098, 11.5, 3.8, 482],
      [4466, 12.4, -4, 181],
    ];
    const b = manual(
      original.map(([w, length, angle, u]) => ({
        w: w * force,
        length: length * ft,
        angle,
        u: u * pressure,
      })),
      100 * pressure,
      30,
    );
    const r = evaluate(b);
    expect(r.status).toBe("calculated");
    expect(r.calculation!.drivingKNPerM / force).toBeCloseTo(28822.497, 2);
    expect(r.calculation!.cohesionResistanceKNPerM / force).toBeCloseTo(
      9140,
      8,
    );
    expect(r.calculation!.frictionResistanceKNPerM / force).toBeCloseTo(
      25051.584,
      2,
    );
    expect(r.factorOfSafety).toBeCloseTo(1.186281, 6);
    expect(Math.abs(r.factorOfSafety! - 1.19)).toBeLessThan(0.005);
    expect(r.calculation!.slices.at(-1)!.weightDrivingKNPerM).toBeLessThan(0);
  });
  it("φ=0 dá somente Σcℓ / D, mesmo com pressão positiva", () => {
    const b = manual(undefined, 5, 0),
      r = evaluate(b);
    expect(r.factorOfSafety).toBeCloseTo(0.2, 12);
    expect(r.calculation!.frictionResistanceKNPerM).toBe(0);
  });
  it("resistência física nula tem estado próprio e FS zero", () => {
    const r = evaluate(manual(undefined, 0, 0));
    expect(r.status).toBe("zero-resistance");
    expect(r.factorOfSafety).toBe(0);
    expect(codes(r)).toContain("zero-resistance");
  });
  it("modo total usa ue=0 preservando u física e φ informado", () => {
    const b = manual();
    load(b, -5);
    b.mechanics.mechanics.slices[0].baseMaterial.mode = "total";
    b.mechanics.mechanics.slices[0].water.usedPressureKPa = 0;
    const r = evaluate(b);
    expect(r.factorOfSafety).toBeCloseTo(67.5 / 57.5, 12);
    expect(r.calculation!.slices[0].input.water.prescribed.pressureKPa).toBe(
      10,
    );
  });
  it("soma faixas com momentos opostos sem eliminar suas forças", () => {
    const b = manual();
    load(b, -5);
    const s = b.mechanics.mechanics.slices[0],
      second = copy(s.surcharge.contributions[0]);
    Object.assign(second, {
      loadId: "segunda",
      armDrivingM: 5 / 3,
      momentDrivingKNmPerM: 25,
    });
    s.surcharge.contributions[0].momentDrivingKNmPerM = -75;
    s.surcharge.contributions[0].armDrivingM = -5;
    s.surcharge.contributions.push(second);
    s.surcharge.forceKNPerM = 30;
    const r = evaluate(b);
    expect(r.calculation!.loadDrivingKNPerM).toBe(-5);
    expect(r.factorOfSafety).toBeCloseTo((75 - 5 * Math.sqrt(3)) / 45, 12);
  });
});

describe("Fellenius: recusa e representação", () => {
  it.each([NaN, Infinity, -1])("recusa limiares inválidos: %s", (v) => {
    for (const profile of [
      { ...numerical, drivingThresholdKNPerM: v },
      { ...numerical, tensionToleranceKPa: v },
    ]) {
      const r = evaluate(manual(), profile);
      expect(codes(r)).toContain("invalid-profile");
      expect(r.factorOfSafety).toBeNull();
    }
  });
  it("D igual ao limiar é rejeitado, acima dele é aceito", () => {
    const b = manual(),
      d = evaluate(b).calculation!.drivingKNPerM;
    expect(
      codes(evaluate(b, { ...numerical, drivingThresholdKNPerM: d })),
    ).toContain("invalid-driving");
    expect(
      evaluate(b, { ...numerical, drivingThresholdKNPerM: d - 1e-8 }).status,
    ).toBe("calculated");
  });
  it.each([0, -30])("D não positivo não fornece FS, α=%s", (angle) => {
    const r = evaluate(manual([{ w: 100, length: 2, angle, u: 0 }]));
    expect(r.factorOfSafety).toBeNull();
    expect(codes(r)).toContain("invalid-driving");
  });
  it("cancelamento quase exato não produz FS artificialmente gigante", () => {
    const b = manual([
      { w: 100, length: 2, angle: 30, u: 0 },
      { w: 100 - 1e-13, length: 2, angle: -30, u: 0 },
    ]);
    const r = evaluate(b, { ...numerical, drivingThresholdKNPerM: 0 });
    expect(r.calculation!.drivingKNPerM).toBeGreaterThan(0);
    expect(codes(r)).toContain("unresolved-driving");
    expect(r.factorOfSafety).toBeNull();
  });
  it("tração bloqueia mesmo com φ=0 ou resistência nula", () => {
    for (const c of [0, 5]) {
      const r = evaluate(manual([{ w: 1, length: 2, angle: 30, u: 10 }], c, 0));
      expect(codes(r)).toContain("base-tension");
      expect(r.factorOfSafety).toBeNull();
      expect(r.calculation!.slices[0].normalStressKPa).toBeLessThan(0);
    }
  });
  it("tração no limiar mantém valor bruto e aviso; além dele rejeita", () => {
    const b = manual([{ w: 1, length: 2, angle: 30, u: 1 }], 5, 30);
    const stress = -evaluate(b).calculation!.slices[0].normalStressKPa;
    const r = evaluate(b, { ...numerical, tensionToleranceKPa: stress });
    expect(r.status).toBe("calculated");
    expect(codes(r)).toContain("tolerated-tension");
    expect(r.calculation!.frictionResistanceKNPerM).toBeLessThan(0);
    expect(
      codes(evaluate(b, { ...numerical, tensionToleranceKPa: stress - 1e-8 })),
    ).toContain("base-tension");
  });
  it("cancelamento resistente não vira resistência física nula", () => {
    const b = manual([{ w: 1, length: 2, angle: 30, u: 10 }], 0, 30);
    const r = evaluate(b, { ...numerical, tensionToleranceKPa: 100 });
    expect(codes(r)).toContain("nonpositive-resistance");
    expect(codes(r)).not.toContain("zero-resistance");
    expect(r.factorOfSafety).toBeNull();
  });
  it("recusa modos mistos, mas não confunde materiais distintos", () => {
    const b = manual([
      { w: 100, length: 2, angle: 30, u: 0 },
      { w: 200, length: 1, angle: 20, u: 0 },
    ]);
    b.mechanics.mechanics.slices[1].baseMaterial.id = "outro-material";
    expect(evaluate(b).status).toBe("calculated");
    b.mechanics.mechanics.slices[1].baseMaterial.mode = "total";
    expect(codes(evaluate(b))).toContain("mixed-modes");
  });
  it("face vertical dentro do intervalo bloqueia e fora dele não interfere", () => {
    const b = prepare(),
      terrain = b.input.snapshot.input.geometry.terrain;
    terrain.splice(1, 0, { x: 0, z: 1 }, { x: 0, z: 0 });
    expect(codes(evaluate(b))).toContain("vertical-face");
    terrain.splice(1, 2, { x: -9, z: 5 }, { x: -9, z: 4.5 });
    expect(evaluate(b).status).toBe("calculated");
  });
  it("recusa entrada ausente, estágio bloqueado, revisão e contrato divergentes", () => {
    const b = prepare();
    expect(
      codes(
        solveFellenius(
          { status: "unavailable", snapshot: null, diagnostics: [] },
          b.mechanics,
          numerical,
        ),
      ),
    ).toContain("input-unavailable");
    expect(codes(solveFellenius(b.input, null, numerical))).toContain(
      "mechanics-unavailable",
    );
    b.mechanics.inputRevision = "outra revisão";
    expect(codes(evaluate(b))).toContain("stale-mechanics");
    b.mechanics.inputRevision = b.input.snapshot.revision;
    Object.assign(b.mechanics, { contract: "unknown" });
    expect(codes(evaluate(b))).toContain("mechanics-contract");
  });
  it("não executa método não selecionado nem busca", () => {
    const b = prepare();
    b.input.snapshot.input.analysis.methods = ["bishop"];
    expect(codes(evaluate(b))).toContain("method-unavailable");
    b.input.snapshot.input.analysis.methods = ["fellenius"];
    b.input.snapshot.input.surface = { mode: null };
    expect(codes(evaluate(b))).toContain("method-unavailable");
  });
  it("raio ou direção de outra preparação são rejeitados", () => {
    const b = prepare();
    b.mechanics.mechanics.circleRadiusM = 6;
    expect(codes(evaluate(b))).toContain("mechanics-mismatch");
  });
  it("recusa numeração repetida", () => {
    const b = prepare();
    b.mechanics.mechanics.slices[1].number = 1;
    expect(codes(evaluate(b))).toContain("invalid-slices");
  });
  it.each([NaN, Infinity, -1])("recusa peso inválido %s", (w) => {
    const b = manual();
    b.mechanics.mechanics.slices[0].weight.weightKNPerM = w;
    expect(evaluate(b).factorOfSafety).toBeNull();
  });
  it("recusa overflow e produto não nulo que desaparece", () => {
    const overflow = manual(undefined, Number.MAX_VALUE, 30);
    expect(codes(evaluate(overflow))).toContain("numerical-error");
    const underflow = manual(
      [{ w: 1, length: 1e-100, angle: 30, u: 0 }],
      Number.MIN_VALUE,
      30,
    );
    expect(codes(evaluate(underflow))).toContain("numerical-error");
  });
  it("recusa inconsistência na água de modo total e nas parcelas de carga", () => {
    const b = manual();
    b.mechanics.mechanics.slices[0].baseMaterial.mode = "total";
    expect(codes(evaluate(b))).toContain("invalid-mechanical-slice");
    b.mechanics.mechanics.slices[0].water.usedPressureKPa = 0;
    load(b, -5);
    b.mechanics.mechanics.slices[0].surcharge.forceKNPerM = 99;
    expect(codes(evaluate(b))).toContain("invalid-load");
  });
});

describe("Fellenius: preparação completa e invariâncias", () => {
  it("calcula o modelo próprio e converge com refinamento", () => {
    const values = [3, 1.5, 0.75, 0.375].map(
      (a) => run(fixture(), a).factorOfSafety!,
    );
    expect(values.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    expect(Math.abs(values[3] - values[2])).toBeLessThan(
      Math.abs(values[1] - values[0]),
    );
    expect(Math.abs(values[3] - values[0])).toBeLessThan(0.005);
  });
  it("espelhamento com sentido oposto e translação preservam FS", () => {
    const p = fixture(),
      original = run(p);
    const mirrored = copy(p);
    mirrored.sections[0].terrain = mirrored.sections[0].terrain
      .map((v) => ({ x: -v.x, y: v.y }))
      .reverse();
    mirrored.analysisCases[0].direction = "right-to-left";
    expect(run(mirrored).factorOfSafety).toBeCloseTo(
      original.factorOfSafety!,
      10,
    );
    for (const v of p.sections[0].terrain) {
      v.x += 10000;
      v.y += 5000;
    }
    p.sections[0].base += 5000;
    p.analysisCases[0].fixedCircle.x! += 10000;
    p.analysisCases[0].fixedCircle.y! += 5000;
    expect(run(p).factorOfSafety).toBeCloseTo(original.factorOfSafety!, 8);
  });
  it("água abaixo do terreno reduz atrito no modo efetivo e preserva o total", () => {
    const p = fixture(),
      dry = run(p).factorOfSafety!;
    p.sections[0].waterMode = "piezometric";
    p.sections[0].waterUnitWeight = 10;
    p.sections[0].water = [
      { x: -10, y: 4 },
      { x: 10, y: -6 },
    ];
    const wet = run(p);
    expect(wet.status).toBe("calculated");
    expect(wet.factorOfSafety!).toBeLessThan(dry);
    p.materials[0].mode = "total";
    // Água adiciona cortes obrigatórios: compare total e seco na mesma malha.
    const total = run(p),
      b = prepare(p);
    for (const s of b.mechanics.mechanics.slices)
      s.water.prescribed.pressureKPa = 0;
    expect(evaluate(b).factorOfSafety).toBe(total.factorOfSafety);
  });
  it("não modifica arquivo nem congela o chamador; cópia de resultado imutável", () => {
    const p = fixture(),
      before = serializeProject(p),
      b = prepare(p);
    const r = evaluate(b),
      w = r.calculation!.slices[0].input.weight.weightKNPerM;
    expect(Object.isFrozen(r.calculation!.slices)).toBe(true);
    expect(Object.isFrozen(b.mechanics)).toBe(false);
    b.mechanics.mechanics.slices[0].weight.weightKNPerM = 99;
    expect(r.calculation!.slices[0].input.weight.weightKNPerM).toBe(w);
    expect(serializeProject(p)).toBe(before);
  });
});
