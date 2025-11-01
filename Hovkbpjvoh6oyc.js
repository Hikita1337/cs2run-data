// ==UserScript==
// @name         CS2Run HUD (Омск, финальный)
// @namespace    cs2run.hud
// @version      2.0
// @description  HUD статистики CS2Run — омское время, настройки, подсветка коэффициента, перетаскивание, ресайз, прогресс/ожидание
// @match        *://cs2run.bet/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(async () => {
  const ABLY_PUBLIC_KEY = "OPAt8A.dMkrwA:A9niPpJUrzV7J62AKvitMDaExAN6wJkJ_P1EnQ8Ya9Y";
  // --- load Ably if missing ---
  if (!window.Ably) {
    const s = document.createElement("script");
    s.src = "https://cs2run-server.onrender.com/ably.min.js";
    document.head.appendChild(s);
    await new Promise((res, rej) => { s.onload = res; s.onerror = () => rej("Failed load Ably"); });
  }

  const client = new Ably.Realtime(ABLY_PUBLIC_KEY);
  const channel = client.channels.get("cs2run");

  // ------------------------------
  // Defaults & storage helpers
  // ------------------------------
  const LS_KEY = "cs2run_hud_state_v2";
  const defaults = {
  top: 20,
  left: 20,
  width: 360,
  height: 200,
  bgOpacity: 0.15,
  textOpacity: 1.0,
  theme: "auto",
  showPing: true,
  showCpu: true,
  showCurrentCrash: true,
  collapsed: false
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

  // ------------------------------
  // Utility
  // ------------------------------
  function fmtOmskTime(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("ru-RU", {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "Asia/Omsk"
      });
    } catch {
      return "—";
    }
  }

  function applyThemeToElement(el, theme) {
    if (theme === "dark") {
  el.style.background = `rgba(20,20,20,${state.bgOpacity})`;
  el.style.color = `rgba(230,230,230,${state.textOpacity})`;
  el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.6)";
  
  // 👉 Добавляем подсветку нижней строки в белый цвет
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
      // auto -> match page background brightness (simple heuristic)
      const bg = getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
      // try to parse brightness
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      let bright = 255;
      if (m) bright = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
      if (bright < 128) applyThemeToElement(el, "dark"); else applyThemeToElement(el, "light");
    }
  }

  // ------------------------------
  // Create HUD container
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
  // apply theme-based coloring
  applyThemeToElement(hud, state.theme);

  // append
  document.body.appendChild(hud);

  // --- Экран ожидания при первом запуске ---
const loadingOverlay = document.createElement("div");
loadingOverlay.id = "hud_loading_overlay";
loadingOverlay.style.position = "fixed";
loadingOverlay.style.inset = "0";
loadingOverlay.style.background = "rgba(0,0,0,0.75)";
loadingOverlay.style.display = "flex";
loadingOverlay.style.flexDirection = "column";
loadingOverlay.style.alignItems = "center";
loadingOverlay.style.justifyContent = "center";
loadingOverlay.style.gap = "20px";
loadingOverlay.style.zIndex = "1000002";
loadingOverlay.style.transition = "opacity 0.6s ease";

loadingOverlay.innerHTML = `
  <img src="https://cs2run.bet/img/crash/begun-v-1.gif" style="width:120px;height:auto;">
  <div style="font-size:16px;color:white;font-weight:600;">Ждём завершения игры…</div>
  <div style="width:240px;height:10px;background:rgba(255,255,255,0.2);border-radius:8px;overflow:hidden;">
    <div id="hud_loading_fill" style="height:100%;width:0%;background:linear-gradient(90deg,#34C759,#FFD60A);transition:width 0.3s linear;"></div>
  </div>
`;

document.body.appendChild(loadingOverlay);

// Анимация заполнения прогресс-бара
let loadProgress = 0;
const fill = loadingOverlay.querySelector("#hud_loading_fill");
const progressTimer = setInterval(() => {
  loadProgress += Math.random() * 4; // случайное ускорение
  if (loadProgress > 95) loadProgress = 95;
  fill.style.width = loadProgress + "%";
}, 400);

