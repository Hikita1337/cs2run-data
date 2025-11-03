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
    bgOpacity: 0.15, theme: "auto",
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
      el.style.color = `rgba(230,230,230,1)`;
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
  @keyframes cs_highlight {
    0% { transform: scale(1.03); filter: brightness(1.15); opacity: 0.9; }
    100% { transform: scale(1); filter: brightness(1); opacity: 1; }
  }
  .cs-highlight { animation: cs_highlight .5s ease; }
  .cs-settings-backdrop { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; z-index: 1000001; background: rgba(0,0,0,0.25); }
  .cs-settings { width: 46vw; max-width: 720px; min-width: 320px; height: 52vh; background: rgba(255,255,255,0.98); border-radius: 12px; padding: 14px; box-shadow: 0 6px 30px rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:10px; box-sizing: border-box; }
  .cs-settings.dark { background: rgba(28,28,30,0.98); color: #EEE; }
  .cs-row { display:flex; align-items:center; gap:10px; justify-content:space-between; }
  .cs-row label { font-size:13px; }
  .cs-gear { position:absolute; right:10px; top:8px; cursor:pointer; user-select:none; }

  /* --- стили тумблеров iOS --- */
  .ios-toggle {
    appearance: none;
    width: 38px;
    height: 20px;
    background: #ccc;
    border-radius: 10px;
    position: relative;
    outline: none;
    cursor: pointer;
    transition: background 0.25s ease;
  }
  .ios-toggle::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    transition: transform 0.25s ease;
  }
  .ios-toggle:checked {
    background: #34C759;
  }
  .ios-toggle:checked::before {
    transform: translateX(18px);
  }
/* --- поля ввода и выбора --- */
.cs-settings select, 
.cs-settings input[type="number"] {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  padding: 2px 6px;
  color: inherit;
  font-size: 13px;
  height: 24px;
  transition: border-color 0.2s ease, background 0.2s ease;
}

/* Тёмная тема — мягкая рамка */
.cs-settings.dark select, 
.cs-settings.dark input[type="number"] {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
}

/* Светлая тема — чёткая рамка */
.cs-settings:not(.dark) select, 
.cs-settings:not(.dark) input[type="number"] {
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(0,0,0,0.15);
  color: #111;
}

/* При фокусе (нажатии) — подсветка */
.cs-settings select:focus, 
.cs-settings input[type="number"]:focus {
  outline: none;
  border-color: #007AFF;
}


  @media (max-width: 600px) {
    .cs-settings { width: 86vw; height: 60vh; }
    hud { width: 92vw !important; left: 4vw !important; }
    
  
    
  }
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
loadingOverlay.style.top = "0";
loadingOverlay.style.left = "0";
loadingOverlay.style.width = "100%";
loadingOverlay.style.height = "100%";
loadingOverlay.style.marginTop = "35px"; // смещение вниз, чтобы не перекрывал шапку
loadingOverlay.style.display = "flex";
loadingOverlay.style.flexDirection = "column";
loadingOverlay.style.alignItems = "center";
loadingOverlay.style.justifyContent = "center";
loadingOverlay.style.backdropFilter = "blur(80px)";
loadingOverlay.style.webkitBackdropFilter = "blur(80px)";
loadingOverlay.style.background = "rgba(0,0,0,0.8)";
loadingOverlay.style.borderRadius = "10px";
loadingOverlay.style.transition = "opacity 0.6s ease";
loadingOverlay.style.zIndex = "1000002";
    loadingOverlay.style.background = "rgba(0,0,0,0.94)"; // почти полностью чёрный
