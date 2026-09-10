const els = {
  counterBtn: document.querySelector("#counterBtn"),
  counter: document.querySelector("#counter"),
  runBtn: document.querySelector("#runBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  size: document.querySelector("#size"),
  sizeValue: document.querySelector("#sizeValue"),
  spice: document.querySelector("#spice"),
  spiceValue: document.querySelector("#spiceValue"),
  typingBox: document.querySelector("#typingBox"),
  status: document.querySelector("#status"),
  frameGap: document.querySelector("#frameGap"),
  longTasks: document.querySelector("#longTasks"),
  clickDelay: document.querySelector("#clickDelay"),
  elapsed: document.querySelector("#elapsed"),
  heartbeat: document.querySelector(".heartbeat"),
  log: document.querySelector("#log"),
};

let clicks = 0;
let lastFrame = performance.now();
let maxFrameGap = 0;
let longTaskCount = 0;

let heartbeatAngle = 0;
let lastHeartbeatTime = performance.now();

requestAnimationFrame(trackFrames);
requestAnimationFrame(animateHeartbeat);
setupLongTaskObserver();

els.size.addEventListener("input", () => {
  els.sizeValue.textContent = Number(els.size.value).toLocaleString();
});

els.spice.addEventListener("input", () => {
  els.spiceValue.textContent = els.spice.value;
});

els.counterBtn.addEventListener("pointerdown", (event) => {
  els.counterBtn.dataset.pointerStart = String(event.timeStamp);
});

els.counterBtn.addEventListener("click", (event) => {
  clicks += 1;
  els.counter.textContent = clicks;

  const pointerStart = Number(
    els.counterBtn.dataset.pointerStart || event.timeStamp,
  );

  const delay = Math.max(0, performance.now() - pointerStart);
  els.clickDelay.textContent = `${Math.round(delay)} ms`;

  log(`click handled after ${Math.round(delay)} ms`);
});

els.resetBtn.addEventListener("click", () => {
  maxFrameGap = 0;
  longTaskCount = 0;
  clicks = 0;

  els.counter.textContent = "0";
  els.frameGap.textContent = "0 ms";
  els.longTasks.textContent = "0";
  els.clickDelay.textContent = "0 ms";
  els.elapsed.textContent = "0 ms";
  els.log.innerHTML = "";

  els.status.textContent = "Metrics reset.";
  els.status.className = "status";
});

els.runBtn.addEventListener("click", async () => {
  const size = Number(els.size.value);
  const spice = Number(els.spice.value);

  els.status.textContent =
    "About to block the main thread. Try clicking or typing now.";
  els.status.className = "status danger";
  els.runBtn.disabled = true;

  await waitForNextPaint();

  const started = performance.now();
  const result = runSynchronousAnalysis(size, spice);
  const elapsed = Math.round(performance.now() - started);

  els.elapsed.textContent = `${elapsed} ms`;
  els.status.textContent = `Finished: ${result.matches.toLocaleString()} matches across ${result.groups} groups. The UI waited during that work.`;
  els.status.className = "status warning";
  els.runBtn.disabled = false;

  log(`blocking task finished after ${elapsed} ms`);
});

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
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

function setupLongTaskObserver() {
  if (!("PerformanceObserver" in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      longTaskCount += list.getEntries().length;
      els.longTasks.textContent = String(longTaskCount);
    });

    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    log(
      "Long Task API not available in this browser. Frame gaps still show the problem.",
    );
  }
}

function runSynchronousAnalysis(size, spice) {
  const groups = new Map();
  let matches = 0;
  let scoreTotal = 0;

  for (let i = 0; i < size; i += 1) {
    const category = i % 7;
    const value = pseudoRandom(i) * 1000;
    const score = expensiveScore(value, spice);

    if (score > 13.7) {
      matches += 1;
      scoreTotal += score;
      groups.set(category, (groups.get(category) || 0) + 1);
    }
  }

  return { matches, scoreTotal, groups: groups.size };
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function expensiveScore(value, spice) {
  let score = value % 31;
  const rounds = spice * 90;

  for (let i = 0; i < rounds; i += 1) {
    score = Math.abs(Math.sin(score + i) * Math.cos(value - i) * 25.5);
  }

  return score;
}

function log(message) {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  els.log.prepend(row);
}
