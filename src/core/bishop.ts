import type { Immutable, InputPreparation } from "./input";
import type { SliceMechanicsPreparation } from "./slice-mechanics";
import { freeze } from "./immutable";
import {
  EvaluationError,
  fail,
  finite,
  multiply,
  divide,
  sum,
  validateEquilibrium,
  validateMechanicalSlice,
  drivingBalance,
  drivingDiagnostics,
  type EquilibriumProfile,
  type EquilibriumDiagnostic,
} from "./limit-equilibrium";

/** Limite operacional da avaliação síncrona; não é parâmetro geotécnico. */
export const MAX_BISHOP_ITERATIONS = 1000;
export type BishopIterationProfile = {
  initialFactor: number;
  residualTolerance: number;
  maxIterations: number;
  singularityThreshold: number;
};
export type BishopProfile = EquilibriumProfile & BishopIterationProfile;
export function isBishopIterationProfileValid(
  profile: BishopIterationProfile,
): boolean {
  return (
    Number.isFinite(profile.initialFactor) &&
    profile.initialFactor > 0 &&
    Number.isFinite(profile.residualTolerance) &&
    profile.residualTolerance > 0 &&
    Number.isInteger(profile.maxIterations) &&
    profile.maxIterations >= 1 &&
    profile.maxIterations <= MAX_BISHOP_ITERATIONS &&
    Number.isFinite(profile.singularityThreshold) &&
    profile.singularityThreshold >= 0
  );
}
type ValidatedSlice = ReturnType<typeof validateMechanicalSlice>;
export type BishopIteration = {
  iteration: number;
  trialFactor: number;
  updatedFactor: number | null;
  residual: number | null;
  numeratorKNPerM: number | null;
  minM: number | null;
};
export type BishopSlice = Immutable<{
  input: ValidatedSlice["input"];
  m: number;
  reducedResistanceKNPerM: number;
  normalForResistanceKNPerM: number | null;
  totalNormalKNPerM: number | null;
  normalStressKPa: number | null;
  resistanceKNPerM: number | null;
  weightDrivingKNPerM: number;
  loadDriving: ValidatedSlice["loadDriving"];
  loadDrivingKNPerM: number;
  drivingKNPerM: number;
}>;
export type BishopResult = Immutable<
  {
    contract: "geostruct-bishop/1";
    method: "bishop";
    formulation: "usace-f4-f6-ub";
    stage: "fixed-circle-evaluation";
    inputRevision: string | null;
    geometryProfile: SliceMechanicsPreparation["geometryProfile"];
    profile: BishopProfile;
    source: {
      origin: NonNullable<InputPreparation["snapshot"]>["input"]["origin"];
      radiusM: number;
      center: { x: number; z: number };
      direction: "left-to-right" | "right-to-left";
    } | null;
    calculation:
      | (ReturnType<typeof drivingBalance> & {
          evaluation: (BishopIteration & { slices: BishopSlice[] }) | null;
        })
      | null;
    iterations: BishopIteration[];
    diagnostics: EquilibriumDiagnostic[];
  } & (
    | { status: "calculated"; factorOfSafety: number }
    | {
        status: "rejected" | "nonconverged" | "zero-resistance";
        factorOfSafety: null;
      }
  )
>;

