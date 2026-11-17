import type { Immutable, InputPreparation } from "./input";
import type { FixedCirclePreparation, GeometryProfile } from "./fixed-circle";
import { freeze } from "./immutable";

export type MaterialWeight = {
  materialId: string;
  materialName: string;
  areaM2: number;
  unitWeightKNPerM3: number;
  parameterSource: string;
  weightKNPerM: number;
  sources: { regionId: string | null; areaM2: number; weightKNPerM: number }[];
};
export type SliceWeight = {
  number: number;
  areaM2: number;
  weightKNPerM: number;
  materials: MaterialWeight[];
};
export type WeightDiagnostic = {
  code: string;
  message: string;
  materialId?: string;
  sliceNumber?: number;
};
export type SliceWeightPreparation = Immutable<
  {
    contract: "geostruct-slice-weights/1";
    stage: "self-weight-only";
    inputRevision: string | null;
    geometryContract: "geostruct-fixed-geometry/2" | null;
    geometryProfile: GeometryProfile | null;
  } & (
    | {
        status: "prepared";
        weights: {
          formula: "sum-gamma-total-area";
          direction: "-Z";
          units: { area: "m²"; unitWeight: "kN/m³"; weightPerLength: "kN/m" };
          slices: SliceWeight[];
          materials: MaterialWeight[];
          totalWeightKNPerM: number;
        };
        diagnostics: [];
      }
    | { status: "blocked"; weights: null; diagnostics: WeightDiagnostic[] }
  )
>;