// Функция скрытия оверлея после получения данных
function hideLoadingOverlay() {
  clearInterval(progressTimer);
  loadingOverlay.style.opacity = "0";
  setTimeout(() => loadingOverlay.remove(), 600);
}

  // ------------------------------
  // Style & animations
  // ------------------------------
  const style = document.createElement("style");
  style.textContent = `
    /* highlight animation for crash value */
    @keyframes cs_highlight {
      0% { transform: scale(1.03); filter: brightness(1.15); opacity:0.9 }
      100% { transform: scale(1); filter: brightness(1); opacity:1 }
    }
    .cs-highlight { animation: cs_highlight .5s ease; }

    /* settings modal */
    .cs-settings-backdrop {
      position: fixed; inset: 0; display:flex; align-items:center; justify-content:center;
      z-index: 1000001;
      background: rgba(0,0,0,0.25);
    }
    .cs-settings {
      width: 46vw; max-width: 720px; min-width: 320px; height: 52vh;
      background: rgba(255,255,255,0.98); border-radius: 12px; padding: 14px;
      box-shadow: 0 6px 30px rgba(0,0,0,0.4); display:flex; flex-direction:column;
      gap:10px; box-sizing: border-box;
    }
    .cs-settings.dark { background: rgba(28,28,30,0.98); color: #EEE; }
    .cs-row { display:flex; align-items:center; gap:10px; justify-content:space-between; }
    .cs-row label { font-size:13px; }
    .cs-slider { width: 60%; }
    .cs-gear { position:absolute; right:10px; top:8px; cursor:pointer; user-select:none; }
    .cs-collapse-btn {
      position: fixed; right: 10px; top: 10px; z-index:1000002;
      width:36px; height:36px; display:flex; align-items:center; justify-content:center;
      border-radius:8px; background: rgba(0,0,0,0.6); color: #fff; cursor:pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .cs-progress-overlay {
      position:absolute; inset:0; display:flex;align-items:center;justify-content:center;
      background: rgba(0,0,0,0.15); z-index: 20; flex-direction:column; gap:8px;
    }
    .cs-progress-bar {
      width: 80%; height: 8px; background: rgba(255,255,255,0.25); border-radius: 6px; overflow:hidden;
    }
    .cs-progress-fill {
      height:100%; width:0%; background: linear-gradient(90deg,#34c759,#ffd60a); transition: width 0.3s linear;
    }
    @media (max-width: 600px) {
      .cs-settings { width: 86vw; height: 60vh; }
      hud { width: 92vw !important; left: 4vw !important; }
    }
  `;
  document.head.appendChild(style);

  // ------------------------------
  // HUD inner structure
  // ------------------------------
  const topRow = document.createElement("div");
  topRow.style.display = "flex";
  topRow.style.justifyContent = "space-between";
  topRow.style.alignItems = "center";
topRow.style.marginTop = "-6px";    // поднимает чуть выше
topRow.style.marginLeft = "-4px";   // смещает левее

  const titleEl = document.createElement("div");
  titleEl.innerHTML = `<span style="font-weight:700;font-size:15px;">🎯 CS2Run</span> <span style="color:#007AFF;font-weight:600;font-size:13px;">(live)</span>`;
  topRow.appendChild(titleEl);

  const rightControls = document.createElement("div");
  rightControls.style.display = "flex";
  rightControls.style.alignItems = "center";
  rightControls.style.gap = "8px";

  // current crash element (to be updated)
  // --- Заголовок с коэффициентом справа от "CS2Run (live)" ---
const crashVal = document.createElement("span");
crashVal.id = "cs_crash_val";
crashVal.style.marginLeft = "8px"; // примерно 0.4 см
crashVal.style.fontWeight = "700";
crashVal.style.fontSize = "16px";
crashVal.style.transition = "all .3s ease";

