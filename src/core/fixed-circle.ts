import type { Immutable, InputPreparation, PointXZ } from "./input";
import { freeze } from "./immutable";
import {
  partitionMaterialAreas,
  type SliceMaterialAreas,
} from "./material-areas";
import {
  arcAngle,
  circularSegmentArea,
  fail,
  GeometryError,
  lowerArc,
  pointInRegion,
  sameSupportingLine,
  segmentCircleIntersections,
  terrainElevation,
  type Circle,
  type GeometryDiagnostic,
} from "./circle-geometry";

export const MAX_PREVIEW_SLICES = 2000;
export type GeometryProfile = { toleranceM: number; maxArcDegrees: number };
export function isGeometryProfileValid(profile: GeometryProfile): boolean {
  return (
    Number.isFinite(profile.toleranceM) &&
    profile.toleranceM > 0 &&
    Number.isFinite(profile.maxArcDegrees) &&
    profile.maxArcDegrees > 0 &&
    profile.maxArcDegrees <= 3
  );
}
export type CutReason = {
  kind:
    | "terrain-intersection"
    | "terrain-vertex"
    | "material-interface"
    | "water-node"
    | "water-intersection"
    | "load-boundary"
    | "refinement";
  sourceId?: string;
  index?: number;
};
export type CircleIntersection = {
  point: PointXZ;
  segments: number[];
  kind: "unclassified" | "transverse" | "contact";
};
export type SliceCut = { x: number; baseZ: number; reasons: CutReason[] };
export type GeometricSlice = SliceMaterialAreas & {
  number: number;
  left: { x: number; topZ: number; baseZ: number };
  right: { x: number; topZ: number; baseZ: number };
  widthM: number;
  centralAngleRadians: number;
  chordAngleRadians: number;
  arcLengthM: number;
  chordLengthM: number;
  arcMidpoint: PointXZ;
  baseMaterialId: string;
  areaM2: number;
};
export type FixedCircleGeometry = Immutable<{
  circle: Circle;
  cuts: SliceCut[];
  slices: GeometricSlice[];
  areaM2: number;
  materialAreas: SliceMaterialAreas["materialAreas"];
  areaBalance: SliceMaterialAreas["areaBalance"];
}>;
export type FixedCirclePreparation = Immutable<
  {
    contract: "geostruct-fixed-geometry/2";
    stage: "geometry-only";
    inputRevision: string | null;
    profile: GeometryProfile;
    intersections: CircleIntersection[];
  } & (
    | { status: "prepared"; geometry: FixedCircleGeometry; diagnostics: [] }
    | { status: "blocked"; geometry: null; diagnostics: GeometryDiagnostic[] }
  )
>;

