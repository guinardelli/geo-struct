import type { CoreInput, Immutable, InputPreparation } from "./input";
import { freeze } from "./immutable";
import {
  isGeometryProfileValid,
  prepareFixedCircleGeometry,
  type GeometryProfile,
} from "./fixed-circle";
import {
  MAX_BISHOP_ITERATIONS,
  isBishopIterationProfileValid,
  solveBishop,
  type BishopIterationProfile,
  type BishopResult,
} from "./bishop";
import { solveFellenius, type FelleniusResult } from "./fellenius";
import {
  isEquilibriumProfileValid,
  type EquilibriumProfile,
  type EquilibriumDiagnostic,
} from "./limit-equilibrium";
import { prepareSliceWeights } from "./slice-weights";
import { prepareSlicePressures } from "./slice-pressures";
import { prepareSliceLoads } from "./slice-loads";
import { prepareSliceMechanics } from "./slice-mechanics";
import {
  prepareSearchGrid,
  searchLocation,
  SEARCH_AXES,
  type SearchAxis,
  type SearchGrid,
  type SearchLocation,
} from "./search-grid";

export type SearchMethod = CoreInput["analysis"]["methods"][number];
export type CircularSearchProfile = {
  geometry: GeometryProfile;
  equilibrium: EquilibriumProfile;
  bishop: BishopIterationProfile | null;
  nearTieTolerance: number;
};
export type SolverResult = BishopResult | FelleniusResult;
type SearchStage =
  | "geometry"
  | "weights"
  | "pressures"
  | "loads"
  | "mechanics"
  | SearchMethod;
type SearchIssue = Immutable<EquilibriumDiagnostic & { stage: SearchStage }>;
type IssueSummary = SearchIssue & { readonly occurrences: number };
type ReasonCount = {
  stage: SearchStage;
  code: string;
  level: "error" | "warning";
  message: string;
  count: number;
};
export type SearchMethodResult = Immutable<{
  method: SearchMethod;
  status: SolverResult["status"];
  factorOfSafety: number | null;
  evaluations: number | null;
  residual: number | null;
}>;
export type SearchCandidate = Immutable<{
  location: SearchLocation;
  sliceCount: number | null;
  methods: SearchMethodResult[];
  issues: IssueSummary[];
}>;
export type SearchRanking = Immutable<{
  method: SearchMethod;
  status: "minimum" | "no-surface" | "no-factor";
  minimum: {
    location: SearchLocation;
    factorOfSafety: number;
    boundaryAxes: SearchAxis[];
  } | null;
  eligible: number;
  zeroResistance: number;
  failed: number;
  ties: { number: number; difference: number }[];
}>;
export type CircularSearchResult = Immutable<
  {
    contract: "geostruct-circular-search/1";
    inputRevision: string | null;
    profile: CircularSearchProfile;
  } & (
    | { status: "blocked"; diagnostic: { code: string; message: string } }
    | {
        status: "completed";
        origin: CoreInput["origin"];
        direction: NonNullable<CoreInput["analysis"]["direction"]>;
        grid: SearchGrid;
        candidates: SearchCandidate[];
        geometricCount: number;
        rankings: SearchRanking[];
        reasons: ReasonCount[];
      }
  )
>;
export type SearchProgress = { completed: number; total: number };

type StageDiagnostic = Omit<EquilibriumDiagnostic, "level"> & {
  level?: EquilibriumDiagnostic["level"];
};
function collectIssues(
  stage: SearchStage,
  diagnostics: readonly StageDiagnostic[],
): SearchIssue[] {
  return diagnostics.map((d) => ({ ...d, stage, level: d.level ?? "error" }));
}