// добавляем его прямо в ту же строку, что и "(live)"
titleEl.appendChild(crashVal);

  // gear/settings button
  const gear = document.createElement("div");
  gear.className = "cs-gear";
  gear.textContent = "⚙️";
  gear.title = "Настройки HUD";
  gear.style.cursor = "pointer";
  rightControls.appendChild(gear);

  topRow.appendChild(rightControls);
  hud.appendChild(topRow);

  // main stats area
  const statsArea = document.createElement("div");
  statsArea.style.display = "flex";
  statsArea.style.flexDirection = "column";
  statsArea.style.flex = "1 1 auto";
  statsArea.style.gap = "6px";
  statsArea.style.overflow = "hidden";
  hud.appendChild(statsArea);

  // stats rows
  const line = (label, id) => {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.fontSize = "13px";
  el.style.gap = "6px"; // расстояние между текстом и числом
  el.innerHTML = `<div style="opacity:.9">${label}</div><div id="${id}" style="font-weight:700"></div>`;
  return el;
};

  const avg10El = line("📊 10 игр —", "cs_avg10");
  const avg25El = line("📊 25 игр —", "cs_avg25");
  const avg50El = line("📊 50 игр —", "cs_avg50");
  const avgTotalEl = line("📈 Среднее", "cs_totalAvg");
  const max24hEl = line('🔥 Макс за сутки:', 'cs_max24h');
  statsArea.appendChild(avg10El);
  statsArea.appendChild(avg25El);
  statsArea.appendChild(avg50El);
  statsArea.appendChild(document.createElement("hr"));
  statsArea.appendChild(avgTotalEl);
  statsArea.appendChild(max24hEl);

  // bottom row (ping/cpu/updated)
  const bottomRow = document.createElement("div");
  bottomRow.style.display = "flex";
  bottomRow.style.justifyContent = "space-between";
  bottomRow.style.alignItems = "center";
  bottomRow.style.fontSize = "12px";
  bottomRow.style.color = "rgba(0,0,0,0.65)";
  bottomRow.style.opacity = state.textOpacity;

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
  
  // --- Автоматическое выравнивание нижней строки ---
bottomRow.style.transition = "all 0.3s ease";

// функция обновления положения
function updateBottomLayout() {
  const hasPerf = state.showPing || state.showCpu;

  if (!hasPerf) {
    // оба выключены — тянем обновление влево полностью
    bottomRow.style.justifyContent = "flex-start";
    perfEl.style.display = "none";
    updatedEl.style.marginLeft = "8px";
  } else {
    // если хотя бы один включен — показываем блок и выравниваем равномерно
    perfEl.style.display = "flex";
    bottomRow.style.justifyContent = "space-between";
    updatedEl.style.marginLeft = "0";
  }
}

// вызывать при каждом изменении настроек
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

// заменяем старое место, где создавался perfEl, на вызов этой функции
  
// --- Стеклянный эффект для верхней и нижней панелей ---

// Верхняя панель (topRow)
topRow.style.background = "rgba(255,255,255,0.08)"; // светлая дымка
topRow.style.backdropFilter = "blur(10px)";
topRow.style.webkitBackdropFilter = "blur(10px)";
topRow.style.borderBottom = "1px solid rgba(255,255,255,0.15)";
topRow.style.padding = "6px 10px"; // внутренние отступы внутри панели
topRow.style.borderRadius = "10px 10px 0 0";
topRow.style.margin = "0"; // убираем внешние отступы
topRow.style.width = "100%"; // растягиваем на всю ширину HUD
topRow.style.boxSizing = "border-box";

// Нижняя панель (bottomRow)
bottomRow.style.background = "rgba(255,255,255,0.06)"; // чуть темнее
bottomRow.style.backdropFilter = "blur(10px)";
bottomRow.style.webkitBackdropFilter = "blur(10px)";
bottomRow.style.borderTop = "1px solid rgba(255,255,255,0.12)";
bottomRow.style.padding = "6px 10px";
bottomRow.style.borderRadius = "0 0 10px 10px";
bottomRow.style.margin = "0";
bottomRow.style.width = "100%";
bottomRow.style.boxSizing = "border-box";

