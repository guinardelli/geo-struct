import type { Circle } from "./circle-geometry";
import type { CoreInput, Immutable } from "./input";
import { freeze } from "./immutable";

export const SEARCH_AXES = ["x", "z", "radius"] as const;
export const MAX_SEARCH_CANDIDATES = 10_000;
export type SearchAxis = (typeof SEARCH_AXES)[number];
export type SearchBounds = Extract<
  CoreInput["surface"],
  { mode: "search" }
>["axes"];
export type SearchGrid = Immutable<{
  axes: Record<
    SearchAxis,
    { min: number; max: number; step: number | null; values: number[] }
  >;
  total: number;
}>;
export type SearchLocation = Immutable<{
  number: number;
  indices: Record<SearchAxis, number>;
  circle: Circle;
}>;
type GridFailure = {
  status: "blocked";
  code: "invalid-axis" | "invalid-tolerance" | "grid-limit" | "grid-resolution";
  message: string;
};
type GridResult = { status: "ready"; grid: SearchGrid } | GridFailure;
const axisNames = { x: "Centro X", z: "Centro Z", radius: "Raio" };

function sampleAxis(
  axis: SearchBounds[SearchAxis],
  key: SearchAxis,
  toleranceM: number,
) {
  const { min, max, step } = axis;
  const name = axisNames[key];
  if (
    min === null ||
    max === null ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(max - min) ||
    max < min ||
    (key === "radius" && min <= 0) ||
    (step !== null && (!Number.isFinite(step) || step <= 0))
  )
    return {
      status: "blocked",
      code: "invalid-axis",
      message: `${name}: confira os limites e o passo do caso aplicado.`,
    } as const;
  const values = [min === 0 ? 0 : min];
  if (min !== max) {
    if (step === null)
      return {
        status: "blocked",
        code: "invalid-axis",
        message: `${name}: informe o passo no caso aplicado.`,
      } as const;
    if (toleranceM >= step / 2)
      return {
        status: "blocked",
        code: "invalid-tolerance",
        message: `${name}: a tolerância geométrica deve ser menor que metade do passo.`,
      } as const;
    // Usar o índice evita acumular o erro de somar o passo repetidamente.
    for (let index = 1; index <= MAX_SEARCH_CANDIDATES; index++) {
      const value = min + index * step;
      const atMax = Math.abs(value - max) <= toleranceM;
      if (!atMax && value > max) break;
      const point = atMax ? max : value;
      if (point <= values[values.length - 1])
        return {
          status: "blocked",
          code: "grid-resolution",
          message: `${name}: os pontos da malha não são distinguíveis. Aumente o passo ou revise as coordenadas.`,
        } as const;
      if (index === MAX_SEARCH_CANDIDATES)
        return {
          status: "blocked",
          code: "grid-limit",
          message: `${name}: este eixo sozinho excede o limite de 10.000 círculos. Reduza o intervalo ou aumente o passo.`,
        } as const;
      values.push(point === 0 ? 0 : point);
      if (atMax) break;
    }
  }
  return { status: "ready", axis: { min, max, step, values } } as const;
}

/** Valida os três eixos e a capacidade antes de enumerar qualquer círculo. */
export function prepareSearchGrid(
  bounds: SearchBounds,
  toleranceM: number,
): GridResult {
  if (!Number.isFinite(toleranceM) || toleranceM <= 0)
    return {
      status: "blocked",
      code: "invalid-tolerance",
      message: "Informe uma tolerância geométrica finita e positiva.",
    };
  const x = sampleAxis(bounds.x, "x", toleranceM);
  if (x.status === "blocked") return x;
  const z = sampleAxis(bounds.z, "z", toleranceM);
  if (z.status === "blocked") return z;
  const radius = sampleAxis(bounds.radius, "radius", toleranceM);
  if (radius.status === "blocked") return radius;
  const axes = { x: x.axis, z: z.axis, radius: radius.axis };
  const total =
    x.axis.values.length * z.axis.values.length * radius.axis.values.length;
  if (total > MAX_SEARCH_CANDIDATES)
    return {
      status: "blocked",
      code: "grid-limit",
      message: `A malha de ${total.toLocaleString("pt-BR")} círculos excede o limite de 10.000. Reduza os intervalos ou aumente os passos.`,
    };
  return { status: "ready", grid: freeze({ axes, total }) };
}

export function searchLocation(
  grid: SearchGrid,
  number: number,
): SearchLocation {
  if (!Number.isInteger(number) || number < 1 || number > grid.total)
    throw new RangeError("Número de círculo fora da malha.");
  const { x, z, radius } = grid.axes;
  const index = number - 1;
  const plane = z.values.length * radius.values.length;
  const indices = {
    x: Math.floor(index / plane),
    z: Math.floor((index % plane) / radius.values.length),
    radius: index % radius.values.length,
  };
  return {
    number,
    indices,
    circle: {
      x: x.values[indices.x],
      z: z.values[indices.z],
      radius: radius.values[indices.radius],
    },
  };
}
