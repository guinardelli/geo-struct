import {
  evaluateSearchCircle,
  runCircularSearch,
} from "../core/circular-search";
import type { SearchRequest, SearchResponse } from "./circular-search-messages";

const send = (message: SearchResponse) => self.postMessage(message);
self.onmessage = ({ data }: MessageEvent<SearchRequest>) => {
  try {
    if (data.type === "inspect") {
      send({
        type: "detail",
        detail: evaluateSearchCircle(
          data.preparation,
          data.profile,
          data.location,
        ),
      });
      return;
    }
    let lastUpdate = 0;
    const result = runCircularSearch(
      data.preparation,
      data.profile,
      (progress) => {
        const now = performance.now();
        if (
          progress.completed === 0 ||
          progress.completed === progress.total ||
          now - lastUpdate >= 100
        ) {
          send({ type: "progress", progress });
          lastUpdate = now;
        }
      },
    );
    send({ type: "result", result });
  } catch (error) {
    send({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Falha ao avaliar os círculos.",
    });
  }
};