// убираем общий внутренний отступ HUD, чтобы панели легли заподлицо
hud.style.padding = "0";

  // progress overlay (hidden by default)
  const progressOverlay = document.createElement("div");
  progressOverlay.className = "cs-progress-overlay";
  progressOverlay.style.display = "none";
  progressOverlay.innerHTML = `<div style="font-weight:700">Ожидание конца игры...</div>
                               <div class="cs-progress-bar"><div class="cs-progress-fill"></div></div>
                               <div id="cs_progress_text" style="font-size:12px;color:rgba(255,255,255,0.95)"></div>`;
  hud.appendChild(progressOverlay);

  

  // ------------------------------
  // Functions to render incoming data
  // ------------------------------
  let lastCrashValue = null;
  let lastPayload = {};

  function colorForCrash(c) {
    if (c == null) return "#007AFF";
    if (c < 1.2) return "#FF3B30";            // red
    if (c < 2) return "#5AC8FA";             // light blue
    if (c < 4) return "#FF2D55";             // pink/red
    if (c < 8) return "#34C759";             // green
    if (c < 25) return "#FFD60A";            // yellow
    return null;                             // gradient handled separately
  }

  function renderPayload(d) {
    // stats: avg10, avg25, avg50, totalAvg, max24h, count, updatedAt, currentPeriod, ping, cpuLoad, lastCrash (optional)
    lastPayload = { ...lastPayload, ...d };

    // numbers might be strings - try to keep formatting
    function formatVal(v) {
  if (v == null || v === "—" || v === "") return "—";
  const num = Number(v);
  return isNaN(num) ? v : num.toFixed(2) + "x";
}

document.getElementById("cs_avg10").textContent = formatVal(lastPayload.avg10);
document.getElementById("cs_avg25").textContent = formatVal(lastPayload.avg25);
document.getElementById("cs_avg50").textContent = formatVal(lastPayload.avg50);
document.getElementById("cs_totalAvg").textContent = formatVal(lastPayload.totalAvg);
document.getElementById("cs_max24h").textContent = formatVal(lastPayload.max24h);
    // perf
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

    // updated
    updatedEl.innerHTML = `🕓 Обновлено (Омск): <b>${fmtOmskTime(lastPayload.updatedAt)}</b>`;

    // crash value (current)
    const crash = (typeof d.lastCrash === "number") ? d.lastCrash : (typeof d.lastCrash === "string" ? Number(d.lastCrash) : (d.lastCrash ?? lastPayload.lastCrash ?? null));
    lastCrashValue = crash;

    if (state.showCurrentCrash) {
      if (crash != null && !Number.isNaN(crash)) {
        const color = colorForCrash(crash);
        if (crash >= 25) {
          // gradient text
          crashVal.style.background = "linear-gradient(90deg,#9b4dff,#3cd3ff)";
          crashVal.style.webkitBackgroundClip = "text";
          crashVal.style.webkitTextFillColor = "transparent";
          crashVal.style.color = "";
        } else {
          crashVal.style.background = "";
          crashVal.style.webkitBackgroundClip = "";
          crashVal.style.webkitTextFillColor = "";
          crashVal.style.color = color || "#007AFF";
        }
        crashVal.textContent = crash.toFixed(2) + "x";
      } else {
        crashVal.textContent = "";
      }
      // highlight animation
      crashVal.classList.remove("cs-highlight");
      void crashVal.offsetWidth;
      crashVal.classList.add("cs-highlight");
    } else {
      crashVal.textContent = "";
    }
  }

  // ------------------------------
  // Progress overlay controls
  // ------------------------------
  let progressInterval = null;
  function showProgressOverlay() {
    progressOverlay.style.display = "flex";
    const fill = progressOverlay.querySelector(".cs-progress-fill");
    fill.style.width = "0%";
    // animate like a live progress (loop)
    let pct = 0;
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      pct += 6 + Math.random() * 8;
      if (pct > 98) pct = 98;
      fill.style.width = pct + "%";
      const txt = progressOverlay.querySelector("#cs_progress_text");
      txt.textContent = `Ожидание ответа... ${Math.round(pct)}%`;
    }, 420);
  }
  function hideProgressOverlayThenShowReceived() {
    // on receive: show "получен ответ от сервера" for 1s then hide overlay
    clearInterval(progressInterval);
    const fill = progressOverlay.querySelector(".cs-progress-fill");
    fill.style.width = "100%";
    const txt = progressOverlay.querySelector("#cs_progress_text");
    txt.textContent = "Получен ответ от сервера";
    setTimeout(() => {
      progressOverlay.style.display = "none";
      fill.style.width = "0%";
      txt.textContent = "";
    }, 1000);
  }

  // ------------------------------
  // Settings modal
  // ------------------------------
  let settingsModal = null;
  let settingsBackdrop = null;
  let tempState = null; // holds staged changes
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
  // auto
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
    // header
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.innerHTML = `<div style="font-weight:700">Настройки HUD</div><div style="font-size:12px;color:#888">v2.0</div>`;
    settingsModal.appendChild(header);

    
    
    
