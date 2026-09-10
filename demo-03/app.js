const els = {
  records: document.querySelector("#records"),
  recordsValue: document.querySelector("#recordsValue"),
  chunk: document.querySelector("#chunk"),
  chunkValue: document.querySelector("#chunkValue"),
  startBtn: document.querySelector("#startBtn"),
  startNewBtn: document.querySelector("#startNewBtn"),
  cancelBtn: document.querySelector("#cancelBtn"),
  progress: document.querySelector("#progress"),
  progressText: document.querySelector("#progressText"),
  status: document.querySelector("#status"),
  activeId: document.querySelector("#activeId"),
  elapsed: document.querySelector("#elapsed"),
  stale: document.querySelector("#stale"),
  log: document.querySelector("#log"),
};
let seq = 0;
let currentRequestId = null;
let staleCount = 0;
const worker = new Worker("./worker.js", { type: "module" });

els.records.addEventListener(
  "input",
  () =>
    (els.recordsValue.textContent = Number(els.records.value).toLocaleString()),
);
els.chunk.addEventListener(
  "input",
  () => (els.chunkValue.textContent = els.chunk.value),
);
els.startBtn.addEventListener("click", () => startJob("normal"));
els.startNewBtn.addEventListener("click", () => startJob("newer"));
els.cancelBtn.addEventListener("click", () => cancelJob());

worker.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;
  log(`← ${type} (${requestId})`);
  if (requestId !== currentRequestId) {
    staleCount += 1;
    els.stale.textContent = staleCount;
    log(`  ignored stale message for ${requestId}`);
    return;
  }
  if (type === "PROGRESS") {
    els.progress.style.width = `${payload.percent}%`;
    els.progressText.textContent = `${payload.percent}%`;
    els.status.textContent = `Worker processing chunk ${payload.chunkIndex}. UI stays responsive.`;
  }
  if (type === "DONE") {
    els.progress.style.width = "100%";
    els.progressText.textContent = "100%";
    els.elapsed.textContent = `${payload.elapsed} ms`;
    els.status.textContent = `Done: ${payload.matches.toLocaleString()} matches. Result came back as data.`;
    els.status.className = "status";
    currentRequestId = null;
    els.activeId.textContent = "—";
  }
  if (type === "CANCELLED") {
    els.status.textContent = `Cancelled ${requestId} after ${payload.elapsed} ms.`;
    els.status.className = "status warning";
    els.progress.style.width = "0%";
    els.progressText.textContent = "0%";
    currentRequestId = null;
    els.activeId.textContent = "—";
  }
});

function startJob(reason) {
  // If this is a normal new job, cancel the old one.
  // If this is "Start newer job," leave the old one running
  // so late messages can become stale.
  if (currentRequestId && reason !== "newer") {
    cancelJob(false);
  }

  currentRequestId = `req-${++seq}`;
  els.activeId.textContent = currentRequestId;
  els.elapsed.textContent = "—";
  els.progress.style.width = "0%";
  els.progressText.textContent = "0%";

  els.status.textContent =
    reason === "newer"
      ? "Starting a newer request. Old messages become stale."
      : "Starting worker job.";

  els.status.className = "status";

  const message = {
    type: "ANALYZE",
    requestId: currentRequestId,
    payload: {
      records: Number(els.records.value),
      chunkSize: Number(els.chunk.value),
    },
  };

  log(`→ ANALYZE (${message.requestId})`);
  worker.postMessage(message);
}

function cancelJob(show = true) {
  if (!currentRequestId) return;

  const requestId = currentRequestId;

  log(`→ CANCEL (${requestId})`);
  worker.postMessage({ type: "CANCEL", requestId, payload: {} });

  currentRequestId = null;
  els.activeId.textContent = "—";

  if (show) {
    els.status.textContent = `Cancel requested for ${requestId}.`;
    els.status.className = "status warning";
  }
}
function log(message) {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.log.prepend(row);
  while (els.log.children.length > 28) els.log.lastElementChild.remove();
}
