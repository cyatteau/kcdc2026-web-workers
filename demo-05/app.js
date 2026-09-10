import { analyzeParks } from "./analysis-core.js";

const DEMO_VIEW = {
  center: [-122.3321, 47.6062],
  zoom: 12,
};

const SEATTLE_PARKS_LAYER_URL =
  "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Park_Boundary_%28outline%29/FeatureServer/1";

const els = {
  map: document.querySelector("#map"),
  apiWarning: document.querySelector("#apiWarning"),
  queryBtn: document.querySelector("#queryBtn"),
  mainBtn: document.querySelector("#mainBtn"),
  workerBtn: document.querySelector("#workerBtn"),
  cancelBtn: document.querySelector("#cancelBtn"),
  rapidBtn: document.querySelector("#rapidBtn"),
  resetViewBtn: document.querySelector("#resetViewBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  clearLogBtn: document.querySelector("#clearLogBtn"),

  passes: document.querySelector("#passes"),
  passesValue: document.querySelector("#passesValue"),
  threshold: document.querySelector("#threshold"),
  thresholdValue: document.querySelector("#thresholdValue"),
  complexity: document.querySelector("#complexity"),
  complexityValue: document.querySelector("#complexityValue"),
  debounce: document.querySelector("#debounce"),
  debounceValue: document.querySelector("#debounceValue"),
  autoRun: document.querySelector("#autoRun"),

  progress: document.querySelector("#progress"),
  status: document.querySelector("#status"),

  heartbeat: document.querySelector(".heartbeat"),
  counterBtn: document.querySelector("#counterBtn"),
  counter: document.querySelector("#counter"),
  clickLag: document.querySelector("#clickLag"),
  uiClock: document.querySelector("#uiClock"),
  uiMeter: document.querySelector("#uiMeter"),
  uiDelay: document.querySelector("#uiDelay"),
  mapUiStatus: document.querySelector("#mapUiStatus"),

  featureCount: document.querySelector("#featureCount"),
  priorityCount: document.querySelector("#priorityCount"),
  elapsed: document.querySelector("#elapsed"),
  mode: document.querySelector("#mode"),
  sent: document.querySelector("#sent"),
  stale: document.querySelector("#stale"),
  results: document.querySelector("#results"),
  log: document.querySelector("#log"),
};

let view;
let parksLayer;
let resultLayer;
let Graphic;
let Polygon;

let queriedRows = [];
let clicks = 0;

let debounceTimer = null;
let requestSeq = 0;
let currentRequestId = null;
let activeWorkerRequestId = null;
let sentCount = 0;
let staleCount = 0;

let heartbeatAngle = 0;
let lastHeartbeatTime = performance.now();

const analysisWorker = new Worker("./analysis-worker.js", { type: "module" });

init();

async function init() {
  bindControls();
  bindWorkerMessages();
  setupTabs();

  const apiKey = String(window.ARCGIS_API_KEY || "").trim();

  if (!apiKey || apiKey === "PASTE_YOUR_API_KEY_HERE") {
    els.apiWarning.hidden = false;
    setStatus(
      "Paste an API key in config.js so the Esri basemap can load.",
      "danger",
    );
  }

  try {
    await waitForArcGIS();

    const [FeatureLayer, GraphicsLayer, GraphicModule, PolygonModule] =
      await window.$arcgis.import([
        "@arcgis/core/layers/FeatureLayer.js",
        "@arcgis/core/layers/GraphicsLayer.js",
        "@arcgis/core/Graphic.js",
        "@arcgis/core/geometry/Polygon.js",
      ]);

    Graphic = GraphicModule;
    Polygon = PolygonModule;

    await els.map.componentOnReady?.();
    await els.map.viewOnReady();

    view = els.map.view;

    view.constraints = {
      rotationEnabled: false,
      snapToZoom: false,
      minZoom: 10,
      maxZoom: 17,
    };

    if (view.navigation) {
      if (view.navigation.gamepad) {
        view.navigation.gamepad.enabled = false;
      }

      view.navigation.momentumEnabled = false;
    }

    parksLayer = new FeatureLayer({
      url: SEATTLE_PARKS_LAYER_URL,
      title: "Seattle parks boundaries",
      outFields: ["OBJECTID", "NAME", "PMA", "PARKSBND_AREA", "SDQL"],
      renderer: createParksRenderer(),
      opacity: 0.72,
      popupTemplate: {
        title: "{NAME}",
        content:
          "Seattle Parks & Recreation boundary feature.<br />" +
          "Approx. area: {PARKSBND_AREA} square feet<br />" +
          "Data quality level: {SDQL}",
      },
    });

    resultLayer = new GraphicsLayer({
      title: "Top prioritized Seattle parks",
    });

    els.map.map.addMany([parksLayer, resultLayer]);

    await parksLayer.when();
    await resetDemoView(false);

    setStatus(
      "Map ready in Seattle. Load the visible park boundaries to begin.",
      "safe",
    );
    els.queryBtn.disabled = false;

    log("Map ready. The worker is waiting for park data.");
  } catch (error) {
    console.error(error);

    setStatus(
      "The map did not finish loading. Check config.js, basemap privileges, allowed referrers, and local server setup.",
      "danger",
    );
  }
}

function bindControls() {
  els.queryBtn.disabled = true;

  els.counterBtn.addEventListener("click", (event) => {
    clicks += 1;
    els.counter.textContent = clicks;

    const lag = Math.max(0, Math.round(performance.now() - event.timeStamp));

    els.clickLag.textContent =
      lag > 100
        ? `Click processed ${lag.toLocaleString()} ms late`
        : "Click processed right away";
  });

  els.passes.addEventListener("input", () => {
    els.passesValue.textContent = els.passes.value;
    scheduleWorkerAnalysis("intensity changed");
  });

  els.threshold.addEventListener("input", () => {
    els.thresholdValue.textContent = els.threshold.value;
    scheduleWorkerAnalysis("threshold changed");
  });

  els.complexity.addEventListener("input", () => {
    els.complexityValue.textContent = Number(els.complexity.value).toFixed(1);
    scheduleWorkerAnalysis("complexity emphasis changed");
  });

  els.debounce.addEventListener("input", () => {
    els.debounceValue.textContent = els.debounce.value;
    scheduleWorkerAnalysis("debounce changed");
  });

  els.autoRun.addEventListener("change", () => {
    if (els.autoRun.checked) {
      scheduleWorkerAnalysis("auto-run enabled");
    }
  });

  els.queryBtn.addEventListener("click", queryVisibleParks);
  els.mainBtn.addEventListener("click", runMainThreadAnalysis);
  els.workerBtn.addEventListener("click", () => runWorkerAnalysis("manual"));
  els.cancelBtn.addEventListener("click", cancelCurrentWorkerJob);
  els.rapidBtn.addEventListener("click", simulateRapidScenarioChanges);
  els.resetViewBtn.addEventListener("click", () => resetDemoView(true));
  els.clearBtn.addEventListener("click", clearResults);
  els.clearLogBtn.addEventListener("click", () => {
    els.log.innerHTML = "";
  });

  els.passesValue.textContent = els.passes.value;
  els.thresholdValue.textContent = els.threshold.value;
  els.complexityValue.textContent = Number(els.complexity.value).toFixed(1);
  els.debounceValue.textContent = els.debounce.value;

  startUiMonitor();
  startHeartbeat();
}

function bindWorkerMessages() {
  analysisWorker.addEventListener("message", (event) => {
    const { type, requestId, payload } = event.data;

    log(`← ${type} (${requestId})`);

    if (type === "CANCELLED") {
      handleCancelledMessage(requestId);
      return;
    }

    if (requestId !== currentRequestId) {
      staleCount += 1;
      els.stale.textContent = staleCount;
      log(`  ignored stale message for ${requestId}`);
      return;
    }

    if (type === "PROOF") {
      log(
        `  worker context: hasWindow=${payload.hasWindow}, hasDocument=${payload.hasDocument}`,
      );
      return;
    }

    if (type === "PROGRESS") {
      els.progress.style.width = `${payload.percent}%`;
      els.mode.textContent = "Worker";
      els.elapsed.textContent = `${payload.elapsed.toLocaleString()} ms`;
      els.mapUiStatus.textContent = `Worker analysis running: ${payload.percent}%`;

      setStatus(
        `Worker running: ${payload.percent}% complete. Map + UI should keep moving.`,
        "safe",
      );

      return;
    }

    if (type === "ERROR") {
      activeWorkerRequestId = null;
      currentRequestId = null;
      els.cancelBtn.disabled = true;

      setStatus(`Worker error: ${payload.message}`, "danger");
      return;
    }

    if (type === "DONE") {
      activeWorkerRequestId = null;
      currentRequestId = null;
      els.cancelBtn.disabled = true;
      els.progress.style.width = "100%";

      renderAnalysis(payload, "Worker");

      setStatus(
        "Worker run finished. The analysis still took time, but the interface stayed responsive.",
        "safe",
      );

      els.mapUiStatus.textContent =
        "Worker run finished: interface stayed responsive";
    }
  });

  analysisWorker.addEventListener("error", (error) => {
    console.error(error);

    activeWorkerRequestId = null;
    currentRequestId = null;
    els.cancelBtn.disabled = true;

    setStatus("Worker run failed. Check the browser console.", "danger");
  });
}

function handleCancelledMessage(requestId) {
  if (requestId === currentRequestId) {
    activeWorkerRequestId = null;
    currentRequestId = null;
    els.cancelBtn.disabled = true;
    els.progress.style.width = "0%";

    setStatus(
      "Analysis cancelled. Old work stopped before it could update the map.",
      "warning",
    );
    els.mapUiStatus.textContent = "Analysis cancelled";

    return;
  }

  log(`  cancellation acknowledged for old request ${requestId}`);
}

async function queryVisibleParks() {
  if (!parksLayer || !view) return;

  setStatus("Loading park boundaries from the current map view…", "warning");

  clearTimeout(debounceTimer);

  els.queryBtn.disabled = true;

  clearResults(false);

  try {
    const query = parksLayer.createQuery();

    query.geometry = view.extent;
    query.spatialRelationship = "intersects";
    query.returnGeometry = true;
    query.outFields = ["OBJECTID", "NAME", "PMA", "PARKSBND_AREA", "SDQL"];
    query.where = "1=1";
    query.outSpatialReference = view.spatialReference;

    const featureSet = await parksLayer.queryFeatures(query);

    queriedRows = featureSet.features.map((feature, index) => {
      const attributes = feature.attributes ?? {};
      const geometryJson = feature.geometry?.toJSON?.() ?? null;
      const rings = geometryJson?.rings ?? [];
      const ringCount = rings.length;
      const vertexCount = rings.reduce((sum, ring) => sum + ring.length, 0);
      const id = pickValue(attributes, ["OBJECTID", "FID"], index + 1);
      const name = pickValue(attributes, ["NAME"], `Seattle park ${id}`);
      const pma = pickValue(attributes, ["PMA"], "—");
      const sdql = pickValue(attributes, ["SDQL"], "unknown");

      const areaAcres = normalizeAcres(
        pickNumber(
          attributes,
          ["PARKSBND_AREA", "Shape__Area", "SHAPE_AREA"],
          Math.max(1, vertexCount / 12),
        ),
      );

      return {
        id,
        name,
        type: pma === "—" ? "Seattle park boundary" : `PMA ${pma}`,
        quality: sdql,
        areaAcres,
        ringCount,
        vertexCount,
        geometryJson,
      };
    });

    els.featureCount.textContent = queriedRows.length.toLocaleString();
    els.mode.textContent = "Queried";

    if (queriedRows.length === 0) {
      setStatus(
        "No visible Seattle park boundaries found. Reset the map view and try again.",
        "danger",
      );
      return;
    }

    setStatus(
      `Loaded ${queriedRows.length.toLocaleString()} visible Seattle park boundaries. Compare main-thread analysis with worker analysis.`,
      "safe",
    );

    els.mainBtn.disabled = false;
    els.workerBtn.disabled = false;
    els.rapidBtn.disabled = false;

    log(
      `Queried ${queriedRows.length.toLocaleString()} parks. Converted ArcGIS features into plain data rows.`,
    );
  } catch (error) {
    console.error(error);

    setStatus(
      "Feature query failed. Since IdentityManager is off, this should fail instead of opening a sign-in box.",
      "danger",
    );
  } finally {
    els.queryBtn.disabled = false;
  }
}

async function runMainThreadAnalysis() {
  if (!queriedRows.length) return;

  clearTimeout(debounceTimer);
  cancelCurrentWorkerJob(false);

  const options = getOptions();

  currentRequestId = null;
  activeWorkerRequestId = null;
  els.cancelBtn.disabled = true;
  els.progress.style.width = "0%";

  setStatus(
    `Running a ${formatSeconds(options.targetMs)} park prioritization analysis on the main thread. Watch the heartbeat, responsiveness monitor, and test click.`,
    "danger",
  );

  els.mapUiStatus.textContent =
    "Main-thread analysis running: responsiveness may pause";

  await afterNextPaint();

  console.group("[Thread proof] Main thread run");
  console.log("[main] Calling analyzeParks() directly from app.js", {
    location: "page main thread",
    hasWindow: typeof window !== "undefined",
    hasDocument: typeof document !== "undefined",
  });
  console.time("MAIN THREAD analyzeParks");
  performance.mark("main-analysis-start");

  const result = analyzeParks(queriedRows, options);

  performance.mark("main-analysis-end");
  performance.measure(
    "MAIN_THREAD analyzeParks",
    "main-analysis-start",
    "main-analysis-end",
  );
  console.timeEnd("MAIN THREAD analyzeParks");
  console.groupEnd();

  renderAnalysis(result, "Main thread");

  setStatus(
    "Main-thread run finished. The delayed monitor shows the page could not keep repainting during the analysis.",
    "warning",
  );

  els.mapUiStatus.textContent = "Main-thread run finished";
}

function scheduleWorkerAnalysis(reason) {
  if (!queriedRows.length || !els.autoRun.checked) return;

  clearTimeout(debounceTimer);

  const delay = Number(els.debounce.value);

  if (delay === 0) {
    setStatus("No debounce: every change starts a worker analysis.", "warning");
    runWorkerAnalysis(reason);
    return;
  }

  setStatus(`Waiting ${delay} ms for scenario inputs to settle…`, "warning");
  log(`debounce: ${reason}; waiting ${delay} ms`);

  debounceTimer = setTimeout(() => {
    runWorkerAnalysis(`debounced: ${reason}`);
  }, delay);
}

function runWorkerAnalysis(reason = "manual") {
  if (!queriedRows.length) return;

  clearTimeout(debounceTimer);

  if (activeWorkerRequestId) {
    analysisWorker.postMessage({
      type: "CANCEL_ANALYSIS",
      requestId: activeWorkerRequestId,
      payload: { reason: "newer analysis started" },
    });
  }

  const requestId = `parks-${++requestSeq}`;

  currentRequestId = requestId;
  activeWorkerRequestId = requestId;
  sentCount += 1;

  els.sent.textContent = sentCount;
  els.progress.style.width = "0%";
  els.cancelBtn.disabled = false;

  const payload = {
    rows: queriedRows,
    options: getOptions(),
  };

  log(`→ ANALYZE_PARKS (${requestId}) · ${reason}`);
  log(
    `  payload: ${payload.rows.length} park rows, ${formatSeconds(payload.options.targetMs)}, threshold ${payload.options.threshold}`,
  );

  console.group(`[Thread proof] Worker request ${requestId}`);
  console.log("[main] Posting plain park data to worker", {
    requestId,
    type: "ANALYZE_PARKS",
    rowCount: payload.rows.length,
    options: payload.options,
    hasWindow: typeof window !== "undefined",
    hasDocument: typeof document !== "undefined",
  });
  console.groupEnd();

  setStatus(
    `Worker analysis ${requestId} running. Try panning or clicking while it works.`,
    "safe",
  );
  els.mapUiStatus.textContent =
    "Worker analysis running: interface should stay responsive";

  analysisWorker.postMessage({
    type: "ANALYZE_PARKS",
    requestId,
    payload,
  });
}

function cancelCurrentWorkerJob(showMessage = true) {
  if (!activeWorkerRequestId) return;

  const requestId = activeWorkerRequestId;

  analysisWorker.postMessage({
    type: "CANCEL_ANALYSIS",
    requestId,
    payload: { reason: "user cancelled" },
  });

  log(`→ CANCEL_ANALYSIS (${requestId})`);

  if (showMessage) {
    setStatus(
      "Cancel message sent. The worker will stop at the next safe pause point.",
      "warning",
    );
    return;
  }

  activeWorkerRequestId = null;
  els.cancelBtn.disabled = true;
}

async function simulateRapidScenarioChanges() {
  if (!queriedRows.length) return;

  const values = [58, 66, 74, 82, 70, 76];

  for (const value of values) {
    els.threshold.value = value;
    els.thresholdValue.textContent = value;
    els.threshold.dispatchEvent(new Event("input"));

    await new Promise((resolve) => {
      setTimeout(resolve, 95);
    });
  }
}

function getOptions() {
  return {
    targetMs: Number(els.passes.value) * 1000,
    threshold: Number(els.threshold.value),
    complexityWeight: Number(els.complexity.value),
  };
}

function renderAnalysis({ results, stats }, mode) {
  els.featureCount.textContent = stats.featureCount.toLocaleString();
  els.priorityCount.textContent = stats.priorityCount.toLocaleString();
  els.elapsed.textContent = `${stats.elapsed.toLocaleString()} ms`;
  els.mode.textContent = mode;

  els.results.classList.remove("empty");

  els.results.innerHTML = results
    .map(
      (row, index) => `
        <div class="result">
          <strong>${index + 1}. ${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.type)} · ${Math.round(row.areaAcres).toLocaleString()} acres · score ${row.score.toFixed(1)}</span>
        </div>
      `,
    )
    .join("");

  drawTopResults(results);
}

function drawTopResults(results) {
  if (!resultLayer || !Graphic) return;

  resultLayer.removeAll();

  const graphics = results
    .filter((row) => row.geometryJson)
    .map(
      (row) =>
        new Graphic({
          geometry: new Polygon(row.geometryJson),
          attributes: row,
          symbol: {
            type: "simple-fill",
            color: [255, 204, 102, 0.34],
            outline: {
              color: [255, 204, 102, 1],
              width: 1.5,
            },
          },
          popupTemplate: {
            title: row.name,
            content: `Score: ${row.score.toFixed(1)}<br />Approx. area: ${Math.round(row.areaAcres).toLocaleString()} acres`,
          },
        }),
    );

  resultLayer.addMany(graphics);
}

async function resetDemoView(announce = true) {
  if (!view) return;

  await view.goTo(DEMO_VIEW, { animate: false });

  if (announce) {
    setStatus("Reset to the Seattle map view.", "safe");
  }
}

function clearResults(announce = true) {
  clearTimeout(debounceTimer);
  cancelCurrentWorkerJob(false);

  queriedRows = announce ? [] : queriedRows;

  resultLayer?.removeAll();

  els.priorityCount.textContent = "0";
  els.elapsed.textContent = "0 ms";
  els.mode.textContent = "—";
  els.progress.style.width = "0%";

  els.results.classList.add("empty");
  els.results.textContent = announce
    ? "Load the visible Seattle park boundaries first."
    : "Ready for analysis.";

  if (announce) {
    currentRequestId = null;
    activeWorkerRequestId = null;
    els.featureCount.textContent = "0";
    els.mainBtn.disabled = true;
    els.workerBtn.disabled = true;
    els.rapidBtn.disabled = true;
    els.cancelBtn.disabled = true;

    setStatus(
      "Cleared results. Load visible Seattle park boundaries again when ready.",
      "safe",
    );
  }
}

function setStatus(message, tone = "") {
  els.status.className = `status ${tone}`;
  els.status.textContent = message;
}

function startHeartbeat() {
  if (!els.heartbeat) return;

  els.heartbeat.style.animation = "none";

  requestAnimationFrame(animateHeartbeat);
}

function animateHeartbeat(now) {
  if (!els.heartbeat) return;

  const delta = now - lastHeartbeatTime;

  lastHeartbeatTime = now;
  heartbeatAngle = (heartbeatAngle + delta * 0.42) % 360;

  els.heartbeat.style.transform = `rotate(${heartbeatAngle}deg)`;

  requestAnimationFrame(animateHeartbeat);
}

function startUiMonitor() {
  const started = performance.now();
  let lastTick = started;
  let tick = 0;
  let blockedNoticeUntil = 0;

  setInterval(() => {
    const now = performance.now();
    const gap = now - lastTick;

    tick += 1;

    if (els.uiClock) {
      els.uiClock.textContent = `${((now - started) / 1000).toFixed(1)}s`;
    }

    if (els.uiMeter) {
      els.uiMeter.style.width = `${(tick % 20) * 5}%`;
    }

    if (gap > 350) {
      const message = `UI was blocked for ${Math.round(gap).toLocaleString()} ms`;

      blockedNoticeUntil = now + 3000;

      if (els.uiDelay) {
        els.uiDelay.textContent = message;
        els.uiDelay.classList.add("blocked");
      }

      if (els.mapUiStatus) {
        els.mapUiStatus.textContent = message;
      }
    } else if (now > blockedNoticeUntil) {
      if (els.uiDelay) {
        els.uiDelay.textContent = "Updating every 100 ms";
        els.uiDelay.classList.remove("blocked");
      }

      if (
        els.mapUiStatus &&
        !els.mapUiStatus.textContent.includes("analysis running")
      ) {
        els.mapUiStatus.textContent = "Interface updates should keep moving";
      }
    }

    lastTick = now;
  }, 100);
}

function log(message) {
  const row = document.createElement("div");

  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;

  els.log.prepend(row);

  while (els.log.children.length > 42) {
    els.log.lastElementChild.remove();
  }
}

function formatSeconds(ms) {
  const seconds = ms / 1000;

  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} second${
    seconds === 1 ? "" : "s"
  }`;
}

function afterNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function waitForArcGIS() {
  return new Promise((resolve, reject) => {
    const started = performance.now();

    function check() {
      if (window.$arcgis?.import) {
        resolve();
        return;
      }

      if (performance.now() - started > 10000) {
        reject(new Error("ArcGIS CDN did not become ready."));
        return;
      }

      requestAnimationFrame(check);
    }

    check();
  });
}

function pickValue(attributes, names, fallback) {
  for (const name of names) {
    if (
      attributes[name] !== undefined &&
      attributes[name] !== null &&
      attributes[name] !== ""
    ) {
      return attributes[name];
    }
  }

  return fallback;
}

function pickNumber(attributes, names, fallback) {
  for (const name of names) {
    const value = Number(attributes[name]);

    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return fallback;
}

function normalizeAcres(value) {
  if (value > 100000) {
    return value / 43560;
  }

  return value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createParksRenderer() {
  return {
    type: "simple",
    symbol: {
      type: "simple-fill",
      color: [70, 230, 178, 0.28],
      outline: {
        color: [70, 230, 178, 0.8],
        width: 0.9,
      },
    },
  };
}

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;

      buttons.forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      panels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === `tab-${tab}`);
      });
    });
  });
}