// --- ТЕМА ---
const rowTheme = document.createElement("div");
rowTheme.className = "cs-row";
rowTheme.style.display = "flex";
rowTheme.style.justifyContent = "space-between";
rowTheme.style.alignItems = "center";
rowTheme.style.marginTop = "8px";
rowTheme.style.marginBottom = "4px";

const labelTheme = document.createElement("label");
labelTheme.textContent = "Тема";
labelTheme.style.fontSize = "14px";
labelTheme.style.fontWeight = "500";
labelTheme.style.flex = "1";
labelTheme.style.color = "inherit";

const selTheme = document.createElement("select");
["auto", "light", "dark"].forEach(t => {
  const opt = document.createElement("option");
  opt.value = t;
  opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  if (tempState.theme === t) opt.selected = true;
  selTheme.appendChild(opt);
});
selTheme.onchange = () => tempState.theme = selTheme.value;

// стиль кнопки выбора темы
selTheme.style.flex = "1";
selTheme.style.maxWidth = "130px";   // ширина, чтобы текст полностью помещался
selTheme.style.padding = "6px 10px";
selTheme.style.border = "1px solid rgba(0,0,0,0.2)";
selTheme.style.borderRadius = "8px";
selTheme.style.fontSize = "13px";
selTheme.style.background = "rgba(255,255,255,0.8)";
selTheme.style.color = "#000";
selTheme.style.cursor = "pointer";
selTheme.style.textAlign = "center";

rowTheme.appendChild(labelTheme);
rowTheme.appendChild(selTheme);
settingsModal.appendChild(rowTheme);

// --- ПЕРЕКЛЮЧАТЕЛИ ПИНГ / CPU ---
function createToggleRow(labelText, stateKey) {
  const row = document.createElement("div");
  row.className = "cs-row";
  row.style.display = "flex";
  row.style.justifyContent = "space-between";
  row.style.alignItems = "center";
  row.style.margin = "6px 0";

  const label = document.createElement("label");
  label.textContent = labelText;
  label.style.fontSize = "14px";
  label.style.fontWeight = "500";
  label.style.color = "inherit";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = tempState[stateKey];
  toggle.className = "ios-toggle";
  toggle.onchange = () => tempState[stateKey] = toggle.checked;

  row.appendChild(label);
  row.appendChild(toggle);
  return row;
}

const rowPing = createToggleRow("Показать пинг", "showPing");
const rowCpu = createToggleRow("Показать CPU", "showCpu");

settingsModal.appendChild(rowPing);
settingsModal.appendChild(rowCpu);

// --- iOS стиль для тумблеров ---
const toggleStyle = document.createElement("style");
toggleStyle.textContent = `
  .ios-toggle {
    position: relative;
    width: 46px;
    height: 26px;
    appearance: none;
    -webkit-appearance: none;
    background: #ccc;
    border-radius: 26px;
    outline: none;
    cursor: pointer;
    transition: background 0.25s ease;
  }
  .ios-toggle:checked {
    background: #34C759;
  }
  .ios-toggle::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.25s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .ios-toggle:checked::before {
    transform: translateX(20px);
  }
`;
document.head.appendChild(toggleStyle);

// --- КНОПКИ ДЕЙСТВИЙ ---
// actions (нижние кнопки)
const actions = document.createElement("div");
actions.style.display = "flex";
actions.style.justifyContent = "space-between";
actions.style.marginTop = "auto";
actions.style.gap = "10px";

// стили для кнопок
const baseBtnStyle = `
  flex: 1;
  height: 28px; /* 🔹 тоньше — аккуратный системный размер */
  line-height: 28px;
  border: 1px solid rgba(0,0,0,0.15);
  border-radius: 7px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all .2s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
`;

const resetBtn = document.createElement("button");
resetBtn.textContent = "Сброс настроек";
resetBtn.style.cssText = baseBtnStyle + "background:#FF3B30;color:#fff;";
resetBtn.onmouseover = () => resetBtn.style.filter = "brightness(1.15)";
resetBtn.onmouseout = () => resetBtn.style.filter = "";

const closeBtn = document.createElement("button");
closeBtn.textContent = "Закрыть";
closeBtn.style.cssText = baseBtnStyle + "background:#999;color:#fff;";
closeBtn.onmouseover = () => closeBtn.style.filter = "brightness(1.15)";
closeBtn.onmouseout = () => closeBtn.style.filter = "";

