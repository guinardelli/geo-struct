import type { CoreInput, Immutable, InputPreparation } from "./input";
import type {
  MechanicalSlice,
  SliceMechanicsPreparation,
} from "./slice-mechanics";
import { freeze } from "./immutable";

export type FelleniusProfile = {
  drivingThresholdKNPerM: number;
  tensionToleranceKPa: number;
};
export type FelleniusDiagnostic = {
  code: string;
  level: "error" | "warning";
  message: string;
  sliceNumber?: number;
  value?: number;
  threshold?: number;
};
export type FelleniusSlice = Immutable<{
  input: MechanicalSlice;
  projectedWaterKNPerM: number;
  normalForResistanceKNPerM: number;
  normalStressKPa: number;
  cohesionResistanceKNPerM: number;
  frictionResistanceKNPerM: number;
  resistanceKNPerM: number;
  weightDrivingKNPerM: number;
  loadDriving: { loadId: string; valueKNPerM: number }[];
  loadDrivingKNPerM: number;
  drivingKNPerM: number;
}>;
export type FelleniusResult = Immutable<
  {
    contract: "geostruct-fellenius/1";
    method: "fellenius";
    formulation: "usace-c12-projected-pressure";
    stage: "fixed-circle-evaluation";
    inputRevision: string | null;
    geometryProfile: SliceMechanicsPreparation["geometryProfile"];
    profile: FelleniusProfile;
    source: {
      origin: CoreInput["origin"];
      radiusM: number;
      center: { x: number; z: number };
      direction: "left-to-right" | "right-to-left";
    } | null;
    calculation: {
      slices: FelleniusSlice[];
      weightDrivingKNPerM: number;
      loadDrivingKNPerM: number;
      drivingKNPerM: number;
      drivingRoundoffBoundKNPerM: number;
      cohesionResistanceKNPerM: number;
      frictionResistanceKNPerM: number;
      resistanceKNPerM: number;
    } | null;
    diagnostics: FelleniusDiagnostic[];
  } & (
    | { status: "calculated" | "zero-resistance"; factorOfSafety: number }
    | { status: "rejected"; factorOfSafety: null }
  )
>;

class EvaluationError extends Error {
  constructor(readonly diagnostic: FelleniusDiagnostic) {
    super(diagnostic.message);
  }
}
function fail(
  code: string,
  message: string,
  details: Partial<FelleniusDiagnostic> = {},
): never {
  throw new EvaluationError({ ...details, code, level: "error", message });
}
function finite(value: number, label: string, sliceNumber?: number): number {
  if (!Number.isFinite(value))
    fail("numerical-error", `Valor não finito em ${label}.`, { sliceNumber });
  return value === 0 ? 0 : value;
}
function multiply(
  a: number,
  b: number,
  label: string,
  sliceNumber?: number,
): number {
  const value = finite(a * b, label, sliceNumber);
  if (a !== 0 && b !== 0 && value === 0)
    fail(
      "numerical-error",
      `Produto não nulo abaixo da representação em ${label}.`,
      { sliceNumber },
    );
  return value;
}
function divide(
  a: number,
  b: number,
  label: string,
  sliceNumber?: number,
): number {
  const value = finite(a / b, label, sliceNumber);
  if (a !== 0 && value === 0)
    fail(
      "numerical-error",
      `Quociente não nulo abaixo da representação em ${label}.`,
      { sliceNumber },
    );
  return value;
}
// Soma de Neumaier: conserva parcelas pequenas e sinais antes do teste de D.
function sum(values: readonly number[], label: string): number {
  let total = 0,
    correction = 0;
  for (const value of values) {
    const next = finite(total + value, label);
    correction = finite(
      correction +
        (Math.abs(total) >= Math.abs(value)
          ? total - next + value
          : value - next + total),
      label,
    );
    total = next;
  }
  return finite(total + correction, label);
}
function close(a: number, b: number): boolean {
  return (
    Math.abs(a - b) <=
    64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE)
  );
}

