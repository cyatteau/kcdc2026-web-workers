const els = {
  query: document.querySelector("#query"),
  category: document.querySelector("#category"),
  delay: document.querySelector("#delay"),
  delayValue: document.querySelector("#delayValue"),
  auto: document.querySelector("#auto"),
  runBtn: document.querySelector("#runBtn"),
  typeBtn: document.querySelector("#typeBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  progress: document.querySelector("#progress"),
  status: document.querySelector("#status"),
  sent: document.querySelector("#sent"),
  stale: document.querySelector("#stale"),
  matches: document.querySelector("#matches"),
  elapsed: document.querySelector("#elapsed"),
  results: document.querySelector("#results"),
  log: document.querySelector("#log"),
};
const worker = new Worker("./worker.js", { type: "module" });
let debounceId = null;
let requestSeq = 0;
let currentRequestId = null;
let sentCount = 0;
let staleCount = 0;

els.delay.addEventListener("input", () => {
  els.delayValue.textContent = els.delay.value;
  scheduleFilter();
});
els.query.addEventListener("input", scheduleFilter);
els.category.addEventListener("change", scheduleFilter);
els.auto.addEventListener("change", scheduleFilter);
els.runBtn.addEventListener("click", () => runFilter("manual"));
els.typeBtn.addEventListener("click", simulateFastTyping);
els.clearBtn.addEventListener("click", () => (els.log.innerHTML = ""));

worker.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;
  log(`← ${type} (${requestId})`);
  if (requestId !== currentRequestId) {
    staleCount += 1;
    els.stale.textContent = staleCount;
    log(`  stale response ignored for ${requestId}`);
    return;
  }
  if (type === "PROGRESS") {
    els.progress.style.width = `${payload.percent}%`;
    els.status.textContent = `Filtering in worker: ${payload.percent}%`;
  }
  if (type === "DONE") {
    els.progress.style.width = "100%";
    els.matches.textContent = payload.totalMatches.toLocaleString();
    els.elapsed.textContent = `${payload.elapsed} ms`;
    els.status.textContent = `Done. ${payload.totalMatches.toLocaleString()} matches, grouped across ${payload.groups.length} categories.`;
    renderResults(payload.results);
  }
});

function scheduleFilter() {
  if (!els.auto.checked) return;
  clearTimeout(debounceId);
  const delay = Number(els.delay.value);
  els.status.textContent =
    delay === 0
      ? "No debounce: every change sends a worker job."
      : `Waiting ${delay} ms for the user to pause…`;
  debounceId = setTimeout(() => runFilter("debounced"), delay);
}
function runFilter(reason) {
  currentRequestId = `filter-${++requestSeq}`;
  sentCount += 1;
  els.sent.textContent = sentCount;
  els.progress.style.width = "0%";
  const payload = {
    query: els.query.value.trim().toLowerCase(),
    category: els.category.value,
  };
  log(`→ FILTER (${currentRequestId}) · ${reason} · query="${payload.query}"`);
  worker.postMessage({ type: "FILTER", requestId: currentRequestId, payload });
}
async function simulateFastTyping() {
  const phrases = [
    "c",
    "co",
    "cof",
    "coff",
    "coffee",
    "coffee ",
    "coffee n",
    "coffee ne",
    "coffee near",
  ];
  for (const value of phrases) {
    els.query.value = value;
    els.query.dispatchEvent(new Event("input"));
    await new Promise((resolve) => setTimeout(resolve, 85));
  }
}
function renderResults(results) {
  els.results.innerHTML = results
    .slice(0, 8)
    .map(
      (item) =>
        `<div class="result"><strong>${item.name}</strong><span>${item.category} · score ${item.score.toFixed(1)} · ${item.neighborhood}</span></div>`,
    )
    .join("");
}
function log(message) {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.log.prepend(row);
  while (els.log.children.length > 30) els.log.lastElementChild.remove();
}