const applyBtn = document.createElement("button");
applyBtn.textContent = "Применить";
applyBtn.style.cssText = baseBtnStyle + "background:#34C759;color:#fff;";
applyBtn.onmouseover = () => applyBtn.style.filter = "brightness(1.15)";
applyBtn.onmouseout = () => applyBtn.style.filter = "";

// события
resetBtn.onclick = () => {
  if (!confirm("Сбросить настройки к значениям по умолчанию? HUD перезагрузится.")) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
};
applyBtn.onclick = () => {
  state = { ...state, ...tempState };
  saveState(state);
  applyThemeToElement(hud, state.theme);

  // применяем сразу на живом HUD
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

  crashVal.style.display = state.showCurrentCrash ? "" : "none";
  bottomRow.style.opacity = state.textOpacity;

  saveState(state);
  closeSettings();
};
closeBtn.onclick = () => closeSettings();

// добавляем кнопки в блок
actions.appendChild(resetBtn);
actions.appendChild(closeBtn);
actions.appendChild(applyBtn);
settingsModal.appendChild(actions);

    // allow dragging the modal
    let modalDrag = null;
    const startModalDrag = (e) => {
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      modalDrag = { x: t.clientX, y: t.clientY, left: settingsModal.offsetLeft, top: settingsModal.offsetTop };
      settingsModal.style.position = "absolute";
    };
    const onModalDrag = (e) => {
      if (!modalDrag) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - modalDrag.x;
      const dy = t.clientY - modalDrag.y;
      settingsModal.style.left = (modalDrag.left + dx) + "px";
      settingsModal.style.top = (modalDrag.top + dy) + "px";
    };
    const stopModalDrag = () => { modalDrag = null; };

    header.addEventListener("mousedown", startModalDrag);
    header.addEventListener("touchstart", startModalDrag);
    document.addEventListener("mousemove", onModalDrag);
    document.addEventListener("touchmove", onModalDrag);
    document.addEventListener("mouseup", stopModalDrag);
    document.addEventListener("touchend", stopModalDrag);

    settingsBackdrop.appendChild(settingsModal);
    document.body.appendChild(settingsBackdrop);
  }

  function closeSettings(removeNode = true) {
    if (!settingsBackdrop) return;
    settingsBackdrop.remove();
    settingsBackdrop = null;
    settingsModal = null;
    tempState = null;
  }

  gear.addEventListener("click", () => {
    if (settingsBackdrop) closeSettings(); else openSettings();
  });

  // ------------------------------
  // Dragging & Resizing HUD
  // ------------------------------
  let dragInfo = null;
  let resizeInfo = null;
  let raf = null;

  const startDrag = (e) => {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    dragInfo = { x: t.clientX, y: t.clientY, left: hud.offsetLeft, top: hud.offsetTop };
  };
  const onDrag = (e) => {
    if (!dragInfo) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - dragInfo.x;
    const dy = t.clientY - dragInfo.y;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      hud.style.left = (dragInfo.left + dx) + "px";
      hud.style.top = (dragInfo.top + dy) + "px";
    });
  };
  const stopDrag = () => {
    if (!dragInfo) return;
    state.left = hud.offsetLeft;
    state.top = hud.offsetTop;
    saveState(state);
    dragInfo = null;
  };

  // attach drag to moveBtn
  // we already have moveBtn icon (moveBtn was earlier but not created - create small area)
  const dragHandle = titleEl; // allow dragging by title
  dragHandle.style.cursor = "grab";
  dragHandle.addEventListener("mousedown", startDrag);
  dragHandle.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);

  // Resize handle (use the resizeBtn created earlier)
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
resizeHandle.style.opacity = "0.8";
  resizeHandle.style.userSelect = "none";
  hud.appendChild(resizeHandle);

  const startResize = (e) => {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    resizeInfo = { x: t.clientX, y: t.clientY, w: hud.offsetWidth, h: hud.offsetHeight };
  };
  const onResize = (e) => {
    if (!resizeInfo) return;
    const t = e.touches ? e.touches[0] : e;
    const dw = t.clientX - resizeInfo.x;
    const dh = t.clientY - resizeInfo.y;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      hud.style.width = Math.max(200, resizeInfo.w + dw) + "px";
      hud.style.height = Math.max(120, resizeInfo.h + dh) + "px";
    });
  };
  const stopResize = () => {
    if (!resizeInfo) return;
    state.width = hud.offsetWidth;
    state.height = hud.offsetHeight;
    saveState(state);
    resizeInfo = null;
  };

  resizeHandle.addEventListener("mousedown", startResize);
  resizeHandle.addEventListener("touchstart", startResize, { passive: false });
  document.addEventListener("mousemove", onResize);
  document.addEventListener("touchmove", onResize, { passive: false });
  document.addEventListener("mouseup", stopResize);
  document.addEventListener("touchend", stopResize);