/** Ponto fixo sem amortecimento. Retorna o F avaliado, com seu próprio resíduo. */
export function solveBishop(
  preparation: InputPreparation,
  mechanics: SliceMechanicsPreparation | null,
  profile: BishopProfile,
): BishopResult {
  const common = {
    contract: "geostruct-bishop/1" as const,
    method: "bishop" as const,
    formulation: "usace-f4-f6-ub" as const,
    stage: "fixed-circle-evaluation" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    geometryProfile: mechanics?.geometryProfile ?? null,
    profile,
  };
  let source: BishopResult["source"] = null;
  let calculation: BishopResult["calculation"] = null;
  const iterations: BishopIteration[] = [];
  const diagnostics: EquilibriumDiagnostic[] = [];
  let iteration: number | undefined;
  const rejected = (
    status: "rejected" | "nonconverged" | "zero-resistance" = "rejected",
  ): BishopResult =>
    freeze(
      structuredClone({
        ...common,
        source,
        calculation,
        iterations,
        diagnostics,
        status,
        factorOfSafety: null,
      }),
    );
  try {
    if (!isBishopIterationProfileValid(profile))
      fail(
        "invalid-profile",
        `Informe F₀ e τF finitos e positivos, K inteiro de 1 a ${MAX_BISHOP_ITERATIONS} e τm finito não negativo.`,
      );
    const { data, radius } = validateEquilibrium(
      preparation,
      mechanics,
      profile,
      "bishop",
    );
    source = {
      origin: data.origin,
      radiusM: radius,
      center: data.frame.origin,
      direction: data.frame.direction,
    };
    const slices = data.slices.map((s) => validateMechanicalSlice(s, radius));
    const balance = drivingBalance(slices);
    calculation = { ...balance, evaluation: null };
    diagnostics.push(...drivingDiagnostics(balance, profile));
    if (diagnostics.some((d) => d.level === "error")) return rejected();
    if (slices.every((s) => s.c === 0 && s.t === 0)) {
      diagnostics.push({
        code: "zero-resistance",
        level: "warning",
        message:
          "Resistência física nula em todas as bases. Bishop exige F positivo; a recorrência não admite F = 0. FS indisponível neste método.",
      });
      return rejected("zero-resistance");
    }
    // Parcelas independentes da tentativa. Água usa ue b, sem sec α adicional.
    const constants = slices.map((s) => ({
      verticalNet: finite(
        s.vertical - multiply(s.u, s.b, "ue b", s.n),
        "V − ue b",
        s.n,
      ),
      cohesion: multiply(s.c, s.length, "c ℓ", s.n),
    }));
    const numerators = slices.map((s, i) =>
      sum(
        [
          multiply(s.c, s.b, "c b", s.n),
          multiply(constants[i].verticalNet, s.t, "(V − ue b) tan φ", s.n),
        ],
        "numerador reduzido da fatia",
      ),
    );
    let factor = profile.initialFactor;
    for (iteration = 1; iteration <= profile.maxIterations; iteration++) {
      const attempt: BishopIteration = {
        iteration,
        trialFactor: factor,
        updatedFactor: null,
        residual: null,
        numeratorKNPerM: null,
        minM: null,
      };
      iterations.push(attempt);
      const rows = slices.map((s, i): BishopSlice => {
        const m = finite(
          s.cos +
            divide(
              multiply(s.sin, s.t, "sin α tan φ", s.n),
              factor,
              "sin α tan φ / F",
              s.n,
            ),
          "mα",
          s.n,
        );
        attempt.minM = attempt.minM === null ? m : Math.min(attempt.minM, m);
        if (m <= profile.singularityThreshold)
          fail(
            "singular-iteration",
            `mα na fatia ${s.n} não supera τm na avaliação ${iteration}. A trajetória foi interrompida; isso não prova ausência de outra raiz.`,
            {
              sliceNumber: s.n,
              value: m,
              threshold: profile.singularityThreshold,
            },
          );
        return {
          input: s.input,
          m,
          reducedResistanceKNPerM: divide(
            numerators[i],
            m,
            "parcela resistente reduzida",
            s.n,
          ),
          normalForResistanceKNPerM: null,
          totalNormalKNPerM: null,
          normalStressKPa: null,
          resistanceKNPerM: null,
          weightDrivingKNPerM: s.weightDrivingKNPerM,
          loadDriving: s.loadDriving,
          loadDrivingKNPerM: s.loadDrivingKNPerM,
          drivingKNPerM: s.drivingKNPerM,
        };
      });
      attempt.numeratorKNPerM = sum(
        rows.map((s) => s.reducedResistanceKNPerM),
        "numerador de Bishop",
      );
      const updated = divide(
        attempt.numeratorKNPerM,
        balance.drivingKNPerM,
        "G(F)",
      );
      attempt.updatedFactor = updated;
      attempt.residual = Math.abs(finite(updated - factor, "G(F) − F"));
      calculation = { ...balance, evaluation: { ...attempt, slices: rows } };
      if (updated <= 0)
        fail(
          "nonpositive-update",
          "G(F) não é positivo. Cancelamento resistente não é interpretado como resistência física nula.",
          { value: updated },
        );
      if (attempt.residual <= profile.residualTolerance) {
        const convergedRows = rows.map((row, i): BishopSlice => {
          const s = slices[i];
          const normal = divide(
            finite(
              constants[i].verticalNet -
                divide(
                  multiply(constants[i].cohesion, s.sin, "c ℓ sin α", s.n),
                  factor,
                  "c ℓ sin α / F",
                  s.n,
                ),
              "numerador da normal",
              s.n,
            ),
            row.m,
            "normal de Bishop",
            s.n,
          );
          const stress = divide(normal, s.length, "tensão normal", s.n);
          if (stress < -profile.tensionToleranceKPa)
            diagnostics.push({
              code: "base-tension",
              level: "error",
              message: `Tração na base da fatia ${s.n} excede a tolerância na solução convergida.`,
              sliceNumber: s.n,
              iteration,
              value: stress,
              threshold: profile.tensionToleranceKPa,
            });
          else if (stress < 0)
            diagnostics.push({
              code: "tolerated-tension",
              level: "warning",
              message: `Tensão negativa dentro da tolerância na fatia ${s.n}; valor bruto conservado.`,
              sliceNumber: s.n,
              iteration,
              value: stress,
              threshold: profile.tensionToleranceKPa,
            });
          return {
            ...row,
            normalForResistanceKNPerM: normal,
            normalStressKPa: stress,
            totalNormalKNPerM: finite(
              normal + multiply(s.u, s.length, "ue ℓ", s.n),
              "normal total",
              s.n,
            ),
            resistanceKNPerM: finite(
              constants[i].cohesion + multiply(normal, s.t, "N tan φ", s.n),
              "resistência",
              s.n,
            ),
          };
        });
        calculation = {
          ...balance,
          evaluation: { ...attempt, slices: convergedRows },
        };
        if (diagnostics.some((d) => d.level === "error")) return rejected();
        return freeze(
          structuredClone({
            ...common,
            source,
            calculation,
            iterations,
            diagnostics,
            status: "calculated" as const,
            factorOfSafety: factor,
          }),
        );
      }
      if (iteration === profile.maxIterations) {
        diagnostics.push({
          code: "nonconvergence",
          level: "error",
          message: `Sem convergência em ${iteration} avaliações. A última tentativa não é um fator de segurança válido.`,
          iteration,
          value: attempt.residual,
          threshold: profile.residualTolerance,
        });
        return rejected("nonconverged");
      }
      factor = updated;
    }
    throw new Error("Limite de iteração validado não alcançado.");
  } catch (error) {
    if (!(error instanceof EvaluationError)) throw error;
    diagnostics.push({ ...error.diagnostic, iteration });
    return rejected();
  }
}