/** D1: Fellenius com água projetada. Sem busca, Bishop ou critério normativo. */
export function solveFellenius(
  preparation: InputPreparation,
  mechanics: SliceMechanicsPreparation | null,
  profile: FelleniusProfile,
): FelleniusResult {
  const common = {
    contract: "geostruct-fellenius/1" as const,
    method: "fellenius" as const,
    formulation: "usace-c12-projected-pressure" as const,
    stage: "fixed-circle-evaluation" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    geometryProfile: mechanics?.geometryProfile ?? null,
    profile,
  };
  let source: FelleniusResult["source"] = null;
  let calculation: FelleniusResult["calculation"] = null;
  const diagnostics: FelleniusDiagnostic[] = [];
  const rejected = (): FelleniusResult =>
    freeze(
      structuredClone({
        ...common,
        source,
        calculation,
        diagnostics,
        status: "rejected" as const,
        factorOfSafety: null,
      }),
    );
  try {
    if (
      ![profile.drivingThresholdKNPerM, profile.tensionToleranceKPa].every(
        (n) => Number.isFinite(n) && n >= 0,
      )
    )
      fail(
        "invalid-profile",
        "Informe limiar motriz e tolerância de tração finitos e não negativos, nas unidades indicadas.",
      );
    if (
      !preparation.snapshot ||
      preparation.diagnostics.some((d) => d.level === "error")
    )
      fail(
        "input-unavailable",
        "Corrija as entradas do caso antes de calcular Fellenius.",
      );
    const input = preparation.snapshot.input;
    if (
      input.surface.mode !== "fixed" ||
      !input.analysis.methods.includes("fellenius")
    )
      fail(
        "method-unavailable",
        "Selecione Fellenius e círculo fixo no caso aplicado.",
      );
    if (!mechanics || mechanics.status !== "prepared")
      fail(
        "mechanics-unavailable",
        "Prepare uma entrada mecânica válida antes de calcular Fellenius.",
      );
    if (
      mechanics.contract !== "geostruct-slice-mechanics/1" ||
      mechanics.stage !== "mechanical-inputs-only" ||
      mechanics.geometryContract !== "geostruct-fixed-geometry/2" ||
      !mechanics.geometryProfile
    )
      fail(
        "mechanics-contract",
        "Contrato mecânico incompatível com Fellenius.",
      );
    if (mechanics.inputRevision !== preparation.snapshot.revision)
      fail(
        "stale-mechanics",
        "A entrada mecânica pertence a outra revisão. Prepare novamente as fatias.",
      );
    const data = mechanics.mechanics;
    const radius = data.circleRadiusM;
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      radius !== input.surface.circle.radius ||
      data.frame.origin.x !== input.surface.circle.x ||
      data.frame.origin.z !== input.surface.circle.z ||
      data.frame.direction !== input.analysis.direction
    )
      fail(
        "mechanics-mismatch",
        "Círculo ou sentido incompatível com o caso aplicado.",
      );
    if (
      !data.slices.length ||
      new Set(data.slices.map((s) => s.number)).size !== data.slices.length
    )
      fail("invalid-slices", "Fatias ausentes ou com numeração repetida.");
    const modes = new Set(data.slices.map((s) => s.baseMaterial.mode));
    if (
      modes.size !== 1 ||
      ![...modes].every((m) => m === "effective" || m === "total")
    )
      fail(
        "mixed-modes",
        "Este recorte de Fellenius exige todas as bases em tensões efetivas ou todas em totais. Modo misto permanece em revisão.",
      );
    const left = Math.min(...data.slices.map((s) => s.original.leftX));
    const right = Math.max(...data.slices.map((s) => s.original.rightX));
    const terrain = input.geometry.terrain;
    if (
      terrain.some(
        (p, i) =>
          i > 0 && p.x === terrain[i - 1].x && p.x >= left && p.x <= right,
      )
    )
      fail(
        "vertical-face",
        "Há face vertical no intervalo da massa. Seu tratamento mecânico permanece fora deste recorte de Fellenius.",
      );
    source = {
      origin: data.origin,
      radiusM: radius,
      center: data.frame.origin,
      direction: data.frame.direction,
    };
    const slices = data.slices.map((s): FelleniusSlice => {
      const n = s.number;
      const w = finite(s.weight.weightKNPerM, "peso", n);
      const q = finite(s.surcharge.forceKNPerM, "sobrecarga", n);
      const u = finite(s.water.usedPressureKPa, "pressão usada", n);
      const c = finite(s.baseMaterial.cohesionKPa, "coesão", n);
      const phi = finite(s.baseMaterial.frictionDegrees, "atrito", n);
      const t = finite(s.baseMaterial.tanPhi, "tan φ", n);
      const b = finite(s.widthM, "largura", n);
      const length = finite(s.baseLengthM, "corda", n);
      const sin = finite(s.sinAlpha, "sin α", n),
        cos = finite(s.cosAlpha, "cos α", n);
      const alpha = finite(s.alphaRadians, "α", n);
      const physicalU = finite(
        s.water.prescribed.pressureKPa,
        "pressão física",
        n,
      );
      if (
        w <= 0 ||
        q < 0 ||
        u < 0 ||
        physicalU < 0 ||
        c < 0 ||
        phi < 0 ||
        phi >= 90 ||
        t < 0 ||
        b <= 0 ||
        length <= 0 ||
        cos <= 0 ||
        Math.abs(alpha) >= Math.PI / 2 ||
        !close(sin, Math.sin(alpha)) ||
        !close(cos, Math.cos(alpha)) ||
        !close(b, length * cos) ||
        !close(t, Math.tan((phi * Math.PI) / 180)) ||
        u !== (s.baseMaterial.mode === "total" ? 0 : physicalU)
      )
        fail(
          "invalid-mechanical-slice",
          `Entrada mecânica inconsistente na fatia ${n}.`,
          { sliceNumber: n },
        );
      const loadDriving = s.surcharge.contributions.map((load) => {
        const moment = finite(
          load.momentDrivingKNmPerM ?? NaN,
          "momento da sobrecarga",
          n,
        );
        const force = finite(load.forceKNPerM, "força da faixa", n);
        const arm = finite(load.armDrivingM ?? NaN, "braço da faixa", n);
        if (
          force < 0 ||
          !close(moment, multiply(force, arm, "momento da faixa", n))
        )
          fail("invalid-load", `Momento inconsistente na fatia ${n}.`, {
            sliceNumber: n,
          });
        return {
          loadId: load.loadId,
          valueKNPerM: divide(moment, radius, "momento / raio", n),
        };
      });
      if (
        !close(
          q,
          sum(
            s.surcharge.contributions.map((l) => l.forceKNPerM),
            "força das faixas",
          ),
        )
      )
        fail(
          "invalid-load",
          `Resultante das faixas inconsistente na fatia ${n}.`,
          { sliceNumber: n },
        );
      const vertical = finite(w + q, "W + Q", n);
      const projectedWaterKNPerM = multiply(
        multiply(u, b, "ue b", n),
        cos,
        "ue b cos α",
        n,
      );
      const normalForResistanceKNPerM = multiply(
        finite(vertical - multiply(u, b, "ue b", n), "V − ue b", n),
        cos,
        "normal",
        n,
      );
      const normalStressKPa = divide(
        normalForResistanceKNPerM,
        length,
        "tensão normal",
        n,
      );
      const cohesionResistanceKNPerM = multiply(c, length, "c ℓ", n);
      const frictionResistanceKNPerM = multiply(
        normalForResistanceKNPerM,
        t,
        "N tan φ",
        n,
      );
      const resistanceKNPerM = finite(
        cohesionResistanceKNPerM + frictionResistanceKNPerM,
        "resistência",
        n,
      );
      const weightDrivingKNPerM = multiply(w, sin, "W sin α", n);
      const loadDrivingKNPerM = sum(
        loadDriving.map((l) => l.valueKNPerM),
        "parcela motriz das faixas",
      );
      const drivingKNPerM = sum(
        [weightDrivingKNPerM, ...loadDriving.map((l) => l.valueKNPerM)],
        "parcela motriz da fatia",
      );
      if (normalStressKPa < -profile.tensionToleranceKPa)
        diagnostics.push({
          code: "base-tension",
          level: "error",
          message: `Tração na base da fatia ${n} excede a tolerância informada.`,
          sliceNumber: n,
          value: normalStressKPa,
          threshold: profile.tensionToleranceKPa,
        });
      else if (normalStressKPa < 0)
        diagnostics.push({
          code: "tolerated-tension",
          level: "warning",
          message: `Tensão negativa dentro da tolerância na fatia ${n}; valor bruto conservado.`,
          sliceNumber: n,
          value: normalStressKPa,
          threshold: profile.tensionToleranceKPa,
        });
      return {
        input: s,
        projectedWaterKNPerM,
        normalForResistanceKNPerM,
        normalStressKPa,
        cohesionResistanceKNPerM,
        frictionResistanceKNPerM,
        resistanceKNPerM,
        weightDrivingKNPerM,
        loadDriving,
        loadDrivingKNPerM,
        drivingKNPerM,
      };
    });
    const drivingTerms = slices.flatMap((s) => [
      s.weightDrivingKNPerM,
      ...s.loadDriving.map((l) => l.valueKNPerM),
    ]);
    const driving = sum(drivingTerms, "denominador motriz");
    const roundoff = finite(
      32 * Number.EPSILON * sum(drivingTerms.map(Math.abs), "módulos motrizes"),
      "limite de representação",
    );
    const resistance = sum(
      slices.flatMap((s) => [
        s.cohesionResistanceKNPerM,
        s.frictionResistanceKNPerM,
      ]),
      "resistência global",
    );
    calculation = {
      slices,
      weightDrivingKNPerM: sum(
        slices.map((s) => s.weightDrivingKNPerM),
        "pesos motrizes",
      ),
      loadDrivingKNPerM: sum(
        slices.flatMap((s) => s.loadDriving.map((l) => l.valueKNPerM)),
        "cargas motrizes",
      ),
      drivingKNPerM: driving,
      drivingRoundoffBoundKNPerM: roundoff,
      cohesionResistanceKNPerM: sum(
        slices.map((s) => s.cohesionResistanceKNPerM),
        "coesão global",
      ),
      frictionResistanceKNPerM: sum(
        slices.map((s) => s.frictionResistanceKNPerM),
        "atrito global",
      ),
      resistanceKNPerM: resistance,
    };
    if (driving <= profile.drivingThresholdKNPerM)
      diagnostics.push({
        code: "invalid-driving",
        level: "error",
        message:
          "Momento motriz dividido pelo raio não supera o limiar no sentido escolhido.",
        value: driving,
        threshold: profile.drivingThresholdKNPerM,
      });
    else if (driving <= roundoff)
      diagnostics.push({
        code: "unresolved-driving",
        level: "error",
        message:
          "O denominador motriz é indistinguível de cancelamento numérico; revise a superfície e o sentido.",
        value: driving,
        threshold: roundoff,
      });
    if (diagnostics.some((d) => d.level === "error")) return rejected();
    if (
      slices.every(
        (s) =>
          s.input.baseMaterial.cohesionKPa === 0 &&
          s.input.baseMaterial.frictionDegrees === 0,
      )
    ) {
      diagnostics.push({
        code: "zero-resistance",
        level: "warning",
        message:
          "Resistência nula em todas as bases: FS = 0 para este círculo. Condição destacada; não há classificação de busca.",
      });
      return freeze(
        structuredClone({
          ...common,
          source,
          calculation,
          diagnostics,
          status: "zero-resistance" as const,
          factorOfSafety: 0,
        }),
      );
    }
    if (resistance <= 0)
      fail(
        "nonpositive-resistance",
        "A soma resistente não é positiva. Cancelamento não é interpretado como ausência física de resistência.",
        { value: resistance },
      );
    const factorOfSafety = divide(resistance, driving, "FS");
    return freeze(
      structuredClone({
        ...common,
        source,
        calculation,
        diagnostics,
        status: "calculated" as const,
        factorOfSafety,
      }),
    );
  } catch (error) {
    if (!(error instanceof EvaluationError)) throw error;
    diagnostics.push(error.diagnostic);
    return rejected();
  }
}
