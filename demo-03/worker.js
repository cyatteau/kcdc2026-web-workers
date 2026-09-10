const cancelled = new Set();
self.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;
  if (type === "CANCEL") {
    cancelled.add(requestId);
    return;
  }
  if (type === "ANALYZE") {
    cancelled.delete(requestId);
    analyzeInChunks(requestId, payload);
  }
});
function analyzeInChunks(requestId, { records, chunkSize }) {
  const started = performance.now();
  let index = 0;
  let matches = 0;
  let total = 0;
  function processChunk() {
    if (cancelled.has(requestId)) {
      cancelled.delete(requestId);
      self.postMessage({
        type: "CANCELLED",
        requestId,
        payload: { elapsed: Math.round(performance.now() - started) },
      });
      return;
    }
    const end = Math.min(index + chunkSize, records);
    for (; index < end; index += 1) {
      const score = heavyScore(index);
      if (score > 15) {
        matches += 1;
        total += score;
      }
    }
    const percent = Math.round((index / records) * 100);
    self.postMessage({
      type: "PROGRESS",
      requestId,
      payload: { percent, chunkIndex: Math.ceil(index / chunkSize) },
    });
    if (index < records) {
      setTimeout(processChunk, 0);
      return;
    }
    self.postMessage({
      type: "DONE",
      requestId,
      payload: {
        matches,
        total,
        elapsed: Math.round(performance.now() - started),
      },
    });
  }
  processChunk();
}
function heavyScore(seed) {
  let v = seed % 37;
  for (let i = 0; i < 300; i += 1)
    v = Math.abs(Math.sin(v + i) * Math.cos(seed - i) * 28);
  return v;
}