// --- Кнопка сворачивания HUD ---
const collapseIcon = document.createElement("div");
collapseIcon.textContent = "—"; // жирный минус
collapseIcon.style.fontSize = "18px";
collapseIcon.style.fontWeight = "900";
collapseIcon.style.cursor = "pointer";
collapseIcon.style.marginRight = "27px"; // чуть левее от gear
collapseIcon.style.userSelect = "none";
collapseIcon.style.opacity = "0.9";
collapseIcon.style.transition = "opacity 0.2s ease";
collapseIcon.title = "Свернуть HUD";

collapseIcon.onmouseenter = () => collapseIcon.style.opacity = "1";
collapseIcon.onmouseleave = () => collapseIcon.style.opacity = "0.9";
collapseIcon.onclick = () => {
  hud.style.opacity = "0";
  setTimeout(() => {
    hud.style.display = "none";
    hud.style.opacity = "1";
    showRestoreButton();
  }, 200);
  state.collapsed = true;
  saveState(state);
};

// добавляем кнопку перед ⚙️
rightControls.prepend(collapseIcon);

// --- Кнопка восстановления HUD ---
const restoreButton = document.createElement("div");
restoreButton.textContent = "HUD";
restoreButton.style.position = "fixed";
restoreButton.style.top = "57px"; // ⬇️ ниже от края экрана
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
  hud.style.display = "flex";
  hud.style.opacity = "0";
  setTimeout(() => hud.style.opacity = "1", 10);
  state.collapsed = false;
  saveState(state);
};

document.body.appendChild(restoreButton);

function showRestoreButton() {
  restoreButton.style.display = "flex";
  restoreButton.style.opacity = "0";
  setTimeout(() => restoreButton.style.opacity = "1", 100);
}



  // ------------------------------
  // Ably subscription
  // ------------------------------
  channel.subscribe("update", (msg) => {
    const data = msg.data || {};
    // when new payload arrives, hide progress overlay after showing 'received' message
    hideProgressOverlayThenShowReceived();
    // render
    renderPayload(data);
    if (document.getElementById("hud_loading_overlay")) hideLoadingOverlay();
});
  

  // external API for parser to show progress: parser can publish 'waiting' on channel or you can call showProgressOverlay()
  // We'll also expose a simple global toggler so parser or other code can call window.__cs2run_showWait()
  window.__cs2run_showWait = () => { showProgressOverlay(); };

  // initial render with saved last data (if any)
  try {
    const lastSaved = JSON.parse(localStorage.getItem("cs2run_lastData") || "null");
    if (lastSaved) renderPayload(lastSaved);
  } catch {}

  // apply initial display options
  crashVal.style.display = state.showCurrentCrash ? "" : "none";
  bottomRow.style.opacity = state.textOpacity;
  applyThemeToElement(hud, state.theme);

  // If HUD should start collapsed
  if (state.collapsed) {
  hud.style.display = "none";
  showRestoreButton();
}

  // --- convenience: when opening HUD, show overlay waiting for 1s to simulate waiting (optional) ---
  showProgressOverlay(); // show immediately (user asked overlay at open)
  setTimeout(() => { progressOverlay.style.display = "none"; }, 800);

  // ------------------------------
  // Small helpers for parser integration:
  // Parser may include lastCrash in payload (we expect parser to send stats + lastCrash)
  // Example payload from parser should include: { avg10, avg25, avg50, totalAvg, max24h, count, updatedAt, currentPeriod, ping, cpuLoad, lastCrash }
  // ------------------------------

  // end
})();