/** Usa as mesmas etapas do círculo fixo, com uma revisão própria do candidato. */
export function evaluateSearchCircle(
  preparation: InputPreparation,
  profile: CircularSearchProfile,
  location: SearchLocation,
) {
  if (
    !preparation.snapshot ||
    preparation.snapshot.input.surface.mode !== "search"
  )
    throw new Error("Entrada de busca circular indisponível.");
  const input: CoreInput = {
    ...preparation.snapshot.input,
    surface: { mode: "fixed", circle: location.circle },
  };
  const fixed: InputPreparation = {
    ...preparation,
    snapshot: { input, revision: JSON.stringify(input) },
  };
  const geometry = prepareFixedCircleGeometry(fixed, profile.geometry);
  const methods: SolverResult[] = [];
  const issues = collectIssues("geometry", geometry.diagnostics);
  if (geometry.status !== "prepared")
    return { location, geometry, preparations: null, methods, issues };
  const weights = prepareSliceWeights(fixed, geometry);
  const pressures = prepareSlicePressures(fixed, geometry);
  const loads = prepareSliceLoads(fixed, geometry);
  const mechanics = prepareSliceMechanics(fixed, geometry, {
    weights,
    pressures,
    loads,
  });
  issues.push(
    ...collectIssues("weights", weights.diagnostics),
    ...collectIssues("pressures", pressures.diagnostics),
    ...collectIssues("loads", loads.diagnostics),
  );
  // Quando uma dependência falha, seus diagnósticos explicam o bloqueio real.
  if (issues.length === 0)
    issues.push(...collectIssues("mechanics", mechanics.diagnostics));
  if (mechanics.status === "prepared") {
    for (const method of input.analysis.methods) {
      const result =
        method === "fellenius"
          ? solveFellenius(fixed, mechanics, profile.equilibrium)
          : solveBishop(fixed, mechanics, {
              ...profile.equilibrium,
              ...profile.bishop!,
            });
      methods.push(result);
      issues.push(...collectIssues(method, result.diagnostics));
    }
  }
  return {
    location,
    geometry,
    preparations: { weights, pressures, loads, mechanics },
    methods,
    issues,
  };
}

export type SearchCircleEvaluation = ReturnType<typeof evaluateSearchCircle>;

function reasonKey(issue: SearchIssue): string {
  return `${issue.stage}:${issue.code}:${issue.level}`;
}

function summarizeCandidate(
  evaluation: SearchCircleEvaluation,
): SearchCandidate {
  const grouped = new Map<string, IssueSummary>();
  for (const issue of evaluation.issues) {
    const key = reasonKey(issue);
    const first = grouped.get(key);
    grouped.set(
      key,
      first
        ? { ...first, occurrences: first.occurrences + 1 }
        : { ...issue, occurrences: 1 },
    );
  }
  return {
    location: evaluation.location,
    sliceCount: evaluation.geometry.geometry?.slices.length ?? null,
    methods: evaluation.methods.map((r) => ({
      method: r.method,
      status: r.status,
      factorOfSafety: r.factorOfSafety,
      evaluations: r.method === "bishop" ? r.iterations.length : null,
      residual:
        r.method === "bishop"
          ? (r.calculation?.evaluation?.residual ?? null)
          : null,
    })),
    issues: [...grouped.values()],
  };
}

export function rankSearchCandidates(
  candidates: readonly SearchCandidate[],
  grid: SearchGrid,
  method: SearchMethod,
  nearTieTolerance: number,
): SearchRanking {
  const valid: { location: SearchLocation; factorOfSafety: number }[] = [];
  let minimum: (typeof valid)[number] | null = null;
  let geometric = 0,
    zeroResistance = 0,
    failed = 0;
  for (const candidate of candidates) {
    if (candidate.sliceCount === null) continue;
    geometric++;
    const result = candidate.methods.find((r) => r.method === method);
    if (result?.status === "zero-resistance") {
      zeroResistance++;
      continue;
    }
    if (
      result?.status !== "calculated" ||
      result.factorOfSafety === null ||
      !Number.isFinite(result.factorOfSafety) ||
      result.factorOfSafety <= 0
    ) {
      failed++;
      continue;
    }
    const entry = {
      location: candidate.location,
      factorOfSafety: result.factorOfSafety,
    };
    valid.push(entry);
    if (
      !minimum ||
      entry.factorOfSafety < minimum.factorOfSafety ||
      (entry.factorOfSafety === minimum.factorOfSafety &&
        entry.location.number < minimum.location.number)
    )
      minimum = entry;
  }
  const counts = { method, eligible: valid.length, zeroResistance, failed };
  if (!minimum)
    return {
      ...counts,
      status: geometric === 0 ? "no-surface" : "no-factor",
      minimum: null,
      ties: [],
    };
  const best = minimum;
  const boundaryAxes = SEARCH_AXES.filter((key) => {
    const axis = grid.axes[key],
      index = best.location.indices[key];
    return (
      axis.min !== axis.max && (index === 0 || index === axis.values.length - 1)
    );
  });
  const ties = valid.flatMap(({ location, factorOfSafety }) => {
    const difference = factorOfSafety - best.factorOfSafety;
    return location.number !== best.location.number &&
      difference <= nearTieTolerance
      ? [{ number: location.number, difference }]
      : [];
  });
  return {
    ...counts,
    status: "minimum",
    minimum: { ...best, boundaryAxes },
    ties,
  };
}

