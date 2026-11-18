import { useEffect, useRef, useState } from "react";
import type { InputPreparation } from "../core/input";
import type {
  CircularSearchProfile,
  SearchCircleEvaluation,
  SearchMethod,
} from "../core/circular-search";
import type { FixedCircleGeometry } from "../core/fixed-circle";
import { methodLabel } from "../domain/analysis";
import { parseNumber } from "../domain/geometry";
import { startSearchWorker } from "../lib/circular-search-client";
import { BishopInspection, formatResultNumber as number } from "./BishopPanel";
import { FelleniusInspection } from "./FelleniusPanel";
import { MaterialAreaInspection } from "./MaterialAreaInspection";
import { SliceMechanicsInspection } from "./SliceMechanicsInspection";
import {
  describeCircle,
  searchOutcome,
  searchStageLabel,
} from "./CircularSearchResults";

export function SearchCircleInspection({
  preparation,
  profile,
  detail,
  initialMethod,
  onShow,
}: {
  preparation: InputPreparation;
  profile: CircularSearchProfile;
  detail: SearchCircleEvaluation;
  initialMethod: SearchMethod | null;
  onShow: (geometry: FixedCircleGeometry) => void;
}) {
  const [content, setContent] = useState<SearchMethod | "input">(
    initialMethod ?? "input",
  );
  const [angle, setAngle] = useState("");
  const [pending, setPending] = useState(false);
  const [refined, setRefined] = useState<{
    angle: number;
    detail: SearchCircleEvaluation;
  } | null>(null);
  const [error, setError] = useState("");
  const worker = useRef<(() => void) | null>(null);
  useEffect(() => () => worker.current?.(), []);
  const method = detail.methods.find((r) => r.method === content);
  const geometry = detail.geometry.geometry;
  const refine = () => {
    const maxArcDegrees = parseNumber(angle);
    setRefined(null);
    if (
      maxArcDegrees === null ||
      maxArcDegrees <= 0 ||
      maxArcDegrees >= profile.geometry.maxArcDegrees
    ) {
      setError("Informe uma abertura positiva menor que a usada na busca.");
      return;
    }
    setError("");
    setPending(true);
    try {
      worker.current = startSearchWorker(
        {
          type: "inspect",
          preparation,
          location: detail.location,
          profile: {
            ...profile,
            geometry: { ...profile.geometry, maxArcDegrees },
          },
        },
        (response) => {
          if (response.type === "progress") return;
          worker.current = null;
          setPending(false);
          if (response.type === "detail")
            setRefined({ angle: maxArcDegrees, detail: response.detail });
          else if (response.type === "error") setError(response.message);
        },
      );
    } catch {
      setPending(false);
      setError("Não foi possível iniciar o refinamento em segundo plano.");
    }
  };
  return (
    <div className="slice-inspection">
      <p>{describeCircle(detail.location.circle)}.</p>
      {geometry && (
        <p>
          {geometry.slices.length} fatias · abertura máxima{" "}
          {number(profile.geometry.maxArcDegrees)}° · área da massa{" "}
          {number(geometry.areaM2)} m².
        </p>
      )}
      {detail.methods.map((r) => (
        <p key={r.method}>
          {methodLabel(r.method)} · {searchOutcome(r)}.
        </p>
      ))}
      {detail.issues.length > 0 && (
        <details open={!geometry || !detail.methods.length}>
          <summary>Diagnósticos do círculo ({detail.issues.length})</summary>
          <ul aria-label="Diagnósticos do círculo">
            {detail.issues.map((issue, i) => (
              <li key={i}>
                {searchStageLabel(issue.stage)} · {issue.message}
                {issue.sliceNumber !== undefined && (
                  <> Fatia {issue.sliceNumber}.</>
                )}
                {issue.iteration !== undefined && (
                  <> Avaliação {issue.iteration}.</>
                )}
                {issue.value !== undefined && (
                  <> Valor {number(issue.value)}.</>
                )}
                {issue.threshold !== undefined && (
                  <> Limiar {number(issue.threshold)}.</>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {geometry && detail.preparations && (
        <>
          <button
            className="secondary"
            type="button"
            onClick={() => onShow(geometry)}
          >
            Mostrar fatias no desenho
          </button>
          <label className="field">
            <span>Conteúdo da inspeção</span>
            <select
              value={content}
              onChange={(e) => setContent(e.target.value as typeof content)}
            >
              <option value="input">Áreas e entrada mecânica</option>
              {detail.methods
                .filter((r) => r.calculation)
                .map((r) => (
                  <option key={r.method} value={r.method}>
                    {methodLabel(r.method)}
                  </option>
                ))}
            </select>
          </label>
          {content === "input" && (
            <>
              <MaterialAreaInspection
                geometry={geometry}
                input={preparation.snapshot!.input}
              />
              <SliceMechanicsInspection
                result={detail.preparations.mechanics}
              />
            </>
          )}
          {method?.method === "fellenius" && (
            <FelleniusInspection result={method} />
          )}
          {method?.method === "bishop" && <BishopInspection result={method} />}
          <details className="search-refinement">
            <summary>Conferir refinamento das fatias</summary>
            <p className="hint">
              Use uma abertura menor no mesmo círculo e compare os resultados da
              discretização.
            </p>
            <label className="field">
              <span>Abertura refinada (°)</span>
              <input
                inputMode="decimal"
                value={angle}
                disabled={pending}
                onChange={(e) => {
                  setAngle(e.target.value);
                  setRefined(null);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </label>
            <button
              className="secondary"
              type="button"
              onClick={refine}
              disabled={pending}
            >
              Recalcular círculo
            </button>
            {pending && <p role="status">Refinando as fatias…</p>}
            {error && <p role="alert">{error}</p>}
            {refined && (
              <section aria-label="Comparação do refinamento">
                <p>
                  Abertura de {number(profile.geometry.maxArcDegrees)}° para{" "}
                  {number(refined.angle)}°.{" "}
                  {refined.detail.geometry.geometry?.slices.length ?? 0} fatias
                  na nova avaliação.
                </p>
                {detail.methods.map((original) => {
                  const next = refined.detail.methods.find(
                    (r) => r.method === original.method,
                  );
                  return (
                    <p key={original.method}>
                      {methodLabel(original.method)} · {searchOutcome(original)}{" "}
                      → {searchOutcome(next)}.
                      {original.status === "calculated" &&
                        next?.status === "calculated" && (
                          <>
                            {" "}
                            ΔFS ={" "}
                            {number(
                              next.factorOfSafety - original.factorOfSafety,
                            )}
                            .
                          </>
                        )}
                    </p>
                  );
                })}
                {refined.detail.issues.length > 0 && (
                  <ul aria-label="Diagnósticos do refinamento">
                    {refined.detail.issues.map((issue, i) => (
                      <li key={i}>{issue.message}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </details>
        </>
      )}
    </div>
  );
}