loadingOverlay.style.backdropFilter = "blur(80px) brightness(0.5)";
loadingOverlay.style.webkitBackdropFilter = "blur(80px) brightness(0.5)";
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
  <div id="hud_loading_inner"
       style="display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;height:100%;justify-content:center;transform-origin:center;">
    <img src="https://cs2run.bet/img/crash/begun-v-1.gif"
         id="hud_loading_gif"
         style="width:130px;height:auto;filter:drop-shadow(0 0 10px rgba(0,0,0,0.4));transition:transform 0.2s ease;">
    <div id="hud_loading_text"
         style="font-size:17px;color:white;font-weight:600;text-shadow:0 1px 6px rgba(0,0,0,0.6);transition:transform 0.2s ease;">Ждём завершения игры…</div>
    <div id="hud_loading_bar_container"
         style="width:260px;height:10px;background:rgba(255,255,255,0.25);border-radius:8px;overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,0.3);transition:transform 0.2s ease;">
      <div id="hud_loading_fill"
           style="height:100%;width:0%;background:linear-gradient(90deg,#34C759,#FFD60A);transition:width 0.3s linear;"></div>
    </div>
  </div>
`;
// Автоматическое масштабирование элементов загрузочного экрана
const updateLoadingScale = () => {
  const baseWidth = 360; // базовая ширина HUD по умолчанию
  const currentWidth = hud.offsetWidth;
  const scale = Math.max(0.6, Math.min(1.2, currentWidth / baseWidth)); // ограничиваем масштаб 0.6–1.2

  const inner = loadingOverlay.querySelector("#hud_loading_inner");
  if (inner) inner.style.transform = `scale(${scale})`;
};

// следим за изменением размеров HUD
const resizeObserver = new ResizeObserver(() => updateLoadingScale());
resizeObserver.observe(hud);

// применяем при первом показе
updateLoadingScale();
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
// 🧩 Починка: включаем кнопки, если экран загрузки выключен
setTimeout(() => {
  if (!state.showLoadingScreen) {
    requestAnimationFrame(() => {
      gear.style.opacity = "1";
      gear.style.pointerEvents = "auto";
      resizeHandle.style.opacity = "0.8";
      resizeHandle.style.pointerEvents = "auto";
    });
  }
}, 500);

// вспомогательные переменные и функции для настроек
let settingsBackdrop = null;
let settingsModal = null;
let tempState = null;

// базовый стиль кнопок
const baseBtnStyle = `
  flex:1;
  padding:8px 0;
  border:none;
  border-radius:6px;
  cursor:pointer;
  font-weight:600;
  font-size:13px;
