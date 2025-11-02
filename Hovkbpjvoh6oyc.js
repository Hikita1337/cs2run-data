// ==UserScript==
// @name         CS2Run HUD редизайн
// @namespace    cs2runR.hud
// @version      2.0
// @description  HUD статистики CS2Run — омское время, настройки, подсветка коэффициента, перетаскивание, ресайз, прогресс/ожидание
// @match        *://cs2run.bet/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(async () => {
  const ABLY_PUBLIC_KEY = "OPAt8A.dMkrwA:A9niPpJUrzV7J62AKvitMDaExAN6wJkJ_P1EnQ8Ya9Y";
  if (!window.Ably) {
    const s = document.createElement("script");
    s.src = "https://cs2run-server.onrender.com/ably.min.js";
    document.head.appendChild(s);
    await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej("Failed load Ably"); });
  }

  const client = new Ably.Realtime(ABLY_PUBLIC_KEY);
  const channel = client.channels.get("cs2run");

  const LS_KEY = "cs2run_hud_state_v2";
  const defaults = {
    top: 20, left: 20, width: 360, height: 200,
    bgOpacity: 0.15, textOpacity: 1.0, theme: "auto",
    showPing: true, showCpu: true, showCurrentCrash: true,
    collapsed: false, showLoadingScreen: true
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { ...defaults };
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return { ...defaults };
    }
  }
  function saveState(st) { localStorage.setItem(LS_KEY, JSON.stringify(st)); }

  let state = loadState();

  function fmtOmskTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("ru-RU", {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "Asia/Omsk"
      });
    } catch { return "—"; }
  }

  // ------------------------------
  // Create HUD container & basic style
  // ------------------------------
  const HUD_ID = "cs2run_hud_final_v2";
  document.getElementById(HUD_ID)?.remove();

  const hud = document.createElement("div");
  hud.id = HUD_ID;
  hud.style.position = "fixed";
  hud.style.top = (state.top ?? defaults.top) + "px";
  hud.style.left = (state.left ?? defaults.left) + "px";
  hud.style.width = (state.width ?? defaults.width) + "px";
  hud.style.height = (state.height ?? defaults.height) + "px";
  hud.style.borderRadius = "10px";
  hud.style.zIndex = 999999;
  hud.style.overflow = "hidden";
  hud.style.transition = "transform .18s ease, opacity .18s ease";
  hud.style.display = "flex";
  hud.style.flexDirection = "column";
  hud.style.gap = "6px";
  hud.style.backdropFilter = "blur(6px)";
  hud.style.padding = "10px";
  hud.style.boxSizing = "border-box";

  // We'll apply theme later via applyThemeToElement
  document.body.appendChild(hud);

  function applyThemeToElement(el, theme) {
    if (theme === "dark") {
      el.style.background = `rgba(20,20,20,${state.bgOpacity})`;
      el.style.color = `rgba(230,230,230,${state.textOpacity})`;
      el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.6)";
      if (el === hud) {
        const bottom = el.querySelector("#cs_perf");
        const updated = el.querySelector("#cs_updated");
        if (bottom) bottom.style.color = "rgba(255,255,255,0.85)";
        if (updated) updated.style.color = "rgba(255,255,255,0.85)";
      }
    } else if (theme === "light") {
      el.style.background = `rgba(255,255,255,${state.bgOpacity})`;
      el.style.color = `rgba(20,20,20,${state.textOpacity})`;
      el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    } else {
      const bg = getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      let bright = 255;
      if (m) bright = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
      if (bright < 128) applyThemeToElement(el, "dark"); else applyThemeToElement(el, "light");
    }
  }

  // ------------------------------
  // Add styles / animation
  // ------------------------------
  const style = document.createElement("style");
  style.textContent = `
    @keyframes cs_highlight { 0% { transform: scale(1.03); filter: brightness(1.15); opacity:0.9 } 100% { transform: scale(1); filter: brightness(1); opacity:1 } }
    .cs-highlight { animation: cs_highlight .5s ease; }
    .cs-settings-backdrop { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; z-index: 1000001; background: rgba(0,0,0,0.25); }
    .cs-settings { width: 46vw; max-width: 720px; min-width: 320px; height: 52vh; background: rgba(255,255,255,0.98); border-radius: 12px; padding: 14px; box-shadow: 0 6px 30px rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:10px; box-sizing: border-box; }
    .cs-settings.dark { background: rgba(28,28,30,0.98); color: #EEE; }
    .cs-row { display:flex; align-items:center; gap:10px; justify-content:space-between; }
    .cs-row label { font-size:13px; }
    .cs-gear { position:absolute; right:10px; top:8px; cursor:pointer; user-select:none; }
    @media (max-width: 600px) { .cs-settings { width: 86vw; height: 60vh; } hud { width: 92vw !important; left: 4vw !important; } }
  `;
  document.head.appendChild(style);

  // ------------------------------
  // HUD inner structure (title, stats, bottom row)
  // ------------------------------
  const topRow = document.createElement("div");
  topRow.style.display = "flex";
  topRow.style.justifyContent = "space-between";
  topRow.style.alignItems = "center";
  topRow.style.padding = "6px 10px";
  topRow.style.borderRadius = "10px 10px 0 0";
  topRow.style.width = "100%";
  topRow.style.boxSizing = "border-box";
  topRow.style.background = "rgba(255,255,255,0.08)";
  topRow.style.backdropFilter = "blur(10px)";
  topRow.style.webkitBackdropFilter = "blur(10px)";
  topRow.style.borderBottom = "1px solid rgba(255,255,255,0.15)";

  const titleEl = document.createElement("div");
  titleEl.innerHTML = `<span style="font-weight:700;font-size:15px;">🎯 CS2Run</span> <span style="color:#007AFF;font-weight:600;font-size:13px;">(live)</span>`;
  topRow.appendChild(titleEl);

  const rightControls = document.createElement("div");
  rightControls.style.display = "flex";
  rightControls.style.alignItems = "center";
  rightControls.style.gap = "8px";

  // crash value (appended to title)
  const crashVal = document.createElement("span");
  crashVal.id = "cs_crash_val";
  crashVal.style.marginLeft = "8px";
  crashVal.style.fontWeight = "700";
  crashVal.style.fontSize = "16px";
  crashVal.style.transition = "all .3s ease";
  titleEl.appendChild(crashVal);

  // gear (settings) - will be visible later
  const gear = document.createElement("div");
  gear.className = "cs-gear";
  gear.textContent = "⚙️";
  gear.title = "Настройки HUD";
  gear.style.cursor = "pointer";
  gear.style.opacity = "0";
  gear.style.pointerEvents = "none";
  rightControls.appendChild(gear);

  topRow.appendChild(rightControls);
  hud.appendChild(topRow);

  // stats area
  const statsArea = document.createElement("div");
  statsArea.style.display = "flex";
  statsArea.style.flexDirection = "column";
  statsArea.style.flex = "1 1 auto";
  statsArea.style.gap = "6px";
  statsArea.style.overflow = "hidden";
  hud.appendChild(statsArea);
  const line = (label, id) => {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.fontSize = "13px";
    el.style.gap = "6px";
    el.innerHTML = `<div style="opacity:.9">${label}</div><div id="${id}" style="font-weight:700"></div>`;
    return el;
  };
  statsArea.appendChild(line("📊 10 игр —", "cs_avg10"));
  statsArea.appendChild(line("📊 25 игр —", "cs_avg25"));
  statsArea.appendChild(line("📊 50 игр —", "cs_avg50"));
  statsArea.appendChild(document.createElement("hr"));
  statsArea.appendChild(line("📈 Среднее", "cs_totalAvg"));
  statsArea.appendChild(line("🔥 Макс за сутки:", "cs_max24h"));

  // bottom row
  const bottomRow = document.createElement("div");
  bottomRow.style.display = "flex";
  bottomRow.style.justifyContent = "space-between";
  bottomRow.style.alignItems = "center";
  bottomRow.style.fontSize = "12px";
  bottomRow.style.color = "rgba(0,0,0,0.65)";
  bottomRow.style.opacity = state.textOpacity;
  bottomRow.style.background = "rgba(255,255,255,0.08)";
  bottomRow.style.backdropFilter = "blur(10px)";
  bottomRow.style.webkitBackdropFilter = "blur(10px)";
  bottomRow.style.borderTop = "1px solid rgba(255,255,255,0.15)";
  bottomRow.style.padding = "6px 10px";
  bottomRow.style.borderRadius = "0 0 10px 10px";
  bottomRow.style.width = "100%";
  bottomRow.style.boxSizing = "border-box";

  const perfEl = document.createElement("div");
  perfEl.id = "cs_perf";
  perfEl.style.display = "flex";
  perfEl.style.gap = "8px";
  perfEl.style.alignItems = "center";
  const updatedEl = document.createElement("div");
  updatedEl.id = "cs_updated";
  bottomRow.appendChild(perfEl);
  bottomRow.appendChild(updatedEl);
  hud.appendChild(bottomRow);

  hud.style.padding = "0"; // remove outer padding so panels sit flush

  // resize handle (create early so we can show it later)
  const resizeHandle = document.createElement("div");
  resizeHandle.textContent = "↘️";
  resizeHandle.style.position = "absolute";
  resizeHandle.style.right = "4.5px";
  resizeHandle.style.bottom = "4.5px";
  resizeHandle.style.cursor = "nwse-resize";
  resizeHandle.style.fontSize = "10.5px";
  resizeHandle.style.background = "rgba(255,255,255,0.1)";
  resizeHandle.style.borderRadius = "4px";
  resizeHandle.style.padding = "1px 4px";
  resizeHandle.style.opacity = "0";
  resizeHandle.style.userSelect = "none";
  resizeHandle.style.transition = "opacity 0.3s ease";
  resizeHandle.style.zIndex = "1000003";
  resizeHandle.style.pointerEvents = "none";
  hud.appendChild(resizeHandle);

  // collapse icon (create early)
  const collapseIcon = document.createElement("div");
  collapseIcon.textContent = "—";
  collapseIcon.style.fontSize = "18px";
  collapseIcon.style.fontWeight = "900";
  collapseIcon.style.cursor = "pointer";
  collapseIcon.style.marginRight = "27px";
  collapseIcon.style.userSelect = "none";
  collapseIcon.style.opacity = "0.9";
  collapseIcon.style.transition = "opacity 0.2s ease";
  collapseIcon.title = "Свернуть HUD";
  collapseIcon.onclick = () => {
    hud.style.opacity = "0";
    setTimeout(() => {
      hud.style.display = "none";
      hud.style.opacity = "1";
      showRestoreButton();
    }, 200);
    state.collapsed = true; saveState(state);
  };
  rightControls.prepend(collapseIcon);

  // restore button
  const restoreButton = document.createElement("div");
  restoreButton.textContent = "HUD";
  restoreButton.style.position = "fixed";
  restoreButton.style.top = "57px";
  restoreButton.style.right = "20px";
  restoreButton.style.padding = "8px 14px";
  restoreButton.style.fontWeight = "700";
  restoreButton.style.fontSize = "14px";
  restoreButton.style.borderRadius = "8px";
  restoreButton.style.background = "rgba(0,0,0,0.5)";
  restoreButton.style.color = "#fff";
  restoreButton.style.cursor = "pointer";
  restoreButton.style.boxShadow = "0 2px 10px rgba(0,0,0,0.3)";
  restoreButton.style.backdropFilter = "blur(6px)";
  restoreButton.style.webkitBackdropFilter = "blur(6px)";
  restoreButton.style.zIndex = 1000003;
  restoreButton.style.display = "none";
  restoreButton.style.transition = "opacity 0.2s ease";
  restoreButton.onclick = () => {
    restoreButton.style.display = "none";
    hud.style.display = "flex"; hud.style.opacity = "0";
    setTimeout(() => hud.style.opacity = "1", 10);
    state.collapsed = false; saveState(state);
  };
  document.body.appendChild(restoreButton);
  // 🧩 Починка: включаем элементы, если экран загрузки выключен
