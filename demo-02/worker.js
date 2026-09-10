self.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;

  if (type !== "ANALYZE") return;

  const started = performance.now();
  const result = analyze(payload);

  self.postMessage({
    type: "DONE",
    requestId,
    payload: {
      ...result,
      elapsed: Math.round(performance.now() - started),
    },
  });
});

function analyze({ size, spice }) {
  let matches = 0;
  let total = 0;

  for (let i = 0; i < size; i += 1) {
    const score = expensiveScore((i * 2654435761) % 9973, spice);

    if (score > 13.5) {
      matches += 1;
      total += score;
    }
  }

  return { matches, total };
}

function expensiveScore(seed, spice) {
  let score = seed % 31;

  for (let i = 0; i < spice * 95; i += 1) {
    score = Math.abs(Math.sin(score + i) * Math.cos(seed - i) * 26);
  }

  return score;
}