class WeightError extends Error {
  constructor(readonly diagnostic: WeightDiagnostic) {
    super(diagnostic.message);
  }
}
function fail(
  code: string,
  message: string,
  details: Partial<WeightDiagnostic> = {},
): never {
  throw new WeightError({ ...details, code, message });
}
function positive(value: number, context: string): number {
  if (!Number.isFinite(value) || value <= 0)
    fail(
      "weight-numerical",
      `${context} não pôde ser representado como valor positivo finito. Nenhum peso foi substituído por zero.`,
    );
  return value;
}
class Sum {
  value = 0;
  private compensation = 0;
  add(value: number) {
    const increment = value - this.compensation;
    const next = this.value + increment;
    this.compensation = next - this.value - increment;
    this.value = positive(next, "O somatório");
  }
}
function sum(values: readonly number[]): number {
  const total = new Sum();
  values.forEach((value) => total.add(value));
  return total.value;
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Somente peso próprio total por unidade de largura. Não usa água, cargas ou resistência. */
export function prepareSliceWeights(
  preparation: InputPreparation,
  geometryPreparation: FixedCirclePreparation | null,
): SliceWeightPreparation {
  const common = {
    contract: "geostruct-slice-weights/1" as const,
    stage: "self-weight-only" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    geometryContract: geometryPreparation?.contract ?? null,
    geometryProfile: geometryPreparation
      ? { ...geometryPreparation.profile }
      : null,
  };
  const blocked = (diagnostics: WeightDiagnostic[]): SliceWeightPreparation =>
    freeze({
      ...common,
      status: "blocked" as const,
      weights: null,
      diagnostics,
    });
  try {
    if (!preparation.snapshot)
      fail(
        "input-unavailable",
        "A entrada do caso está indisponível para preparar os pesos.",
      );
    if (!geometryPreparation || geometryPreparation.status !== "prepared")
      fail(
        "geometry-unavailable",
        "Prepare uma geometria válida antes dos pesos próprios.",
      );
    if (geometryPreparation.contract !== "geostruct-fixed-geometry/2")
      fail(
        "geometry-contract",
        "A versão da geometria não é compatível com a preparação dos pesos.",
      );
    if (geometryPreparation.inputRevision !== preparation.snapshot.revision)
      fail(
        "stale-geometry",
        "As áreas pertencem a outra revisão das entradas. Prepare novamente as fatias.",
      );
    if (preparation.diagnostics.some((d) => d.level === "error"))
      fail(
        "input-error",
        "Corrija os erros de cadastro antes de preparar os pesos.",
      );
    const input = preparation.snapshot.input;
    const geometry = geometryPreparation.geometry;
    if (!geometry.slices.length)
      fail("weight-geometry-invalid", "Não há fatias para preparar os pesos.");
    const definitions = new Map(input.materials.map((m) => [m.id, m]));
    if (definitions.size !== input.materials.length)
      fail(
        "weight-material-reference",
        "Há IDs de materiais duplicados na entrada dos pesos.",
      );
    const regionMaterials = new Map(
      input.geometry.regions.map((r) => [r.id, r.materialId]),
    );
    const checked = new Set<string>();
    const diagnostics: WeightDiagnostic[] = [];
    const sliceNumbers = new Set<number>();
    for (const slice of geometry.slices) {
      if (sliceNumbers.has(slice.number) || !slice.materialAreas.length)
        fail(
          "weight-geometry-invalid",
          "Há fatia repetida ou sem composição por material.",
        );
      sliceNumbers.add(slice.number);
      positive(slice.areaM2, `A área da fatia ${slice.number}`);
      const materialIds = new Set<string>();
      for (const part of slice.materialAreas) {
        const details = {
          materialId: part.materialId,
          sliceNumber: slice.number,
        };
        if (materialIds.has(part.materialId) || !part.sources.length)
          fail(
            "weight-geometry-invalid",
            `Há material repetido ou sem origem na fatia ${slice.number}.`,
            details,
          );
        materialIds.add(part.materialId);
        positive(part.areaM2, `A subárea da fatia ${slice.number}`);
        const sourceIds = new Set<string | null>();
        for (const source of part.sources) {
          positive(source.areaM2, `A área de origem da fatia ${slice.number}`);
          const assigned =
            source.regionId === null
              ? input.geometry.backgroundMaterialId
              : regionMaterials.get(source.regionId);
          if (sourceIds.has(source.regionId) || assigned !== part.materialId)
            fail(
              "weight-area-source",
              `A origem da subárea não corresponde à atribuição de material na fatia ${slice.number}.`,
              details,
            );
          sourceIds.add(source.regionId);
        }
        const sourceArea = sum(part.sources.map((source) => source.areaM2));
        const roundoff =
          32 *
          Number.EPSILON *
          part.sources.length *
          Math.max(sourceArea, part.areaM2);
        if (Math.abs(sourceArea - part.areaM2) > roundoff)
          fail(
            "weight-area-source",
            `As áreas de origem não correspondem à subárea da fatia ${slice.number}. Nenhum resíduo foi redistribuído.`,
            details,
          );
        if (checked.has(part.materialId)) continue;
        checked.add(part.materialId);
        const material = definitions.get(part.materialId);
        if (!material)
          diagnostics.push({
            ...details,
            code: "weight-material-reference",
            message: `O material ${part.materialId} não existe na entrada dos pesos.`,
          });
        else if (material.unitWeight === null)
          diagnostics.push({
            ...details,
            code: "unit-weight-missing",
            message: `Informe o peso específico total de ${material.name} (kN/m³), presente na fatia ${slice.number}.`,
          });
        else if (
          !Number.isFinite(material.unitWeight) ||
          material.unitWeight <= 0
        )
          diagnostics.push({
            ...details,
            code: "unit-weight-invalid",
            message: `O peso específico total de ${material.name} precisa ser positivo e finito (kN/m³).`,
          });
      }
    }
    if (diagnostics.length) return blocked(diagnostics);
    const slices: SliceWeight[] = geometry.slices.map((slice) => {
      const materials = slice.materialAreas.map((part) => {
        const material = definitions.get(part.materialId)!;
        const gamma = material.unitWeight!;
        const weight = (area: number) =>
          positive(
            gamma * area,
            `O peso de ${material.name} na fatia ${slice.number}`,
          );
        return {
          materialId: material.id,
          materialName: material.name,
          areaM2: part.areaM2,
          unitWeightKNPerM3: gamma,
          parameterSource: material.source,
          weightKNPerM: weight(part.areaM2),
          sources: part.sources.map((source) => ({
            ...source,
            weightKNPerM: weight(source.areaM2),
          })),
        };
      });
      return {
        number: slice.number,
        areaM2: slice.areaM2,
        weightKNPerM: sum(materials.map((m) => m.weightKNPerM)),
        materials,
      };
    });
    const totals = new Map<
      string,
      {
        sample: MaterialWeight;
        area: Sum;
        weight: Sum;
        sources: Map<string | null, { area: Sum; weight: Sum }>;
      }
    >();
    for (const slice of slices)
      for (const part of slice.materials) {
        let total = totals.get(part.materialId);
        if (!total) {
          total = {
            sample: part,
            area: new Sum(),
            weight: new Sum(),
            sources: new Map(),
          };
          totals.set(part.materialId, total);
        }
        total.area.add(part.areaM2);
        total.weight.add(part.weightKNPerM);
        for (const source of part.sources) {
          const entry = total.sources.get(source.regionId) ?? {
            area: new Sum(),
            weight: new Sum(),
          };
          entry.area.add(source.areaM2);
          entry.weight.add(source.weightKNPerM);
          total.sources.set(source.regionId, entry);
        }
      }
    const materials: MaterialWeight[] = [...totals.entries()]
      .sort(([a], [b]) => compare(a, b))
      .map(([, total]) => ({
        ...total.sample,
        areaM2: total.area.value,
        weightKNPerM: total.weight.value,
        sources: [...total.sources.entries()]
          .sort(([a], [b]) =>
            a === null ? -1 : b === null ? 1 : compare(a, b),
          )
          .map(([regionId, source]) => ({
            regionId,
            areaM2: source.area.value,
            weightKNPerM: source.weight.value,
          })),
      }));
    return freeze({
      ...common,
      status: "prepared" as const,
      weights: {
        formula: "sum-gamma-total-area" as const,
        direction: "-Z" as const,
        units: {
          area: "m²" as const,
          unitWeight: "kN/m³" as const,
          weightPerLength: "kN/m" as const,
        },
        slices,
        materials,
        totalWeightKNPerM: sum(slices.map((slice) => slice.weightKNPerM)),
      },
      diagnostics: [] as [],
    });
  } catch (error) {
    if (!(error instanceof WeightError)) throw error;
    return blocked([error.diagnostic]);
  }
}
