import type { CoreInput, Immutable, InputPreparation, PointXZ } from "./input";
import type { FixedCirclePreparation, GeometryProfile } from "./fixed-circle";
import type { SliceWeight, SliceWeightPreparation } from "./slice-weights";
import type {
  SlicePressure,
  SlicePressurePreparation,
} from "./slice-pressures";
import type { LoadContribution, SliceLoadPreparation } from "./slice-loads";
import { freeze } from "./immutable";

export type MechanicalDependencies = {
  weights: SliceWeightPreparation | null;
  pressures: SlicePressurePreparation | null;
  loads: SliceLoadPreparation | null;
};
export type MechanicalSlice = Immutable<{
  number: number;
  order: number;
  original: { leftX: number; rightX: number; basePoint: PointXZ };
  local: { entry: PointXZ; exit: PointXZ; basePoint: PointXZ };
  widthM: number;
  baseLengthM: number;
  alphaRadians: number;
  sinAlpha: number;
  cosAlpha: number;
  weightArmM: number;
  baseMaterial: {
    id: string;
    name: string;
    source: string;
    mode: "effective" | "total";
    cohesionKPa: number;
    frictionDegrees: number;
    frictionRadians: number;
    tanPhi: number;
  };
  weight: SliceWeight;
  water: {
    prescribed: SlicePressure;
    usedPressureKPa: number;
    physicalBaseResultantKNPerM: number;
    usedBaseResultantKNPerM: number;
  };
  surcharge: {
    forceKNPerM: number;
    momentDrivingKNmPerM: number;
    contributions: (LoadContribution & { localApplicationPoint: PointXZ })[];
  };
  downwardForceKNPerM: number;
}>;
export type MechanicsDiagnostic = {
  code: string;
  message: string;
  sliceNumber?: number;
  materialId?: string;
};
export type SliceMechanicsPreparation = Immutable<
  {
    contract: "geostruct-slice-mechanics/1";
    stage: "mechanical-inputs-only";
    inputRevision: string | null;
    geometryContract: "geostruct-fixed-geometry/2" | null;
    geometryProfile: GeometryProfile | null;
  } & (
    | {
        status: "prepared";
        mechanics: {
          origin: CoreInput["origin"];
          frame: {
            origin: PointXZ;
            horizontal: "movement";
            up: "+Z";
            horizontalSign: 1 | -1;
            direction: "left-to-right" | "right-to-left";
          };
          approximation: {
            base: "chord";
            pressure: "constant-at-arc-midpoint";
            weightArm: "radius-sin-alpha";
          };
          units: {
            length: "m";
            stress: "kPa";
            force: "kN/m";
            moment: "kN·m/m";
            angle: "rad";
          };
          resistanceModes: ("effective" | "total")[];
          water: CoreInput["water"];
          loadDefinitions: CoreInput["loads"];
          slices: MechanicalSlice[];
          totalWeightKNPerM: number;
          totalSurchargeKNPerM: number;
          totalDownwardForceKNPerM: number;
        };
        diagnostics: [];
      }
    | { status: "blocked"; mechanics: null; diagnostics: MechanicsDiagnostic[] }
  )
>;

class MechanicsError extends Error {
  constructor(readonly diagnostic: MechanicsDiagnostic) {
    super(diagnostic.message);
  }
}
function fail(
  code: string,
  message: string,
  details: Partial<MechanicsDiagnostic> = {},
): never {
  throw new MechanicsError({ ...details, code, message });
}
function finite(n: number): number {
  if (!Number.isFinite(n))
    fail(
      "mechanics-numerical",
      "Uma grandeza mecânica não é finita. Nenhuma entrada parcial foi consolidada.",
    );
  return n === 0 ? 0 : n;
}
function nonnegative(n: number): number {
  if (finite(n) < 0)
    fail(
      "mechanics-negative",
      "Há força, pressão ou parâmetro que deveria ser não negativo.",
    );
  return n;
}
function product(a: number, b: number): number {
  const value = finite(a * b);
  if (a !== 0 && b !== 0 && value === 0)
    fail(
      "mechanics-numerical",
      "Uma grandeza não nula ficou abaixo da representação numérica. Nenhum valor foi substituído por zero.",
    );
  return value;
}
function indexed<T extends { readonly number: number }>(
  items: readonly T[],
  numbers: Set<number>,
  label: string,
): Map<number, T> {
  const map = new Map(items.map((s) => [s.number, s]));
  if (
    items.length !== numbers.size ||
    map.size !== items.length ||
    [...map.keys()].some((n) => !numbers.has(n))
  )
    fail(
      "mechanics-slice-mismatch",
      `A numeração das fatias de ${label} não corresponde à geometria. Prepare novamente as fatias.`,
    );
  return map;
}