/** Avalia a malha inteira. Cancelamento da execução fica no Worker que hospeda o núcleo. */
export function runCircularSearch(
  preparation: InputPreparation,
  profile: CircularSearchProfile,
  onProgress?: (progress: SearchProgress) => void,
): CircularSearchResult {
  const common = {
    contract: "geostruct-circular-search/1" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    profile: structuredClone(profile),
  };
  const blocked = (code: string, message: string): CircularSearchResult =>
    freeze({
      ...common,
      status: "blocked" as const,
      diagnostic: { code, message },
    });
  const input = preparation.snapshot?.input;
  const error = preparation.diagnostics.find((d) => d.level === "error");
  if (error) return blocked("model-error", error.message);
  if (
    !input ||
    input.contract !== "geostruct-input/1" ||
    input.surface.mode !== "search"
  )
    return blocked(
      "search-required",
      "Aplique um caso configurado para busca circular.",
    );
  if (!input.analysis.direction || !input.analysis.methods.length)
    return blocked(
      "missing-analysis",
      "Defina o sentido e ao menos um método no caso aplicado.",
    );
  if (
    input.water.mode === "unspecified" ||
    input.loads.condition === "unspecified" ||
    (input.loads.condition === "loads" && input.loads.items.length === 0)
  )
    return blocked(
      "conditions-pending",
      "Defina a água e as sobrecargas no caso aplicado.",
    );
  if (
    input.water.mode === "piezometric" &&
    (!input.water.line ||
      input.water.line.length < 2 ||
      input.water.unitWeight === null ||
      !Number.isFinite(input.water.unitWeight) ||
      input.water.unitWeight <= 0)
  )
    return blocked(
      "water-pending",
      "Informe a linha piezométrica e o peso específico da água.",
    );
  if (!isGeometryProfileValid(profile.geometry))
    return blocked(
      "invalid-profile",
      "Informe tolerância geométrica positiva e abertura angular maior que zero e de até 3°.",
    );
  if (!isEquilibriumProfileValid(profile.equilibrium))
    return blocked(
      "invalid-profile",
      "Informe limiar motriz e tolerância de tração finitos e não negativos.",
    );
  if (
    !Number.isFinite(profile.nearTieTolerance) ||
    profile.nearTieTolerance < 0
  )
    return blocked(
      "invalid-profile",
      "Informe uma faixa de quase empate finita e não negativa.",
    );
  if (
    input.analysis.methods.includes("bishop") &&
    (!profile.bishop || !isBishopIterationProfileValid(profile.bishop))
  )
    return blocked(
      "invalid-profile",
      `Informe F₀ e τF finitos e positivos, K inteiro de 1 a ${MAX_BISHOP_ITERATIONS} e τm finito não negativo.`,
    );
  const plan = prepareSearchGrid(
    input.surface.axes,
    profile.geometry.toleranceM,
  );
  if (plan.status === "blocked") return blocked(plan.code, plan.message);

  const { grid } = plan;
  const candidates: SearchCandidate[] = [];
  const reasons = new Map<string, ReasonCount>();
  let geometricCount = 0;
  onProgress?.({ completed: 0, total: grid.total });
  for (let number = 1; number <= grid.total; number++) {
    const location = searchLocation(grid, number);
    const candidate = summarizeCandidate(
      evaluateSearchCircle(preparation, profile, location),
    );
    candidates.push(candidate);
    if (candidate.sliceCount !== null) geometricCount++;
    for (const issue of candidate.issues) {
      const key = reasonKey(issue);
      const row = reasons.get(key);
      if (row) row.count++;
      else
        reasons.set(key, {
          stage: issue.stage,
          code: issue.code,
          level: issue.level,
          message: issue.message,
          count: 1,
        });
    }
    onProgress?.({ completed: number, total: grid.total });
  }
  return freeze({
    ...common,
    status: "completed" as const,
    origin: structuredClone(input.origin),
    direction: input.analysis.direction,
    grid,
    candidates,
    geometricCount,
    rankings: input.analysis.methods.map((method) =>
      rankSearchCandidates(candidates, grid, method, profile.nearTieTolerance),
    ),
    reasons: [...reasons.values()],
  });
}