/** Geometria apenas. Não aplica parâmetros resistentes, pressão, peso ou FS. */
export function prepareFixedCircleGeometry(
  preparation: InputPreparation,
  profile: GeometryProfile,
): FixedCirclePreparation {
  const intersections: CircleIntersection[] = [];
  const common = {
    contract: "geostruct-fixed-geometry/2" as const,
    stage: "geometry-only" as const,
    inputRevision: preparation.snapshot?.revision ?? null,
    profile: { ...profile },
    intersections,
  };
  try {
    const eps = profile.toleranceM;
    if (!isGeometryProfileValid(profile))
      fail(
        "invalid-profile",
        "Informe tolerância geométrica positiva e abertura angular maior que zero e de até 3°.",
      );
    if (!preparation.snapshot)
      fail(
        "input-unavailable",
        "A entrada do caso está indisponível. Confira o cadastro.",
      );
    const error = preparation.diagnostics.find((d) => d.level === "error");
    if (error) fail("model-error", error.message);
    const input = preparation.snapshot.input;
    const surface = input.surface;
    if (surface.mode !== "fixed")
      fail(
        "fixed-circle-required",
        "Escolha um círculo fixo para preparar as fatias.",
      );
    const candidate = surface.circle;
    if (
      candidate.x === null ||
      candidate.z === null ||
      candidate.radius === null ||
      ![candidate.x, candidate.z, candidate.radius].every(Number.isFinite) ||
      candidate.radius <= 0
    )
      fail(
        "circle-incomplete",
        "Complete o centro X/Z e o raio positivo do círculo fixo.",
      );
    const c: Circle = {
      x: candidate.x,
      z: candidate.z,
      radius: candidate.radius,
    };
    if (eps >= c.radius)
      fail(
        "insufficient-resolution",
        "A tolerância precisa ser menor que o raio para distinguir a geometria.",
      );
    if (
      input.water.mode === "unspecified" ||
      input.loads.condition === "unspecified" ||
      (input.loads.condition === "loads" && !input.loads.items.length)
    )
      fail(
        "conditions-pending",
        "Defina água e sobrecargas para identificar todos os cortes obrigatórios.",
      );
    const terrain = input.geometry.terrain;
    if (
      terrain.length < 2 ||
      terrain.some(
        (p, i) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.z) ||
          (i > 0 && p.x < terrain[i - 1].x),
      )
    )
      fail(
        "invalid-terrain",
        "O terreno precisa ter X não decrescente e coordenadas finitas.",
      );
    // Reaproveita raízes de arestas iguais, inclusive orientadas em sentidos opostos.
    const cache = new Map<string, PointXZ[]>();
    const lineRoots = new Map<
      string,
      { a: PointXZ; b: PointXZ; points: PointXZ[] }[]
    >();
    const roots = (a: PointXZ, b: PointXZ) => {
      const ordered =
        a.x < b.x || (a.x === b.x && a.z <= b.z) ? [a, b] : [b, a];
      const key = JSON.stringify(ordered);
      let found = cache.get(key);
      if (!found) {
        found = segmentCircleIntersections(c, a, b, eps);
        // A mesma interface pode ter subdivisões distintas em regiões vizinhas.
        // Só reutiliza a raiz quando a reta coincide, nunca por proximidade isolada.
        const slope = (b.z - a.z) / (b.x - a.x);
        const lineKey =
          a.x === b.x
            ? `vertical:${a.x}`
            : JSON.stringify([slope, a.z - c.z - slope * (a.x - c.x)]);
        const candidates = lineRoots.get(lineKey) ?? [];
        let shared = candidates.find((item) =>
          sameSupportingLine(item.a, item.b, a, b),
        );
        if (!shared) {
          shared = { a, b, points: [] };
          candidates.push(shared);
          lineRoots.set(lineKey, candidates);
        }
        found = found.map((point) => {
          const canonical = shared!.points.find(
            (other) => Math.hypot(other.x - point.x, other.z - point.z) <= eps,
          );
          if (canonical) return canonical;
          shared!.points.push(point);
          return point;
        });
        if (new Set(found).size !== found.length)
          fail(
            "unresolved-contact",
            "Duas raízes da mesma interface não podem ser distinguidas com a tolerância informada.",
          );
        cache.set(key, found);
      }
      return found;
    };
    for (let i = 0; i < terrain.length - 1; i++) {
      for (const point of roots(terrain[i], terrain[i + 1])) {
        const existing = intersections.find(
          (hit) => hit.point.x === point.x && hit.point.z === point.z,
        );
        if (existing) existing.segments.push(i);
        else
          intersections.push({
            point: { ...point },
            segments: [i],
            kind: "unclassified",
          });
      }
    }
    intersections.sort((a, b) => a.point.x - b.point.x);
    if (!intersections.length)
      fail(
        "no-intersections",
        "O arco inferior não cruza o terreno. Confira centro e raio.",
      );
    for (let i = 1; i < intersections.length; i++)
      if (intersections[i].point.x - intersections[i - 1].point.x <= eps)
        fail(
          "intersections-close",
          "Há encontros distintos próximos demais para a tolerância informada.",
        );
    const domainLeft = Math.max(terrain[0].x, c.x - c.radius);
    const domainRight = Math.min(terrain.at(-1)!.x, c.x + c.radius);
    const events = [
      ...new Set([
        domainLeft,
        domainRight,
        ...terrain.map((p) => p.x),
        ...intersections.map((h) => h.point.x),
      ]),
    ]
      .filter((x) => x >= domainLeft && x <= domainRight)
      .sort((a, b) => a - b);
    const signs: [number, number][] = [];
    for (const hit of intersections) {
      const x = hit.point.x;
      if (x - domainLeft <= eps || domainRight - x <= eps)
        fail(
          "truncated-domain",
          "O encontro está no limite da seção ou do domínio do arco. Amplie o domínio ou reveja o círculo.",
        );
      const index = events.indexOf(x);
      const left = (events[index - 1] + x) / 2,
        right = (events[index + 1] + x) / 2;
      const gaps = [left, right].map(
        (sample) =>
          terrainElevation(terrain, sample, "right") - lowerArc(c, sample).z,
      );
      if (gaps.some((gap) => !Number.isFinite(gap) || Math.abs(gap) <= eps))
        fail(
          "unresolved-contact",
          "Não foi possível distinguir os lados de um encontro com a tolerância informada.",
        );
      if (gaps[0] * gaps[1] > 0) {
        hit.kind = "contact";
        fail(
          "terrain-contact",
          "Há tangência ou contato sem cruzamento do terreno. Não há delimitação transversal nesse ponto.",
        );
      }
      hit.kind = "transverse";
      signs.push([Math.sign(gaps[0]), Math.sign(gaps[1])]);
    }
    if (intersections.length !== 2)
      fail(
        "intersection-count",
        `Foram encontrados ${intersections.length} cruzamentos. Esta etapa exige exatamente dois, sem escolher um par automaticamente.`,
      );
    if (
      signs[0][0] !== -1 ||
      signs[0][1] !== 1 ||
      signs[1][0] !== 1 ||
      signs[1][1] !== -1
    )
      fail(
        "no-continuous-area",
        "O terreno não delimita uma área contínua acima do arco entre os encontros.",
      );
    const leftX = intersections[0].point.x,
      rightX = intersections[1].point.x;
    if (
      lowerArc(c, Math.max(leftX, Math.min(c.x, rightX))).z -
        input.geometry.baseZ <=
      eps
    )
      fail(
        "base-contact",
        "O arco toca ou ultrapassa a base da seção. A superfície não será recortada.",
      );
    const cuts = new Map<number, CutReason[]>();
    const add = (x: number, reason: CutReason) => {
      if (x < leftX || x > rightX) return;
      const reasons = cuts.get(x) ?? [];
      reasons.push(reason);
      cuts.set(x, reasons);
    };
    add(leftX, { kind: "terrain-intersection", index: 0 });
    add(rightX, { kind: "terrain-intersection", index: 1 });
    terrain.forEach((p, index) => add(p.x, { kind: "terrain-vertex", index }));
    for (const region of input.geometry.regions)
      for (let i = 0; i < region.points.length; i++)
        for (const p of roots(
          region.points[i],
          region.points[(i + 1) % region.points.length],
        ))
          add(p.x, {
            kind: "material-interface",
            sourceId: region.id,
            index: i,
          });
    if (input.water.mode === "piezometric") {
      const line = input.water.line;
      if (!line || line.length < 2)
        fail(
          "water-line-missing",
          "Informe a linha piezométrica para identificar seus cortes.",
        );
      if (line[0].x > leftX + eps || line.at(-1)!.x < rightX - eps)
        fail(
          "water-coverage",
          "A linha piezométrica não cobre o intervalo do círculo preparado.",
        );
      line.forEach((p, index) => add(p.x, { kind: "water-node", index }));
      for (let i = 0; i < line.length - 1; i++)
        for (const p of roots(line[i], line[i + 1]))
          add(p.x, { kind: "water-intersection", index: i });
    }
    for (const load of input.loads.items) {
      add(load.x1, { kind: "load-boundary", sourceId: load.id, index: 0 });
      add(load.x2, { kind: "load-boundary", sourceId: load.id, index: 1 });
    }
    const mandatory = [...cuts.keys()].sort((a, b) => a - b);
    const maxAngle = (profile.maxArcDegrees * Math.PI) / 180;
    let count = 0;
    const divisions = mandatory.slice(1).map((x, i) => {
      if (x - mandatory[i] <= eps)
        fail(
          "cuts-too-close",
          "Há cortes obrigatórios distintos próximos demais. Confira a geometria ou a tolerância; nenhum corte foi eliminado.",
        );
      const n = Math.ceil(
        (arcAngle(c, x) - arcAngle(c, mandatory[i])) / maxAngle,
      );
      if (n < 1)
        fail(
          "angular-resolution",
          "Dois cortes distintos não podem ser separados na precisão angular disponível.",
        );
      count += n;
      if (!Number.isFinite(count) || count > MAX_PREVIEW_SLICES)
        fail(
          "capacity-exceeded",
          `A prévia excederia o limite operacional de ${MAX_PREVIEW_SLICES} fatias. Nenhuma fatia foi truncada.`,
        );
      return n;
    });
    for (let i = 0; i < divisions.length; i++) {
      const start = arcAngle(c, mandatory[i]),
        end = arcAngle(c, mandatory[i + 1]);
      for (let j = 1; j < divisions[i]; j++)
        add(
          c.x + c.radius * Math.sin(start + ((end - start) * j) / divisions[i]),
          { kind: "refinement" },
        );
    }
    const cutList = [...cuts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([x, reasons]) => ({ x, baseZ: lowerArc(c, x).z, reasons }));
    if (cutList.length !== count + 1)
      fail(
        "angular-resolution",
        "O refinamento gerou coordenadas indistinguíveis. Reveja o perfil geométrico.",
      );
    const slices: Omit<GeometricSlice, keyof SliceMaterialAreas>[] = [];
    let area = 0,
      compensation = 0;
    for (let i = 0; i < cutList.length - 1; i++) {
      const l = cutList[i],
        r = cutList[i + 1],
        widthM = r.x - l.x;
      if (widthM <= eps)
        fail(
          "slice-too-narrow",
          "O refinamento produziu uma fatia mais estreita que a resolução informada. Reveja o perfil; nenhuma fatia foi descartada.",
        );
      const left = {
        x: l.x,
        baseZ: l.baseZ,
        topZ: terrainElevation(terrain, l.x, "right"),
      };
      const right = {
        x: r.x,
        baseZ: r.baseZ,
        topZ: terrainElevation(terrain, r.x, "left"),
      };
      if (left.topZ < left.baseZ - eps || right.topZ < right.baseZ - eps)
        fail(
          "negative-height",
          "Uma fatia atravessa o terreno. A superfície não será corrigida automaticamente.",
        );
      const start = arcAngle(c, l.x),
        end = arcAngle(c, r.x),
        angle = end - start;
      const middle = (start + end) / 2;
      const arcMidpoint = {
        x: c.x + c.radius * Math.sin(middle),
        z: c.z - c.radius * Math.cos(middle),
      };
      const regions = input.geometry.regions.filter((region) => {
        const location = pointInRegion(arcMidpoint, region.points, eps);
        if (location === "boundary")
          fail(
            "base-on-interface",
            `A base da fatia ${i + 1} é indistinguível de uma interface de ${region.name}. Reveja a tolerância ou a geometria.`,
          );
        return location === "inside";
      });
      if (regions.length > 1)
        fail(
          "ambiguous-material",
          `Há mais de uma região na base da fatia ${i + 1}.`,
        );
      const baseMaterialId = regions.length
        ? regions[0].materialId
        : input.geometry.backgroundMaterialId;
      if (baseMaterialId === null)
        fail(
          "base-material-missing",
          `Atribua o material da base da fatia ${i + 1}.`,
        );
      const areaM2 =
        (widthM *
          (Math.max(0, left.topZ - left.baseZ) +
            Math.max(0, right.topZ - right.baseZ))) /
          2 +
        circularSegmentArea(c.radius, angle);
      if (!Number.isFinite(areaM2) || areaM2 <= 0)
        fail("invalid-area", "Uma fatia tem área nula ou não finita.");
      const increment = areaM2 - compensation,
        sum = area + increment;
      compensation = sum - area - increment;
      area = sum;
      slices.push({
        number: i + 1,
        left,
        right,
        widthM,
        centralAngleRadians: angle,
        chordAngleRadians: Math.atan2(right.baseZ - left.baseZ, widthM),
        arcLengthM: c.radius * angle,
        chordLengthM: Math.hypot(widthM, right.baseZ - left.baseZ),
        arcMidpoint,
        baseMaterialId,
        areaM2,
      });
    }
    const parts = partitionMaterialAreas(input.geometry, c, slices, eps);
    return freeze({
      ...common,
      status: "prepared" as const,
      geometry: {
        circle: c,
        cuts: cutList,
        slices: slices.map((s, i) => ({ ...s, ...parts.slices[i] })),
        areaM2: area,
        materialAreas: parts.materialAreas,
        areaBalance: parts.areaBalance,
      },
      diagnostics: [] as [],
    });
  } catch (error) {
    if (!(error instanceof GeometryError)) throw error;
    return freeze({
      ...common,
      status: "blocked" as const,
      geometry: null,
      diagnostics: [error.diagnostic],
    });
  }
}