`;

// функция создания переключателя
function createToggleRow(labelText, key) {
  const row = document.createElement("div");
  row.className = "cs-row";

  const label = document.createElement("label");
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "ios-toggle";
  input.checked = tempState[key] ?? true;
  input.onchange = () => (tempState[key] = input.checked);

  row.append(label, input);
  return row;
}

// функция закрытия настроек
function closeSettings() {
  if (!settingsBackdrop) return;
  settingsBackdrop.remove();
  settingsBackdrop = null;
  settingsModal = null;
}

function openSettings() {
  if (settingsBackdrop) return;
  tempState = { ...state };

  settingsBackdrop = document.createElement("div");
  settingsBackdrop.className = "cs-settings-backdrop";

  settingsModal = document.createElement("div");
  settingsModal.className = "cs-settings";
  settingsModal.style.position = "relative";

  // применяем тему вручную
  if (state.theme === "dark") {
    settingsModal.classList.add("dark");
    settingsModal.style.background = "rgba(28,28,30,0.98)";
    settingsModal.style.color = "#EEE";
  } else if (state.theme === "light") {
    settingsModal.style.background = "rgba(255,255,255,0.95)";
    settingsModal.style.color = "#1C1C1E";
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDark) {
      settingsModal.classList.add("dark");
      settingsModal.style.background = "rgba(28,28,30,0.98)";
      settingsModal.style.color = "#EEE";
    } else {
      settingsModal.style.background = "rgba(255,255,255,0.95)";
      settingsModal.style.color = "#1C1C1E";
    }
  }

  // --- Заголовок ---
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.innerHTML = `<div style="font-weight:700">Настройки HUD</div><div style="font-size:12px;color:#888">v2.0</div>`;
  settingsModal.appendChild(header);

// --- Тема ---
const rowTheme = document.createElement("div");
rowTheme.className = "cs-row";

const labelTheme = document.createElement("label");
labelTheme.textContent = "Тема";

const selTheme = document.createElement("select");

// Унифицированный стиль выбора темы (такой же, как у выбора "Обычный / Кастомный")
Object.assign(selTheme.style, {
  width: "110px",
  marginLeft: "8px",
  borderRadius: "6px",
  padding: "2px 6px",
  fontSize: "13px",
  height: "26px",
  cursor: "pointer",
  appearance: "none",
  transition: "border-color 0.2s ease, background 0.2s ease, color 0.2s ease",
  background: state.theme === "dark"
    ? "rgba(255,255,255,0.08)"
    : "rgba(255,255,255,0.9)",
  color: state.theme === "dark" ? "#fff" : "#111",
  border: state.theme === "dark"
    ? "1px solid rgba(255,255,255,0.15)"
    : "1px solid rgba(0,0,0,0.25)",
  boxShadow: state.theme === "light"
    ? "0 1px 2px rgba(0,0,0,0.1)"
    : "inset 0 0 0 1px rgba(255,255,255,0.08)",
  WebkitTextFillColor: state.theme === "dark" ? "#fff" : "#111", // 👈 важно для Safari
});

// hover эффект — лёгкое выделение рамки
selTheme.onmouseenter = () => {
  selTheme.style.borderColor = "#007AFF";
};
selTheme.onmouseleave = () => {
  selTheme.style.borderColor = state.theme === "dark"
    ? "rgba(255,255,255,0.15)"
    : "rgba(0,0,0,0.25)";
};

// варианты выбора
["auto", "light", "dark"].forEach(t => {
  const opt = document.createElement("option");
  opt.value = t;
  opt.textContent =
    t === "auto" ? "Авто" :
    t === "light" ? "Светлая" :
    "Тёмная";
  if (tempState.theme === t) opt.selected = true;
  selTheme.appendChild(opt);
});

// 🔥 Мгновенное применение темы при выборе
selTheme.onchange = () => {
  tempState.theme = selTheme.value;
  applyThemeToElement(hud, selTheme.value); // сразу перекрашивает HUD

  // Обновляем тему окна настроек сразу (без "Применить")
  if (selTheme.value === "dark") {
    settingsModal.classList.add("dark");
    settingsModal.style.background = "rgba(28,28,30,0.98)";
    settingsModal.style.color = "#EEE";
  } else if (selTheme.value === "light") {
    settingsModal.classList.remove("dark");
    settingsModal.style.background = "rgba(255,255,255,0.95)";
    settingsModal.style.color = "#1C1C1E";
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    settingsModal.classList.toggle("dark", prefersDark);
    settingsModal.style.background = prefersDark
      ? "rgba(28,28,30,0.98)"
      : "rgba(255,255,255,0.95)";
    settingsModal.style.color = prefersDark ? "#EEE" : "#1C1C1E";
  }
};

rowTheme.append(labelTheme, selTheme);
settingsModal.appendChild(rowTheme);

  // --- Прозрачность HUD ---
const rowOpacity = document.createElement("div");
rowOpacity.className = "cs-row";
const labelOpacity = document.createElement("label");
labelOpacity.textContent = "Прозрачность HUD";

const sliderOpacity = document.createElement("input");
sliderOpacity.type = "range";
sliderOpacity.min = "0.05";
sliderOpacity.max = "1";
sliderOpacity.step = "0.05";
sliderOpacity.value = tempState.bgOpacity ?? 0.15;
sliderOpacity.style.width = "45%"; // ← уменьшено на 20% (было 100%)
sliderOpacity.oninput = () => {
  tempState.bgOpacity = parseFloat(sliderOpacity.value);
  applyThemeToElement(hud, tempState.theme);
};

rowOpacity.append(labelOpacity, sliderOpacity);
settingsModal.appendChild(rowOpacity);
  
  // --- Новый переключатель: Экран загрузки ---
  const rowLoading = document.createElement("div");
  rowLoading.className = "cs-row";
  const labelLoading = document.createElement("label");
  labelLoading.textContent = "Экран загрузки (вкл/выкл)";
  const toggleLoading = document.createElement("input");
  toggleLoading.type = "checkbox";
  toggleLoading.className = "ios-toggle";
  toggleLoading.checked = tempState.showLoadingScreen ?? true;
  toggleLoading.onchange = () => tempState.showLoadingScreen = toggleLoading.checked;
  rowLoading.append(labelLoading, toggleLoading);
  settingsModal.appendChild(rowLoading);

  // --- Остальные тумблеры ---
  const rowPing = createToggleRow("Показать пинг", "showPing");
  const rowCpu = createToggleRow("Показать CPU", "showCpu");
  const rowCrash = createToggleRow("Показать текущий коэффициент", "showCurrentCrash");
  settingsModal.append(rowPing, rowCpu, rowCrash);

// --- Автоучастие в розыгрыше ---
const rowAutoRaffle = document.createElement("div");
rowAutoRaffle.className = "cs-row";

const labelAutoRaffle = document.createElement("label");
labelAutoRaffle.textContent = "Автоучастие в розыгрыше";

const toggleAutoRaffle = document.createElement("input");
toggleAutoRaffle.type = "checkbox";
toggleAutoRaffle.className = "ios-toggle";
toggleAutoRaffle.checked = tempState.autoRaffle ?? false;
toggleAutoRaffle.onchange = () => tempState.autoRaffle = toggleAutoRaffle.checked;

rowAutoRaffle.append(labelAutoRaffle, toggleAutoRaffle);
settingsModal.appendChild(rowAutoRaffle);

// --- Режим автоучастия ---
const rowRaffleMode = document.createElement("div");
rowRaffleMode.className = "cs-row";
const labelRaffleMode = document.createElement("label");
labelRaffleMode.textContent = "Режим автоучастия";

const selectRaffleMode = document.createElement("select");
selectRaffleMode.style.width = "110px";
selectRaffleMode.style.padding = "2px 6px";
selectRaffleMode.style.borderRadius = "6px";

["normal", "custom"].forEach(v => {
  const opt = document.createElement("option");
  opt.value = v;
  opt.textContent = v === "normal" ? "Обычный" : "Кастомный";
  if (tempState.raffleMode === v) opt.selected = true;
  selectRaffleMode.appendChild(opt);
});
selectRaffleMode.onchange = () => {
  tempState.raffleMode = selectRaffleMode.value;
  updateCustomFieldsVisibility();
};
rowRaffleMode.append(labelRaffleMode, selectRaffleMode);
settingsModal.appendChild(rowRaffleMode);

// --- Информационный блок для кастомного режима ---
const customInfo = document.createElement("div");
customInfo.style.textAlign = "center";
customInfo.style.fontSize = "12.5px";
customInfo.style.opacity = "0.9";
customInfo.style.margin = "4px 0 6px 0";
customInfo.style.fontWeight = "500";
customInfo.textContent = "🕓 Промежуток, в котором будет принято участие";
settingsModal.appendChild(customInfo);

// --- После начала (для кастомного режима) ---
const rowAfterStart = document.createElement("div");
rowAfterStart.className = "cs-row";
const labelAfterStart = document.createElement("label");
labelAfterStart.textContent = "После начала (минуты)";
const inputAfterStart = document.createElement("input");
inputAfterStart.type = "number";
inputAfterStart.min = 0;
inputAfterStart.max = 25;
inputAfterStart.value = tempState.customAfterStart ?? 10;
inputAfterStart.style.width = "70px";
inputAfterStart.oninput = () => tempState.customAfterStart = Number(inputAfterStart.value);
rowAfterStart.append(labelAfterStart, inputAfterStart);
settingsModal.appendChild(rowAfterStart);

// --- До конца (для кастомного режима) ---
const rowBeforeEnd = document.createElement("div");
rowBeforeEnd.className = "cs-row";
const labelBeforeEnd = document.createElement("label");
labelBeforeEnd.textContent = "До конца (минуты)";
const inputBeforeEnd = document.createElement("input");
inputBeforeEnd.type = "number";
inputBeforeEnd.min = 0;
inputBeforeEnd.max = 25;
inputBeforeEnd.value = tempState.customBeforeEnd ?? 10;
inputBeforeEnd.style.width = "70px";
inputBeforeEnd.oninput = () => tempState.customBeforeEnd = Number(inputBeforeEnd.value);
rowBeforeEnd.append(labelBeforeEnd, inputBeforeEnd);
settingsModal.appendChild(rowBeforeEnd);

// --- Подсказка под блоком ---
const noteAutoRaffle = document.createElement("div");
noteAutoRaffle.textContent = "Обычный режим — раз в 30 мин ± 1 мин.";
noteAutoRaffle.style.fontSize = "11.5px";
noteAutoRaffle.style.opacity = "0.8";
noteAutoRaffle.style.margin = "-4px 0 6px 2px";
settingsModal.appendChild(noteAutoRaffle);

// --- Управление видимостью полей ---
function updateCustomFieldsVisibility() {
  const isCustom = selectRaffleMode.value === "custom";
  customInfo.style.display = isCustom ? "block" : "none";
  rowAfterStart.style.display = isCustom ? "flex" : "none";
  rowBeforeEnd.style.display = isCustom ? "flex" : "none";
}
updateCustomFieldsVisibility();



  // --- Кнопки управления ---
  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "space-between";
  actions.style.marginTop = "auto";
  actions.style.gap = "10px";

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Сброс";
  resetBtn.style.cssText = baseBtnStyle + "background:#FF3B30;color:#fff;";
  resetBtn.onclick = () => {
    if (!confirm("Сбросить настройки к значениям по умолчанию? HUD перезагрузится.")) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  };

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Закрыть";
  closeBtn.style.cssText = baseBtnStyle + "background:#999;color:#fff;";
  closeBtn.onclick = () => closeSettings();

  const applyBtn = document.createElement("button");
  applyBtn.textContent = "Применить";
  applyBtn.style.cssText = baseBtnStyle + "background:#34C759;color:#fff;";
  applyBtn.onclick = () => {
  state = { ...state, ...tempState };
  saveState(state);

  // Применяем изменения "на лету"
  applyThemeToElement(hud, state.theme);
  crashVal.style.display = state.showCurrentCrash ? "" : "none";
  refreshPerfVisibility();

  // Мгновенно скрываем/показываем экран загрузки при включении/выключении
  const overlay = document.getElementById("hud_loading_overlay");
  if (overlay && !state.showLoadingScreen) overlay.remove();

  // Мягкое уведомление "Настройки сохранены"
const toast = document.createElement("div");
toast.textContent = "✅ Настройки сохранены";

// Добавляем внутрь HUD (чтобы позиционировалось относительно него)
document.body.appendChild(toast);

// Стили аккуратного уведомления
toast.style.position = "fixed";
toast.style.top = "50%";
toast.style.left = "50%";
toast.style.transform = "translate(-50%, -50%) scale(0.95)";
toast.style.background = "rgba(0,0,0,0.6)";
toast.style.color = "#fff";
toast.style.padding = "6px 12px";
toast.style.borderRadius = "6px";
toast.style.fontWeight = "500";
toast.style.fontSize = "12.5px";
toast.style.zIndex = "1000005";
toast.style.opacity = "0";
toast.style.transition = "opacity 0.35s ease, transform 0.35s ease";
toast.style.pointerEvents = "none";
toast.style.textAlign = "center";
toast.style.backdropFilter = "blur(4px)";
toast.style.webkitBackdropFilter = "blur(4px)";
toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";

// Анимация появления и исчезновения
requestAnimationFrame(() => {
  toast.style.opacity = "1";
  toast.style.transform = "translate(-50%, -50%) scale(1)";
});
setTimeout(() => {
  toast.style.opacity = "0";
  toast.style.transform = "translate(-50%, -50%) scale(0.95)";
  setTimeout(() => toast.remove(), 400);
}, 1600);
}; // ← закрывает applyBtn.onclick

// ⬇️ Всё, что ниже — уже вне функции
actions.append(resetBtn, closeBtn, applyBtn);
settingsModal.appendChild(actions);

settingsBackdrop.appendChild(settingsModal);
document.body.appendChild(settingsBackdrop);
}
// =============================
// 🧩 Автоучастие в розыгрыше (с повторными попытками)
// =============================
if (state.autoRaffle) {
  console.log("🎁 Автоучастие в розыгрыше активно");

  // === Получение текущего розыгрыша ===
  async function fetchCurrentRaffle() {
    try {
      const res = await fetch("https://cs2run.app/lottery/state?mode=1", { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось получить состояние розыгрыша");
      const data = await res.json();
      return data?.round ?? null;
    } catch (err) {
      console.warn("⚠️ Ошибка получения розыгрыша:", err);
      return null;
    }
  }

  // === Участие в розыгрыше с повторными попытками ===
  async function joinRaffle(lotteryId, attempt = 1) {
    try {
      const res = await fetch("https://cs2run.app/lottery/join", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotteryId })
      });

      if (res.ok) {
        console.log(`✅ Участие в розыгрыше #${lotteryId} принято (попытка ${attempt})`);
        showToast("✅ Участие в розыгрыше принято!");
        return true;
      } else {
        const txt = await res.text();
        console.warn(`❌ Попытка ${attempt} не удалась: ${txt}`);
      }
    } catch (err) {
      console.error(`⚠️ Ошибка при попытке ${attempt}:`, err);
    }

    // Повтор через минуту, максимум 5 попыток
    if (attempt < 5) {
      console.log(`🔁 Повторная попытка через 60 секунд (попытка ${attempt + 1}/5)...`);
      setTimeout(() => joinRaffle(lotteryId, attempt + 1), 60_000);
    } else {
      console.warn("🚫 Лимит повторов исчерпан, ждём следующий розыгрыш");
    }
    return false;
  }

  // === Вспомогательная функция уведомления ===
  function showToast(text) {
    const toast = document.createElement("div");
    toast.textContent = text;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.75)",
      color: "#fff",
      padding: "8px 16px",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      zIndex: "1000006",
      opacity: "0",
      transition: "opacity 0.3s ease"
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = "1");
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 2000);
  }

  // === Главный цикл автоучастия ===
  async function handleRaffleLoop() {
    const raffle = await fetchCurrentRaffle();
    if (!raffle) {
      console.log("⏳ Нет активного розыгрыша, повтор через 1 мин...");
      setTimeout(handleRaffleLoop, 60_000);
      return;
    }

    const { startAt, finishAt, lotteryId } = raffle;
    const start = new Date(startAt).getTime();
    const end = new Date(finishAt).getTime();
    const now = Date.now();

    const mode = state.raffleMode ?? "normal";

    if (mode === "normal") {
      console.log("🕓 Режим: обычный (раз в 30 мин ±1)");
      const baseMs = 30 * 60_000;
      const offset = (Math.random() * 120_000) - 60_000;
      await joinRaffle(lotteryId);
      setTimeout(handleRaffleLoop, baseMs + offset);
      return;
    }

    // === Кастомный режим ===
    const afterStartMin = Math.max(0, state.customAfterStart ?? 10);
    const beforeEndMin = Math.max(0, state.customBeforeEnd ?? 10);

    const joinWindowStart = start + afterStartMin * 60_000;
    const joinWindowEnd = end - beforeEndMin * 60_000;

    if (now >= joinWindowEnd) {
      console.log("⌛ Окно участия уже прошло, ждём следующий розыгрыш…");
      setTimeout(handleRaffleLoop, 60_000);
      return;
    }

    const minDelay = Math.max(0, joinWindowStart - now);
    const maxDelay = Math.max(minDelay, joinWindowEnd - now);
    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;

    const delayMin = (randomDelay / 60000).toFixed(1);
    console.log(`🎯 Участвуем через ${delayMin} мин (окно: +${afterStartMin} / -${beforeEndMin})`);

    setTimeout(async () => {
      const ok = await joinRaffle(lotteryId);
      if (ok) console.log("🎉 Успешное участие — ждём следующий розыгрыш.");
      handleRaffleLoop();
    }, randomDelay);
  }

  handleRaffleLoop();
}
})();