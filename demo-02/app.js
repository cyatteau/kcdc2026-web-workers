const els = {
  counterBtn: document.querySelector("#counterBtn"),
  counter: document.querySelector("#counter"),
  size: document.querySelector("#size"),
  sizeValue: document.querySelector("#sizeValue"),
  spice: document.querySelector("#spice"),
  spiceValue: document.querySelector("#spiceValue"),
  mainBtn: document.querySelector("#mainBtn"),
  workerBtn: document.querySelector("#workerBtn"),
  status: document.querySelector("#status"),
  mainElapsed: document.querySelector("#mainElapsed"),
  workerElapsed: document.querySelector("#workerElapsed"),
  frameGap: document.querySelector("#frameGap"),
  matches: document.querySelector("#matches"),
  heartbeat: document.querySelector(".heartbeat"),
  log: document.querySelector("#log"),
};

let clicks = 0;
let lastFrame = performance.now();
let maxFrameGap = 0;
let requestId = 0;

let heartbeatAngle = 0;
let lastHeartbeatTime = performance.now();

// STEP 1:
// Create the worker here.
const worker = new Worker("./worker.js", { type: "module" });

requestAnimationFrame(trackFrames);
requestAnimationFrame(animateHeartbeat);

els.size.addEventListener("input", () => {
  els.sizeValue.textContent = Number(els.size.value).toLocaleString();
});

els.spice.addEventListener("input", () => {
  els.spiceValue.textContent = els.spice.value;
});

els.counterBtn.addEventListener("click", () => {
  clicks += 1;
  els.counter.textContent = clicks;
});

els.mainBtn.addEventListener("click", async () => {
  const payload = getPayload();

  resetFrameGap();
  setStatus(
    "Running on the main thread. Try clicking the counter now.",
    "danger",
  );

  await waitForNextPaint();

  const started = performance.now();
  const result = analyze(payload);
  const elapsed = Math.round(performance.now() - started);

  els.mainElapsed.textContent = `${elapsed} ms`;
  els.matches.textContent = result.matches.toLocaleString();

  setStatus(
    "Main-thread version finished. Notice how the UI had to wait.",
    "warning",
  );
  log(`main thread done in ${elapsed} ms`);
});

// STEP 2:
// Replace this placeholder with the worker message-sending version.

// els.workerBtn.addEventListener("click", () => {
//   resetFrameGap();

//   setStatus("Worker button is here, but I have not wired it yet.", "warning");
//   log("worker path not wired yet");
// });

els.workerBtn.addEventListener('click', () => {
  resetFrameGap();

  const id = `req-${++requestId}`;

  const message = {
    type: 'ANALYZE',
    requestId: id,
    payload: getPayload()
  };

  setStatus('Worker running. Try clicking the counter while the job runs.', '');
  log(`to worker: ANALYZE (${id})`);

  worker.postMessage(message);
});


// STEP 3:
// Listen for the worker result here.

worker.addEventListener("message", (event) => {
  const { type, requestId, payload } = event.data;

  log(`from worker: ${type} (${requestId})`);

  if (type === "DONE") {
    els.workerElapsed.textContent = `${payload.elapsed} ms`;
    els.matches.textContent = payload.matches.toLocaleString();

    setStatus(
      "Worker version finished. The work still happened, but the UI kept breathing.",
      ""
    );
  }
});

function getPayload() {
  return {
    size: Number(els.size.value),
    spice: Number(els.spice.value),
  };
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function resetFrameGap() {
  maxFrameGap = 0;
  els.frameGap.textContent = "0 ms";
  lastFrame = performance.now();
}

function trackFrames(now) {
  const gap = now - lastFrame;

  if (gap > maxFrameGap) {
    maxFrameGap = gap;
    els.frameGap.textContent = `${Math.round(maxFrameGap)} ms`;
  }

  lastFrame = now;
  requestAnimationFrame(trackFrames);
}

function animateHeartbeat(now) {
  if (!els.heartbeat) return;

  const delta = now - lastHeartbeatTime;
  lastHeartbeatTime = now;

  heartbeatAngle = (heartbeatAngle + delta * 0.42) % 360;
  els.heartbeat.style.transform = `rotate(${heartbeatAngle}deg)`;

  requestAnimationFrame(animateHeartbeat);
}

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

function setStatus(text, tone) {
  els.status.className = `status ${tone || ""}`;
  els.status.textContent = text;
}

function log(text) {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  els.log.prepend(row);
}
