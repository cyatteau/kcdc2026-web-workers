export function analyzeParks(rows, options = {}) {
  const normalized = normalizeOptions(options);
  const started = performance.now();
  const workingRows = createWorkingRows(rows);
  let iterations = 0;

  do {
    processScenarioStep(workingRows, iterations, normalized);
    iterations += 1;
  } while (performance.now() - started < normalized.targetMs);

  return finalizeAnalysis(
    workingRows,
    rows.length,
    normalized,
    started,
    iterations,
  );
}

export function normalizeOptions(options = {}) {
  return {
    targetMs: Math.max(500, Number(options.targetMs ?? 5000)),
    threshold: Math.max(1, Number(options.threshold ?? 72)),
    complexityWeight: Math.max(0.5, Number(options.complexityWeight ?? 1.4)),
  };
}

export function createWorkingRows(rows) {
  return rows.map((row) => ({
    ...row,
    score: scoreBase(row),
  }));
}

export function processScenarioStep(workingRows, iteration, options) {
  if (!workingRows.length) return;

  const row = workingRows[iteration % workingRows.length];
  const i = iteration + 1;

  const sizeSignal = Math.log(row.areaAcres + 1) * 0.014;
  const complexitySignal =
    Math.log(row.vertexCount + row.ringCount + 1) *
    0.012 *
    options.complexityWeight;
  const qualitySignal =
    row.quality && row.quality !== "unknown" ? 0.018 : -0.008;

  const scenarioWave =
    Math.sin((row.score + row.vertexCount + i) * 0.0027) *
    Math.cos((row.areaAcres + row.ringCount + i) * 0.0041);

  const stability =
    Math.sin((row.vertexCount * 0.13 + i) * 0.003) *
    Math.cos((row.areaAcres * 0.21 + i) * 0.005);

  row.score +=
    sizeSignal +
    complexitySignal +
    qualitySignal +
    scenarioWave * 0.033 +
    stability * 0.018;
  row.score = row.score > 100 ? row.score - 2.25 : row.score;
  row.score = row.score < 0 ? row.score + 2.25 : row.score;
}

export function finalizeAnalysis(
  workingRows,
  featureCount,
  options,
  started,
  iterations,
) {
  const results = workingRows
    .map((row) => ({
      ...row,
      score: clamp(row.score, 0, 100),
    }))
    .sort((a, b) => b.score - a.score);

  const priorityCount = results.filter(
    (row) => row.score >= options.threshold,
  ).length;

  return {
    results: results.slice(0, 6),
    stats: {
      featureCount,
      priorityCount,
      elapsed: Math.round(performance.now() - started),
      targetMs: options.targetMs,
      threshold: options.threshold,
      complexityWeight: options.complexityWeight,
      iterations,
    },
  };
}

function scoreBase(row) {
  const sizeScore = clamp(Math.log(row.areaAcres + 1) * 12, 0, 45);
  const shapeScore = clamp(Math.log(row.vertexCount + 1) * 8, 0, 35);
  const qualityBoost = row.quality && row.quality !== "unknown" ? 6 : 2;
  return clamp(25 + sizeScore + shapeScore + qualityBoost, 0, 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
