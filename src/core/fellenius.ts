import type { CoreInput, Immutable, InputPreparation } from "./input";
import type {
  MechanicalSlice,
  SliceMechanicsPreparation,
} from "./slice-mechanics";
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

export type FelleniusProfile = EquilibriumProfile;
export type FelleniusDiagnostic = EquilibriumDiagnostic;
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
    const { data, radius } = validateEquilibrium(
      preparation,
      mechanics,
      profile,
      "fellenius",
    );
    source = {
      origin: data.origin,
      radiusM: radius,
      center: data.frame.origin,
      direction: data.frame.direction,
    };
    const mechanical = data.slices.map((s) =>
      validateMechanicalSlice(s, radius),
    );
    const balance = drivingBalance(mechanical);
    const slices = mechanical.map((validated): FelleniusSlice => {
      const {
        input: s,
        n,
        u,
        c,
        t,
        b,
        length,
        cos,
        vertical,
        loadDriving,
        weightDrivingKNPerM,
        loadDrivingKNPerM,
        drivingKNPerM,
      } = validated;
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
    const driving = balance.drivingKNPerM;
    const resistance = sum(
      slices.flatMap((s) => [
        s.cohesionResistanceKNPerM,
        s.frictionResistanceKNPerM,
      ]),
      "resistência global",
    );
    calculation = {
      slices,
      ...balance,
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
    diagnostics.push(...drivingDiagnostics(balance, profile));
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
          "Resistência nula em todas as bases: FS = 0 para este círculo. Condição de resistência nula destacada.",
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
