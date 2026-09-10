const records = createRecords(120000);
self.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;
  if (type !== "FILTER") return;
  filterInChunks(requestId, payload);
});
function filterInChunks(requestId, { query, category }) {
  const started = performance.now();
  const results = [];
  const groups = new Map();
  let index = 0;
  const chunkSize = 2000;
  function processChunk() {
    const end = Math.min(index + chunkSize, records.length);
    for (; index < end; index += 1) {
      const row = records[index];
      if (category !== "all" && row.category !== category) continue;
      if (query && !row.searchText.includes(query)) continue;
      const score = scoreRecord(row);
      if (score < 22) continue;
      groups.set(row.category, (groups.get(row.category) || 0) + 1);
      if (results.length < 80) results.push({ ...row, score });
    }
    const percent = Math.round((index / records.length) * 100);
    self.postMessage({ type: "PROGRESS", requestId, payload: { percent } });
    if (index < records.length) {
      setTimeout(processChunk, 0);
      return;
    }
    results.sort((a, b) => b.score - a.score);
    self.postMessage({
      type: "DONE",
      requestId,
      payload: {
        results: results.slice(0, 12),
        totalMatches: [...groups.values()].reduce((a, b) => a + b, 0),
        groups: [...groups.entries()],
        elapsed: Math.round(performance.now() - started),
      },
    });
  }
  processChunk();
}
function createRecords(count) {
  const categories = ["coffee", "beer", "food", "parks", "culture"];
  const neighborhoods = [
    "Capitol Hill",
    "Belltown",
    "Fremont",
    "Ballard",
    "Queen Anne",
    "Pioneer Square",
    "South Lake Union",
  ];
  const words = [
    "coffee",
    "espresso",
    "latte",
    "brew",
    "trail",
    "view",
    "museum",
    "tacos",
    "noodles",
    "market",
    "garden",
    "live",
    "music",
    "near",
    "late",
  ];
  const out = [];
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < count; i += 1) {
    const category = categories[Math.floor(rand() * categories.length)];
    const neighborhood =
      neighborhoods[Math.floor(rand() * neighborhoods.length)];
    const text = [
      category,
      neighborhood,
      words[Math.floor(rand() * words.length)],
      words[Math.floor(rand() * words.length)],
      words[Math.floor(rand() * words.length)],
    ]
      .join(" ")
      .toLowerCase();
    out.push({
      id: i,
      name: `${capitalize(category)} spot ${i + 1}`,
      category,
      neighborhood,
      searchText: text,
      rating: 3 + rand() * 2,
      popularity: Math.floor(rand() * 1000),
    });
  }
  return out;
}
function scoreRecord(row) {
  let score = row.rating * 12 + Math.log(row.popularity + 1) * 4;
  for (let i = 0; i < 40; i += 1) score += Math.abs(Math.sin(score + i)) * 0.05;
  return score;
}
function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}
