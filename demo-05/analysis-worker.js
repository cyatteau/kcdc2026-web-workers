import {
  normalizeOptions,
  createWorkingRows,
  processScenarioStep,
  finalizeAnalysis,
} from "./analysis-core.js";

const cancelled = new Set();
let activeRequestId = null;

self.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;

  if (type === "CANCEL_ANALYSIS") {
    cancelled.add(requestId);
    return;
  }

  if (type !== "ANALYZE_PARKS") return;

  if (activeRequestId && activeRequestId !== requestId) {
    cancelled.add(activeRequestId);
  }

  activeRequestId = requestId;
  analyzeInChunks(requestId, payload);
});

function analyzeInChunks(requestId, { rows, options }) {
  const normalized = normalizeOptions(options);
  const started = performance.now();
  const workingRows = createWorkingRows(rows);
  let iterations = 0;
  let lastProgress = -1;

  console.group(`[Thread proof] Worker run ${requestId}`);
  console.log("[worker] Running park prioritization in worker context", {
    requestId,
    location: "worker thread",
    globalScope: self.constructor.name,
    hasWindow: typeof window !== "undefined",
    hasDocument: typeof document !== "undefined",
    rowCount: rows.length,
  });
  console.time(`WORKER ${requestId}`);

  self.postMessage({
    type: "PROOF",
    requestId,
    payload: {
      globalScope: self.constructor.name,
      hasWindow: typeof window !== "undefined",
      hasDocument: typeof document !== "undefined",
    },
  });

  function processChunk() {
    if (cancelled.has(requestId)) {
      cancelled.delete(requestId);
      console.timeEnd(`WORKER ${requestId}`);
      console.log("[worker] Cancelled analysis", { requestId });
      console.groupEnd();
      self.postMessage({
        type: "CANCELLED",
        requestId,
        payload: { elapsed: Math.round(performance.now() - started) },
      });
      return;
    }

    const chunkDeadline = performance.now() + 28;

    while (
      performance.now() < chunkDeadline &&
      performance.now() - started < normalized.targetMs
    ) {
      processScenarioStep(workingRows, iterations, normalized);
      iterations += 1;
    }

    const elapsed = performance.now() - started;
    const percent = Math.min(
      100,
      Math.round((elapsed / normalized.targetMs) * 100),
    );

    if (percent !== lastProgress) {
      lastProgress = percent;
      self.postMessage({
        type: "PROGRESS",
        requestId,
        payload: { percent, elapsed: Math.round(elapsed), iterations },
      });
    }

    if (elapsed < normalized.targetMs) {
      setTimeout(processChunk, 0);
      return;
    }

    const result = finalizeAnalysis(
      workingRows,
      rows.length,
      normalized,
      started,
      iterations,
    );
    console.timeEnd(`WORKER ${requestId}`);
    console.log("[worker] Done", {
      requestId,
      iterations: result.stats.iterations,
    });
    console.groupEnd();

    self.postMessage({
      type: "DONE",
      requestId,
      payload: result,
    });
  }

  processChunk();
}
