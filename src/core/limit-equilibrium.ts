import type { InputPreparation } from "./input";
import type {
  MechanicalSlice,
  SliceMechanicsPreparation,
} from "./slice-mechanics";

export type EquilibriumProfile = {
  drivingThresholdKNPerM: number;
  tensionToleranceKPa: number;
};
export function isEquilibriumProfileValid(
  profile: EquilibriumProfile,
): boolean {
  return [profile.drivingThresholdKNPerM, profile.tensionToleranceKPa].every(
    (n) => Number.isFinite(n) && n >= 0,
  );
}
export type EquilibriumDiagnostic = {
  code: string;
  level: "error" | "warning";
  message: string;
  sliceNumber?: number;
  iteration?: number;
  value?: number;
  threshold?: number;
};

export class EvaluationError extends Error {
  constructor(readonly diagnostic: EquilibriumDiagnostic) {
    super(diagnostic.message);
  }
}
export function fail(
  code: string,
  message: string,
  details: Partial<EquilibriumDiagnostic> = {},
): never {
  throw new EvaluationError({ ...details, code, level: "error", message });
}
export function finite(
  value: number,
  label: string,
  sliceNumber?: number,
): number {
  if (!Number.isFinite(value))
    fail("numerical-error", `Valor não finito em ${label}.`, { sliceNumber });
  return value === 0 ? 0 : value;
}
export function multiply(
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
export function divide(
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
export function sum(values: readonly number[], label: string): number {
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
export function close(a: number, b: number): boolean {
  return (
    Math.abs(a - b) <=
    64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE)
  );
}

/** Validação comum; não avalia a resistência ou admissibilidade de um método. */
export function validateEquilibrium(
  preparation: InputPreparation,
  mechanics: SliceMechanicsPreparation | null,
  profile: EquilibriumProfile,
  method: "fellenius" | "bishop",
) {
  const name = method === "fellenius" ? "Fellenius" : "Bishop Simplificado";
  if (!isEquilibriumProfileValid(profile))
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
      `Corrija as entradas do caso antes de calcular ${name}.`,
    );
  const input = preparation.snapshot.input;
  if (
    input.surface.mode !== "fixed" ||
    !input.analysis.methods.includes(method)
  )
    fail(
      "method-unavailable",
      `Selecione ${name} e círculo fixo no caso aplicado.`,
    );
  if (!mechanics || mechanics.status !== "prepared")
    fail(
      "mechanics-unavailable",
      `Prepare uma entrada mecânica válida antes de calcular ${name}.`,
    );
  if (
    mechanics.contract !== "geostruct-slice-mechanics/1" ||
    mechanics.stage !== "mechanical-inputs-only" ||
    mechanics.geometryContract !== "geostruct-fixed-geometry/2" ||
    !mechanics.geometryProfile
  )
    fail("mechanics-contract", `Contrato mecânico incompatível com ${name}.`);
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
      `Este recorte de ${name} exige todas as bases em tensões efetivas ou todas em totais. Modo misto permanece em revisão.`,
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
      `Há face vertical no intervalo da massa. Seu tratamento mecânico permanece fora deste recorte de ${name}.`,
    );
  return { data, radius };
}

export function validateMechanicalSlice(s: MechanicalSlice, radius: number) {
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
  const physicalU = finite(s.water.prescribed.pressureKPa, "pressão física", n);
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
    fail("invalid-load", `Resultante das faixas inconsistente na fatia ${n}.`, {
      sliceNumber: n,
    });
  const vertical = finite(w + q, "W + Q", n);
  const weightDrivingKNPerM = multiply(w, sin, "W sin α", n);
  const loadDrivingKNPerM = sum(
    loadDriving.map((l) => l.valueKNPerM),
    "parcela motriz das faixas",
  );
  const drivingKNPerM = sum(
    [weightDrivingKNPerM, ...loadDriving.map((l) => l.valueKNPerM)],
    "parcela motriz da fatia",
  );
  return {
    input: s,
    n,
    w,
    q,
    u,
    c,
    t,
    b,
    length,
    sin,
    cos,
    vertical,
    loadDriving,
    weightDrivingKNPerM,
    loadDrivingKNPerM,
    drivingKNPerM,
  };
}

export function drivingBalance(
  slices: readonly ReturnType<typeof validateMechanicalSlice>[],
) {
  const drivingTerms = slices.flatMap((s) => [
    s.weightDrivingKNPerM,
    ...s.loadDriving.map((l) => l.valueKNPerM),
  ]);
  const driving = sum(drivingTerms, "denominador motriz");
  const roundoff = finite(
    32 * Number.EPSILON * sum(drivingTerms.map(Math.abs), "módulos motrizes"),
    "limite de representação",
  );
  return {
    drivingKNPerM: driving,
    drivingRoundoffBoundKNPerM: roundoff,
    weightDrivingKNPerM: sum(
      slices.map((s) => s.weightDrivingKNPerM),
      "pesos motrizes",
    ),
    loadDrivingKNPerM: sum(
      slices.flatMap((s) => s.loadDriving.map((l) => l.valueKNPerM)),
      "cargas motrizes",
    ),
  };
}
export function drivingDiagnostics(
  balance: ReturnType<typeof drivingBalance>,
  profile: EquilibriumProfile,
): EquilibriumDiagnostic[] {
  const driving = balance.drivingKNPerM,
    roundoff = balance.drivingRoundoffBoundKNPerM;
  if (driving <= profile.drivingThresholdKNPerM)
    return [
      {
        code: "invalid-driving",
        level: "error",
        message:
          "Momento motriz dividido pelo raio não supera o limiar no sentido escolhido.",
        value: driving,
        threshold: profile.drivingThresholdKNPerM,
      },
    ];
  else if (driving <= roundoff)
    return [
      {
        code: "unresolved-driving",
        level: "error",
        message:
          "O denominador motriz é indistinguível de cancelamento numérico; revise a superfície e o sentido.",
        value: driving,
        threshold: roundoff,
      },
    ];
  return [];
}