if (!state.showLoadingScreen) {
  gear.style.opacity = "1";
  gear.style.pointerEvents = "auto";
  resizeHandle.style.opacity = "0.8";
  resizeHandle.style.pointerEvents = "auto";
}
  function showRestoreButton(){
    restoreButton.style.display = "flex";
    restoreButton.style.opacity = "0";
    setTimeout(() => restoreButton.style.opacity = "1", 100);
  }

  // drag & resize logic (kept similar to yours)
  let dragInfo = null, resizeInfo = null, raf = null;
  const startDrag = (e) => {
    const tgt = e.target;
    if (tgt.closest && (tgt.closest('.cs-gear') || tgt.closest('button') || tgt === collapseIcon)) return;
    const t = e.touches ? e.touches[0] : e;
    dragInfo = { x: t.clientX, y: t.clientY, left: hud.offsetLeft, top: hud.offsetTop };
  };
  const onDrag = (e) => {
    if (!dragInfo) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - dragInfo.x, dy = t.clientY - dragInfo.y;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      hud.style.left = (dragInfo.left + dx) + "px"; hud.style.top = (dragInfo.top + dy) + "px";
    });
  };
  const stopDrag = () => { if (!dragInfo) return; state.left = hud.offsetLeft; state.top = hud.offsetTop; saveState(state); dragInfo = null; };
  topRow.style.cursor = "grab"; topRow.style.touchAction = "none";
  topRow.addEventListener("mousedown", startDrag); topRow.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("mousemove", onDrag); document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag); document.addEventListener("touchend", stopDrag);

  const startResize = (e) => { e.preventDefault(); const t = e.touches ? e.touches[0] : e; resizeInfo = { x: t.clientX, y: t.clientY, w: hud.offsetWidth, h: hud.offsetHeight }; };
  const onResize = (e) => { if (!resizeInfo) return; const t = e.touches ? e.touches[0] : e; const dw = t.clientX - resizeInfo.x, dh = t.clientY - resizeInfo.y; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { hud.style.width = Math.max(200, resizeInfo.w + dw) + "px"; hud.style.height = Math.max(120, resizeInfo.h + dh) + "px"; }); };
  const stopResize = () => { if (!resizeInfo) return; state.width = hud.offsetWidth; state.height = hud.offsetHeight; saveState(state); resizeInfo = null; };
  resizeHandle.addEventListener("mousedown", startResize); resizeHandle.addEventListener("touchstart", startResize, { passive: false });
  document.addEventListener("mousemove", onResize); document.addEventListener("touchmove", onResize, { passive: false });
  document.addEventListener("mouseup", stopResize); document.addEventListener("touchend", stopResize);

  // ------------------------------
  // rendering/update functions
  // ------------------------------
  let lastPayload = {};
  function colorForCrash(c) {
    if (c == null) return "#007AFF";
    if (c < 1.2) return "#FF3B30";
    if (c < 2) return "#5AC8FA";
    if (c < 4) return "#FF2D55";
    if (c < 8) return "#34C759";
    if (c < 25) return "#FFD60A";
    return null;
  }
  function updateBottomLayout() {
    const hasPerf = state.showPing || state.showCpu;
    updatedEl.style.paddingRight = "26px"; updatedEl.style.boxSizing = "border-box";
    if (!hasPerf) {
      perfEl.style.display = "none"; bottomRow.style.justifyContent = "flex-start";
      updatedEl.style.marginLeft = "10px"; updatedEl.style.width = "100%"; updatedEl.style.textAlign = "left";
    } else {
      perfEl.style.display = "flex"; bottomRow.style.justifyContent = "space-between";
      updatedEl.style.marginLeft = "0"; updatedEl.style.width = ""; updatedEl.style.textAlign = "";
    }
  }
  function refreshPerfVisibility() {
    perfEl.innerHTML = "";
    if (state.showPing) {
      const p = document.createElement("div");
      p.textContent = `⚡ Пинг: ${typeof lastPayload.ping === "number" ? lastPayload.ping.toFixed(3) + " s" : lastPayload.ping ?? "—"}`;
      perfEl.appendChild(p);
    }
    if (state.showCpu) {
      const c = document.createElement("div");
      c.textContent = `🧩 CPU: ${lastPayload.cpuLoad ?? "—"}%`;
      perfEl.appendChild(c);
    }
    updateBottomLayout();
  }

  function renderPayload(d) {
    lastPayload = { ...lastPayload, ...d };
    function formatVal(v) { if (v == null || v === "—" || v === "") return "—"; const num = Number(v); return isNaN(num) ? v : num.toFixed(2) + "x"; }
    try { document.getElementById("cs_avg10").textContent = formatVal(lastPayload.avg10); } catch {}
    try { document.getElementById("cs_avg25").textContent = formatVal(lastPayload.avg25); } catch {}
    try { document.getElementById("cs_avg50").textContent = formatVal(lastPayload.avg50); } catch {}
    try { document.getElementById("cs_totalAvg").textContent = formatVal(lastPayload.totalAvg); } catch {}
    try { document.getElementById("cs_max24h").textContent = formatVal(lastPayload.max24h); } catch {}
    perfEl.innerHTML = "";
    if (state.showPing) { const p = document.createElement("div"); p.textContent = `⚡ Пинг: ${typeof lastPayload.ping === "number" ? lastPayload.ping.toFixed(3) + " s" : lastPayload.ping ?? "—"}`; perfEl.appendChild(p); }
    if (state.showCpu) { const c = document.createElement("div"); c.textContent = `🧩 CPU: ${lastPayload.cpuLoad ?? "—"}%`; perfEl.appendChild(c); }
    updatedEl.innerHTML = `🕓 Обновлено (Омск): <b>${fmtOmskTime(lastPayload.updatedAt)}</b>`;
    const crash = (typeof d.lastCrash === "number") ? d.lastCrash : (typeof d.lastCrash === "string" ? Number(d.lastCrash) : (d.lastCrash ?? lastPayload.lastCrash ?? null));
    if (state.showCurrentCrash) {
      if (crash != null && !Number.isNaN(crash)) {
        const color = colorForCrash(crash);
        if (crash >= 25) {
          crashVal.style.background = "linear-gradient(90deg,#9b4dff,#3cd3ff)";
          crashVal.style.webkitBackgroundClip = "text"; crashVal.style.webkitTextFillColor = "transparent"; crashVal.style.color = "";
        } else {
          crashVal.style.background = ""; crashVal.style.webkitBackgroundClip = ""; crashVal.style.webkitTextFillColor = "";
          crashVal.style.color = color || "#007AFF";
        }
        crashVal.textContent = crash.toFixed(2) + "x";
      } else crashVal.textContent = "";
      crashVal.classList.remove("cs-highlight"); void crashVal.offsetWidth; crashVal.classList.add("cs-highlight");
    } else crashVal.textContent = "";
  }

  // ------------------------------
  // Settings modal (kept as in your original code — not repeated here fully)
  // ------------------------------
  // (Оставляем реализацию openSettings/closeSettings как в вашем коде.)
  // Для краткости не дублирую весь блок — но он должен остаться после renderPayload.
  // В вашем коде openSettings использует `gear` — он уже создан выше, так что всё ок.

  // (--- ВАЖНО ---) Теперь — блок, отвечающий за экран загрузки и первоначальную подписку на канал.
  // Он **должен** выполняться после того, как все элементы (gear, resizeHandle и пр.) созданы.
  // Поэтому переместили именно сюда.

  // Если экран загрузки включён — показываем overlay и подписываемся, чтобы скрыть его при первом update
  if (state.showLoadingScreen) {
    const loadingOverlay = document.createElement("div");
    loadingOverlay.id = "hud_loading_overlay";
    loadingOverlay.style.position = "absolute";
    loadingOverlay.style.top = "36px";
    loadingOverlay.style.left = "0";
    loadingOverlay.style.right = "0";
    loadingOverlay.style.bottom = "0";
    loadingOverlay.style.background = "rgba(0,0,0,0.8)";
    loadingOverlay.style.backdropFilter = "blur(120px)";
    loadingOverlay.style.webkitBackdropFilter = "blur(120px)";
    loadingOverlay.style.borderRadius = "0 0 10px 10px";
    loadingOverlay.style.display = "flex";
    loadingOverlay.style.flexDirection = "column";
    loadingOverlay.style.alignItems = "center";
    loadingOverlay.style.justifyContent = "center";
    loadingOverlay.style.gap = "22px";
    loadingOverlay.style.zIndex = "1000002";
    loadingOverlay.style.transition = "opacity 0.6s ease";
    loadingOverlay.style.pointerEvents = "none";
    loadingOverlay.style.boxShadow = "inset 0 0 40px rgba(0,0,0,0.6)";
    loadingOverlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
        <img src="https://cs2run.bet/img/crash/begun-v-1.gif"
             style="width:130px;height:auto;filter:drop-shadow(0 0 10px rgba(0,0,0,0.4));">
        <div style="font-size:17px;color:white;font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,0.6);">Ждём завершения игры…</div>
        <div style="width:260px;height:10px;background:rgba(255,255,255,0.25);border-radius:8px;overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,0.3);">
          <div id="hud_loading_fill" style="height:100%;width:0%;background:linear-gradient(90deg,#34C759,#FFD60A);transition:width 0.3s linear;"></div>
        </div>
      </div>
    `;
    hud.appendChild(loadingOverlay);
    loadingOverlay.style.opacity = "0";
    setTimeout(() => (loadingOverlay.style.opacity = "1"), 50);
    let loadProgress = 0;
    const fill = loadingOverlay.querySelector("#hud_loading_fill");
    const progressTimer = setInterval(() => {
      loadProgress += Math.random() * 4;
      if (loadProgress > 95) loadProgress = 95;
      fill.style.width = loadProgress + "%";
    }, 400);
    function hideLoadingOverlay() {
      clearInterval(progressTimer);
      loadingOverlay.style.opacity = "0";
      setTimeout(() => {
        loadingOverlay.remove();
        if (gear) { gear.style.opacity = "1"; gear.style.pointerEvents = "auto"; }
        if (resizeHandle) { resizeHandle.style.pointerEvents = "auto"; resizeHandle.style.opacity = "0.8"; }
      }, 600);
    }
    // подписка на обновления — при первом пришедшем update скрываем overlay
    channel.subscribe("update", (msg) => {
      const data = msg.data || {};
      renderPayload(data);
      if (document.getElementById("hud_loading_overlay")) hideLoadingOverlay();
    });
  } else {
    // если экран загрузки выключен — активируем HUD сразу
    hud.style.opacity = "0";
    setTimeout(() => { hud.style.transition = "opacity 0.5s ease"; hud.style.opacity = "1"; }, 50);
    
    // подписка на Ably чтобы HUD обновлялся
    channel.subscribe("update", (msg) => {
      const data = msg.data || {};
      renderPayload(data);
    });
  }

  // initial render from saved last data if any
  try {
    const lastSaved = JSON.parse(localStorage.getItem("cs2run_lastData") || "null");
    if (lastSaved) renderPayload(lastSaved);
  } catch {}

  // apply initial display options
  crashVal.style.display = state.showCurrentCrash ? "" : "none";
  bottomRow.style.opacity = state.textOpacity;
  applyThemeToElement(hud, state.theme);

  if (state.collapsed) { hud.style.display = "none"; showRestoreButton(); }

  // expose openSettings (implement the full modal code if you haven't moved it)
  gear.addEventListener("click", openSettings);

function openSettings() {
  const backdrop = document.createElement("div");
  backdrop.className = "cs-settings-backdrop";

  const modal = document.createElement("div");
  modal.className = "cs-settings";
  if (state.theme === "dark") modal.classList.add("dark");

  modal.innerHTML = `
    <h3 style="margin-top:0;">⚙️ Настройки HUD</h3>

    <div class="cs-row">
      <label>Отображать экран загрузки:</label>
      <input type="checkbox" id="showLoadingScreen" ${state.showLoadingScreen ? "checked" : ""}>
    </div>

    <div class="cs-row">
      <label>Показывать текущий коэффициент:</label>
      <input type="checkbox" id="showCurrentCrash" ${state.showCurrentCrash ? "checked" : ""}>
    </div>

    <div class="cs-row">
      <label>Показать пинг:</label>
      <input type="checkbox" id="showPing" ${state.showPing ? "checked" : ""}>
    </div>

    <div class="cs-row">
      <label>Показать загрузку CPU:</label>
      <input type="checkbox" id="showCpu" ${state.showCpu ? "checked" : ""}>
    </div>

    <div class="cs-row">
      <label>Прозрачность фона:</label>
      <input type="range" id="bgOpacity" min="0" max="1" step="0.05" value="${state.bgOpacity}">
    </div>

    <div class="cs-row">
      <label>Тема:</label>
      <select id="theme">
        <option value="auto" ${state.theme === "auto" ? "selected" : ""}>Авто</option>
        <option value="dark" ${state.theme === "dark" ? "selected" : ""}>Тёмная</option>
        <option value="light" ${state.theme === "light" ? "selected" : ""}>Светлая</option>
      </select>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:14px;gap:10px;">
      <button id="saveSettings">💾 Сохранить</button>
      <button id="closeSettings">✖ Закрыть</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  modal.querySelector("#closeSettings").onclick = () => backdrop.remove();
  modal.querySelector("#saveSettings").onclick = () => {
    state.showLoadingScreen = modal.querySelector("#showLoadingScreen").checked;
    state.showCurrentCrash = modal.querySelector("#showCurrentCrash").checked;
    state.showPing = modal.querySelector("#showPing").checked;
    state.showCpu = modal.querySelector("#showCpu").checked;
    state.bgOpacity = parseFloat(modal.querySelector("#bgOpacity").value);
    state.theme = modal.querySelector("#theme").value;
    saveState(state);
    backdrop.remove();
    location.reload();
  };
}


})();