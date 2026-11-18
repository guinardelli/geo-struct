import type { SearchRequest, SearchResponse } from "./circular-search-messages";

/** Uma tarefa por Worker, para que cancelar também interrompa a fatia em curso. */
export function startSearchWorker(
  request: SearchRequest,
  receive: (response: SearchResponse) => void,
): () => void {
  const worker = new Worker(
    new URL("./circular-search.worker.ts", import.meta.url),
    { type: "module" },
  );
  let active = true;
  const stop = () => {
    if (!active) return;
    active = false;
    worker.terminate();
  };
  const reportError = () => {
    if (!active) return;
    stop();
    receive({
      type: "error",
      message:
        "O cálculo em segundo plano foi interrompido. Tente executar novamente.",
    });
  };
  worker.onmessage = ({ data }: MessageEvent<SearchResponse>) => {
    if (!active) return;
    if (data.type !== "progress") stop();
    receive(data);
  };
  worker.onerror = reportError;
  worker.onmessageerror = reportError;
  try {
    worker.postMessage(request);
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