/** Consolidação para inspeção e futuros métodos; não avalia equilíbrio ou admissibilidade. */
export function prepareSliceMechanics(
  preparation: InputPreparation,
  geometry: FixedCirclePreparation | null,
  dependencies: MechanicalDependencies,
): SliceMechanicsPreparation {
  const common = {
    contract: "geostruct-slice-mechanics/1" as const,
    stage: "mechanical-inputs-only" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    geometryContract: geometry?.contract ?? null,
    geometryProfile: geometry ? { ...geometry.profile } : null,
  };
  try {
    if (!preparation.snapshot)
      fail(
        "input-unavailable",
        "A entrada do caso está indisponível para a consolidação mecânica.",
      );
    if (!geometry || geometry.status !== "prepared")
      fail(
        "geometry-unavailable",
        "Prepare uma geometria válida antes da entrada mecânica.",
      );
    if (geometry.contract !== "geostruct-fixed-geometry/2")
      fail(
        "geometry-contract",
        "A versão da geometria não é compatível com a entrada mecânica.",
      );
    if (geometry.inputRevision !== preparation.snapshot.revision)
      fail(
        "stale-geometry",
        "A geometria pertence a outra revisão. Prepare novamente as fatias.",
      );
    if (preparation.diagnostics.some((d) => d.level === "error"))
      fail(
        "input-error",
        "Corrija os erros de cadastro antes de consolidar a entrada mecânica.",
      );
    const input = preparation.snapshot.input;
    const direction = input.analysis.direction;
    if (direction !== "left-to-right" && direction !== "right-to-left")
      fail(
        "mechanics-direction-missing",
        "Defina o sentido de movimento no caso para orientar a entrada mecânica. As preparações independentes continuam disponíveis.",
      );
    const sign = direction === "left-to-right" ? 1 : -1;
    const { weights, pressures, loads } = dependencies;
    if (!weights || weights.status !== "prepared")
      fail(
        "mechanics-weights-unavailable",
        "Complete a preparação dos pesos antes da entrada mecânica. Consulte os diagnósticos dos pesos.",
      );
    if (!pressures || pressures.status !== "prepared")
      fail(
        "mechanics-pressures-unavailable",
        "Complete a preparação das pressões físicas antes da entrada mecânica, inclusive no modo de tensões totais. Consulte os diagnósticos das pressões.",
      );
    if (!loads || loads.status !== "prepared")
      fail(
        "mechanics-loads-unavailable",
        "Complete a preparação das sobrecargas antes da entrada mecânica. Consulte os diagnósticos das sobrecargas.",
      );
    const stages = [
      { value: weights, contract: "geostruct-slice-weights/1" },
      { value: pressures, contract: "geostruct-slice-pressures/1" },
      { value: loads, contract: "geostruct-slice-loads/1" },
    ];
    for (const { value, contract } of stages) {
      if (
        value.contract !== contract ||
        value.geometryContract !== geometry.contract
      )
        fail(
          "mechanics-dependency-contract",
          "Uma preparação tem contrato incompatível com a entrada mecânica.",
        );
      if (value.inputRevision !== preparation.snapshot.revision)
        fail(
          "mechanics-stale-dependency",
          "Pesos, pressões e sobrecargas precisam pertencer à mesma revisão das entradas.",
        );
      if (
        value.geometryProfile?.toleranceM !== geometry.profile.toleranceM ||
        value.geometryProfile?.maxArcDegrees !== geometry.profile.maxArcDegrees
      )
        fail(
          "mechanics-profile-mismatch",
          "As preparações usam perfis geométricos diferentes. Prepare novamente as fatias.",
        );
    }
    if (loads.loads.direction !== direction)
      fail(
        "mechanics-load-direction",
        "As sobrecargas estão orientadas para outro sentido de movimento.",
      );
    const { slices: geometricSlices, circle } = geometry.geometry;
    if (
      !geometricSlices.length ||
      !Number.isFinite(circle.radius) ||
      circle.radius <= 0
    )
      fail(
        "mechanics-geometry-invalid",
        "O círculo ou as fatias são inválidos para a entrada mecânica.",
      );
    const numbers = new Set(geometricSlices.map((s) => s.number));
    if (
      numbers.size !== geometricSlices.length ||
      [...numbers].some((n) => !Number.isInteger(n) || n < 1)
    )
      fail(
        "mechanics-geometry-invalid",
        "A numeração da geometria não identifica as fatias de forma inequívoca.",
      );
    const byWeight = indexed(weights.weights.slices, numbers, "pesos");
    const byPressure = indexed(pressures.pressures.slices, numbers, "pressões");
    const byLoad = indexed(loads.loads.slices, numbers, "sobrecargas");
    const materials = new Map(input.materials.map((m) => [m.id, m]));
    if (materials.size !== input.materials.length)
      fail(
        "mechanics-material-duplicate",
        "Há IDs de material repetidos na entrada.",
      );
    const local = (p: PointXZ): PointXZ => ({
      x: product(sign, finite(p.x - circle.x)),
      z: finite(p.z - circle.z),
    });
    const ordered =
      sign === 1 ? [...geometricSlices] : [...geometricSlices].reverse();
    const modes = new Set<"effective" | "total">();
    const slices: MechanicalSlice[] = ordered.map((s, i) => {
      const details = { sliceNumber: s.number, materialId: s.baseMaterialId };
      const w = byWeight.get(s.number)!;
      const p = byPressure.get(s.number)!;
      const q = byLoad.get(s.number)!;
      const material = materials.get(s.baseMaterialId);
      if (!material)
        fail(
          "mechanics-base-material-missing",
          `O material da base da fatia ${s.number} não está na entrada.`,
          details,
        );
      if (
        material.cohesion === null ||
        material.frictionDegrees === null ||
        material.parameterMode === null
      )
        fail(
          "mechanics-strength-missing",
          `Complete c, φ e o modo de resistência do material “${material.name}”, na base da fatia ${s.number}. Nulo não significa zero.`,
          details,
        );
      const { cohesion, frictionDegrees, parameterMode } = material;
      if (
        !Number.isFinite(cohesion) ||
        cohesion < 0 ||
        !Number.isFinite(frictionDegrees) ||
        frictionDegrees < 0 ||
        frictionDegrees >= 90 ||
        (parameterMode !== "effective" && parameterMode !== "total")
      )
        fail(
          "mechanics-strength-invalid",
          `O material “${material.name}” exige c ≥ 0, 0 ≤ φ < 90° e modo efetivo ou total.`,
          details,
        );
      modes.add(parameterMode);
      if (
        ![
          s.left.x,
          s.right.x,
          s.left.baseZ,
          s.right.baseZ,
          s.chordLengthM,
          s.chordAngleRadians,
          s.widthM,
        ].every(Number.isFinite) ||
        s.widthM <= 0 ||
        s.chordLengthM <= 0 ||
        s.left.x >= s.right.x ||
        Math.abs(s.chordAngleRadians) >= Math.PI / 2
      )
        fail(
          "mechanics-geometry-invalid",
          `A base da fatia ${s.number} tem grandezas inválidas.`,
          details,
        );
      if (
        w.areaM2 !== s.areaM2 ||
        p.basePoint.x !== s.arcMidpoint.x ||
        p.basePoint.z !== s.arcMidpoint.z
      )
        fail(
          "mechanics-discretization-mismatch",
          `A área ou o ponto de pressão da fatia ${s.number} não corresponde à geometria.`,
          details,
        );
      if (w.weightKNPerM <= 0)
        fail(
          "mechanics-weight-invalid",
          `A fatia ${s.number} precisa de peso próprio positivo.`,
          details,
        );
      const alphaRadians = finite(-sign * s.chordAngleRadians);
      const sinAlpha = finite(Math.sin(alphaRadians));
      const cosAlpha = finite(Math.cos(alphaRadians));
      const frictionRadians = product(frictionDegrees, Math.PI / 180);
      const u = nonnegative(p.pressureKPa);
      const usedPressureKPa = parameterMode === "effective" ? u : 0;
      const start = sign === 1 ? s.left : s.right;
      const end = sign === 1 ? s.right : s.left;
      if (q.momentDrivingKNmPerM === null)
        fail(
          "mechanics-load-direction",
          `Falta o momento orientado das sobrecargas na fatia ${s.number}.`,
          details,
        );
      const contributions = q.contributions.map((c) => {
        if (
          c.leftX < s.left.x ||
          c.rightX > s.right.x ||
          c.leftX >= c.rightX ||
          c.armDrivingM === null ||
          c.momentDrivingKNmPerM === null
        )
          fail(
            "mechanics-load-mismatch",
            `Há contribuição de sobrecarga incompatível com a fatia ${s.number}.`,
            details,
          );
        finite(c.armDrivingM);
        finite(c.momentDrivingKNmPerM);
        nonnegative(c.forceKNPerM);
        return { ...c, localApplicationPoint: local(c.applicationPoint) };
      });
      return {
        number: s.number,
        order: i + 1,
        original: {
          leftX: s.left.x,
          rightX: s.right.x,
          basePoint: s.arcMidpoint,
        },
        local: {
          entry: local({ x: start.x, z: start.baseZ }),
          exit: local({ x: end.x, z: end.baseZ }),
          basePoint: local(s.arcMidpoint),
        },
        widthM: s.widthM,
        baseLengthM: s.chordLengthM,
        alphaRadians,
        sinAlpha,
        cosAlpha,
        weightArmM: product(circle.radius, sinAlpha),
        baseMaterial: {
          id: material.id,
          name: material.name,
          source: material.source,
          mode: parameterMode,
          cohesionKPa: cohesion,
          frictionDegrees,
          frictionRadians,
          tanPhi: finite(Math.tan(frictionRadians)),
        },
        weight: w,
        water: {
          prescribed: p,
          usedPressureKPa,
          physicalBaseResultantKNPerM: product(u, s.chordLengthM),
          usedBaseResultantKNPerM: product(usedPressureKPa, s.chordLengthM),
        },
        surcharge: {
          forceKNPerM: nonnegative(q.forceKNPerM),
          momentDrivingKNmPerM: finite(q.momentDrivingKNmPerM),
          contributions,
        },
        downwardForceKNPerM: finite(
          nonnegative(w.weightKNPerM) + nonnegative(q.forceKNPerM),
        ),
      };
    });
    return freeze(
      structuredClone({
        ...common,
        status: "prepared" as const,
        mechanics: {
          origin: input.origin,
          frame: {
            origin: { x: finite(circle.x), z: finite(circle.z) },
            horizontal: "movement" as const,
            up: "+Z" as const,
            horizontalSign: sign,
            direction,
          },
          approximation: {
            base: "chord" as const,
            pressure: "constant-at-arc-midpoint" as const,
            weightArm: "radius-sin-alpha" as const,
          },
          units: {
            length: "m" as const,
            stress: "kPa" as const,
            force: "kN/m" as const,
            moment: "kN·m/m" as const,
            angle: "rad" as const,
          },
          resistanceModes: [...modes].sort(),
          water: input.water,
          loadDefinitions: input.loads,
          slices,
          totalWeightKNPerM: nonnegative(weights.weights.totalWeightKNPerM),
          totalSurchargeKNPerM: nonnegative(loads.loads.forceKNPerM),
          totalDownwardForceKNPerM: finite(
            weights.weights.totalWeightKNPerM + loads.loads.forceKNPerM,
          ),
        },
        diagnostics: [] as [],
      }),
    );
  } catch (error) {
    if (!(error instanceof MechanicsError)) throw error;
    return freeze({
      ...common,
      status: "blocked" as const,
      mechanics: null,
      diagnostics: [error.diagnostic],
    });
  }
}
