// ==UserScript==
// @name         CS2Run HUD 4
// @namespace    cs2run4.hud
// @version      2.1
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
    bgOpacity: 0.92, textOpacity: 1.0, theme: "auto",
    showPing: true, showCpu: true, showCurrentCrash: true, collapsed: false
  };
  function loadState() {
    try { const raw = localStorage.getItem(LS_KEY); if (!raw) return { ...defaults }; return { ...defaults, ...JSON.parse(raw) }; }
    catch { return { ...defaults }; }
  }
  function saveState(st) { localStorage.setItem(LS_KEY, JSON.stringify(st)); }
  let state = loadState();

  // --- utilities ---
  function fmtOmskTime(input) {
    if (!input) return "—";
    try {
      let d = null;
      if (input instanceof Date) d = input;
      else if (typeof input === "number") d = new Date(input);
      else if (typeof input === "string") {
        // try parse ISO or timestamp string
        const maybeNum = Number(input);
        d = Number.isFinite(maybeNum) ? new Date(maybeNum) : new Date(input);
      } else d = new Date(input);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleTimeString("ru-RU", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Omsk" });
    } catch { return "—"; }
  }

  function applyThemeToElement(el, theme) {
    if (theme === "dark") {
      el.style.background = `rgba(20,20,20,${state.bgOpacity})`;
      el.style.color = `rgba(230,230,230,${state.textOpacity})`;
      el.style.boxShadow = "0 2px 12px rgba(0,0,0,0.6)";
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

  // --- create HUD ---
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
  applyThemeToElement(hud, state.theme);
  document.body.appendChild(hud);

  // --- styles & anims ---
  const style = document.createElement("style");
  style.textContent = `
    @keyframes cs_highlight { 0% { transform: scale(1.03); filter: brightness(1.15); opacity:0.9 } 100% { transform: scale(1); filter: brightness(1); opacity:1 } }
    .cs-highlight { animation: cs_highlight .5s ease; }
    .cs-settings-backdrop { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; z-index:1000001; background: rgba(0,0,0,0.25); }
    .cs-settings { width:46vw; max-width:720px; min-width:320px; height:52vh; background: rgba(255,255,255,0.98); border-radius:12px; padding:14px; box-shadow:0 6px 30px rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:10px; box-sizing:border-box; }
    .cs-settings.dark { background: rgba(28,28,30,0.98); color:#EEE; }
    .cs-row { display:flex; align-items:center; gap:10px; justify-content:space-between; }
    .cs-row label { font-size:13px; }
    .cs-slider { width:60%; }
    .cs-gear { position:absolute; right:10px; top:8px; cursor:pointer; user-select:none; }
    .cs-collapse-btn { position: fixed; right: 10px; top: 10px; z-index:1000002; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:8px; background: rgba(0,0,0,0.6); color: #fff; cursor:pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .cs-progress-overlay { position:absolute; inset:0; display:flex;align-items:center;justify-content:center; background: rgba(0,0,0,0.15); z-index:20; flex-direction:column; gap:8px; }
    .cs-progress-bar { width:80%; height:8px; background: rgba(255,255,255,0.25); border-radius:6px; overflow:hidden; }
    .cs-progress-fill { height:100%; width:0%; background: linear-gradient(90deg,#34c759,#ffd60a); transition: width 0.3s linear; }
  `;
  document.head.appendChild(style);

  // --- structure ---
  const topRow = document.createElement("div"); topRow.style.display = "flex"; topRow.style.justifyContent = "space-between"; topRow.style.alignItems = "center";
  const titleEl = document.createElement("div"); titleEl.innerHTML = `<span style="font-weight:700;font-size:15px;">🎯 CS2Run</span> <span style="color:#007AFF;font-weight:600;font-size:13px;">(live)</span>`;
  topRow.appendChild(titleEl);

  const rightControls = document.createElement("div"); rightControls.style.display = "flex"; rightControls.style.alignItems = "center"; rightControls.style.gap = "8px";
  const crashVal = document.createElement("div"); crashVal.id = "cs_crash_val"; crashVal.style.fontWeight = "700"; crashVal.style.fontSize = "16px"; crashVal.style.minWidth = "56px"; crashVal.style.textAlign = "right"; crashVal.style.transition = "all .3s ease";
  rightControls.appendChild(crashVal);

  const gear = document.createElement("div"); gear.className = "cs-gear"; gear.textContent = "⚙️"; gear.title = "Настройки HUD"; gear.style.cursor = "pointer";
  rightControls.appendChild(gear);
  topRow.appendChild(rightControls);
  hud.appendChild(topRow);

  const statsArea = document.createElement("div"); statsArea.style.display = "flex"; statsArea.style.flexDirection = "column"; statsArea.style.flex = "1 1 auto"; statsArea.style.gap = "6px"; statsArea.style.overflow = "hidden";
  hud.appendChild(statsArea);

  const line = (label, id) => {
    const el = document.createElement("div");
    el.style.display = "flex"; el.style.justifyContent = "space-between"; el.style.alignItems = "center"; el.style.fontSize = "13px";
    el.innerHTML = `<div style="opacity:.9">${label}</div><div id="${id}" style="font-weight:700"></div>`;
    return el;
  };

  const avg10El = line("📊 10 игр —", "cs_avg10");
  const avg25El = line("📊 25 игр —", "cs_avg25");
  const avg50El = line("📊 50 игр —", "cs_avg50");
  statsArea.appendChild(avg10El); statsArea.appendChild(avg25El); statsArea.appendChild(avg50El);
  statsArea.appendChild(document.createElement("hr"));
  const avgTotalEl = line("📈 Среднее", "cs_totalAvg");
  const max24hEl = line("🔥 Макс за сутки:", "cs_max24h");
  statsArea.appendChild(avgTotalEl); statsArea.appendChild(max24hEl);

  const bottomRow = document.createElement("div"); bottomRow.style.display = "flex"; bottomRow.style.justifyContent = "space-between"; bottomRow.style.alignItems = "center"; bottomRow.style.fontSize = "12px";
  bottomRow.style.opacity = state.textOpacity;
  const perfEl = document.createElement("div"); perfEl.id = "cs_perf"; perfEl.style.display = "flex"; perfEl.style.gap = "8px"; perfEl.style.alignItems = "center";
  const updatedEl = document.createElement("div"); updatedEl.id = "cs_updated";
  bottomRow.appendChild(perfEl); bottomRow.appendChild(updatedEl);
  hud.appendChild(bottomRow);

  const progressOverlay = document.createElement("div"); progressOverlay.className = "cs-progress-overlay"; progressOverlay.style.display = "none";
  progressOverlay.innerHTML = `<div style="font-weight:700">Ожидание конца игры...</div><div class="cs-progress-bar"><div class="cs-progress-fill"></div></div><div id="cs_progress_text" style="font-size:12px;color:rgba(255,255,255,0.95)"></div>`;
  hud.appendChild(progressOverlay);

  const collapseBtn = document.createElement("div"); collapseBtn.className = "cs-collapse-btn"; collapseBtn.style.display = state.collapsed ? "flex" : "none"; collapseBtn.textContent = "CS"; collapseBtn.title = "Показать HUD";
  document.body.appendChild(collapseBtn);

  // --- rendering helpers ---
  let lastPayload = {};
  function colorForCrash(c) {
    if (c == null) return "#007AFF";
    if (c < 1.2) return "#FF3B30";
    if (c < 2) return "#5AC8FA";
    if (c < 4) return "#FF2D55"; // pink for 2-3.99
    if (c < 8) return "#34C759";
    if (c < 25) return "#FFD60A";
    return null;
  }
  function maybeWithX(n) {
    if (n === null || n === undefined) return "—";
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return num.toFixed(2) + "x";
  }

  function renderPayload(d) {
    lastPayload = { ...lastPayload, ...d };
    const setText = (id, value) => { const el = document.getElementById(id); if (!el) return; el.textContent = value; };

    setText("cs_avg10", (() => { const v = lastPayload.avg10; return (v != null && !Number.isNaN(Number(v))) ? Number(v).toFixed(2) + "x" : (v ?? "—"); })());
    setText("cs_avg25", (() => { const v = lastPayload.avg25; return (v != null && !Number.isNaN(Number(v))) ? Number(v).toFixed(2) + "x" : (v ?? "—"); })());
    setText("cs_avg50", (() => { const v = lastPayload.avg50; return (v != null && !Number.isNaN(Number(v))) ? Number(v).toFixed(2) + "x" : (v ?? "—"); })());
    setText("cs_totalAvg", (() => { const v = lastPayload.totalAvg; return (v != null && !Number.isNaN(Number(v))) ? Number(v).toFixed(2) + "x" : (v ?? "—"); })());
    setText("cs_max24h", (() => { const v = lastPayload.max24h; return (v != null && !Number.isNaN(Number(v))) ? Number(v).toFixed(2) + "x" : (v ?? "—"); })());

    // perf
    perfEl.innerHTML = "";
    if (state.showPing) {
      const p = document.createElement("div");
      p.textContent = `⚡ Пинг: ${typeof lastPayload.ping === "number" ? lastPayload.ping.toFixed(3) + " s" : (lastPayload.ping ?? "—")}`;
      perfEl.appendChild(p);
    }
    if (state.showCpu) {
      const c = document.createElement("div");
      const cpu = Number(lastPayload.cpuLoad);
      c.textContent = `🧩 CPU: ${Number.isFinite(cpu) ? cpu.toFixed(2) + "%" : (lastPayload.cpuLoad ?? "—")}`;
      perfEl.appendChild(c);
    }

    // updated
    updatedEl.innerHTML = `🕓 Обновлено (Омск): <b>${fmtOmskTime(lastPayload.updatedAt)}</b>`;

    // crash
    const crashRaw = lastPayload.lastCrash;
    const crash = (typeof crashRaw === "number") ? crashRaw : (typeof crashRaw === "string" && crashRaw !== "" ? Number(crashRaw) : (crashRaw ?? null));
    if (state.showCurrentCrash && crash != null && !Number.isNaN(crash)) {
      const color = colorForCrash(crash);
      if (crash >= 25) {
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
      crashVal.classList.remove("cs-highlight");
      void crashVal.offsetWidth;
      crashVal.classList.add("cs-highlight");
    } else {
      crashVal.textContent = "";
    }

    // bottom row color adapt
    if (state.theme === "dark") bottomRow.style.color = `rgba(255,255,255,${state.textOpacity})`;
    else bottomRow.style.color = `rgba(0,0,0,${Math.max(0.5, state.textOpacity)})`;
  }

  // --- progress overlay ---
  let progressInterval = null;
  function showProgressOverlay() {
    progressOverlay.style.display = "flex";
    const fill = progressOverlay.querySelector(".cs-progress-fill");
    fill.style.width = "0%";
    let pct = 0;
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      pct += 6 + Math.random() * 8;
      if (pct > 95) pct = 95;
      fill.style.width = pct + "%";
      const txt = progressOverlay.querySelector("#cs_progress_text");
      txt.textContent = `Ожидание ответа... ${Math.round(pct)}%`;
    }, 420);
  }
  function hideProgressOverlayThenShowReceived() {
    clearInterval(progressInterval);
    const fill = progressOverlay.querySelector(".cs-progress-fill");
    fill.style.width = "100%";
    const txt = progressOverlay.querySelector("#cs_progress_text");
    txt.textContent = "Получен ответ от сервера";
    setTimeout(() => {
      progressOverlay.style.display = "none";
      fill.style.width = "0%";
      txt.textContent = "";
    }, 500); // 0.5s as requested
  }

  // --- settings modal (unchanged behaviour, only minor UX) ---
  let settingsModal = null, settingsBackdrop = null, tempState = null;
  function openSettings() {
    if (settingsBackdrop) return;
    tempState = { ...state };
    settingsBackdrop = document.createElement("div"); settingsBackdrop.className = "cs-settings-backdrop";
    settingsModal = document.createElement("div"); settingsModal.className = "cs-settings"; if (state.theme === "dark") settingsModal.classList.add("dark");
    settingsModal.style.position = "relative";
    const header = document.createElement("div"); header.style.display = "flex"; header.style.justifyContent = "space-between"; header.style.alignItems = "center";
    header.innerHTML = `<div style="font-weight:700">Настройки HUD</div><div style="font-size:12px;color:#888">v2.1</div>`;
    settingsModal.appendChild(header);

    // bg opacity row
    const rowBg = document.createElement("div"); rowBg.className = "cs-row";
    const labelBg = document.createElement("label"); labelBg.textContent = "Прозрачность фона";
    const inputBg = document.createElement("input"); inputBg.type = "range"; inputBg.min = "0.15"; inputBg.max = "1"; inputBg.step = "0.01";
    inputBg.value = tempState.bgOpacity; inputBg.className = "cs-slider";
    const valBg = document.createElement("div"); valBg.textContent = Number(inputBg.value).toFixed(2);
    inputBg.oninput = () => { valBg.textContent = Number(inputBg.value).toFixed(2); tempState.bgOpacity = Number(inputBg.value); };
    rowBg.appendChild(labelBg); rowBg.appendChild(inputBg); rowBg.appendChild(valBg); settingsModal.appendChild(rowBg);

    // text opacity
    const rowText = document.createElement("div"); rowText.className = "cs-row";
    const labelText = document.createElement("label"); labelText.textContent = "Прозрачность текста";
    const inputText = document.createElement("input"); inputText.type = "range"; inputText.min = "0.5"; inputText.max = "1"; inputText.step = "0.01";
    inputText.value = tempState.textOpacity; inputText.className = "cs-slider";
    const valText = document.createElement("div"); valText.textContent = Number(inputText.value).toFixed(2);
    inputText.oninput = () => { valText.textContent = Number(inputText.value).toFixed(2); tempState.textOpacity = Number(inputText.value); };
    rowText.appendChild(labelText); rowText.appendChild(inputText); rowText.appendChild(valText); settingsModal.appendChild(rowText);

    // theme
    const rowTheme = document.createElement("div"); rowTheme.className = "cs-row";
    const labelTheme = document.createElement("label"); labelTheme.textContent = "Тема";
    const selTheme = document.createElement("select");
    ["auto","light","dark"].forEach(t => { const opt = document.createElement("option"); opt.value = t; opt.textContent = t; if (tempState.theme===t) opt.selected=true; selTheme.appendChild(opt); });
    selTheme.onchange = () => tempState.theme = selTheme.value;
    rowTheme.appendChild(labelTheme); rowTheme.appendChild(selTheme); settingsModal.appendChild(rowTheme);

    // toggles
    const rowToggles = document.createElement("div"); rowToggles.className = "cs-row"; rowToggles.style.flexDirection = "column";
    const makeToggle = (labelTxt, key) => {
      const r = document.createElement("div"); r.style.display="flex"; r.style.justifyContent="space-between"; r.style.alignItems="center";
      const lab = document.createElement("label"); lab.textContent = labelTxt;
      const cb = document.createElement("input"); cb.type="checkbox"; cb.checked = !!tempState[key];
      cb.onchange = () => tempState[key] = cb.checked; r.appendChild(lab); r.appendChild(cb); return r;
    };
    rowToggles.appendChild(makeToggle("Показывать пинг", "showPing"));
    rowToggles.appendChild(makeToggle("Показывать CPU", "showCpu"));
    rowToggles.appendChild(makeToggle("Показывать текущий коэффициент", "showCurrentCrash"));
    settingsModal.appendChild(rowToggles);

    // actions
    const actions = document.createElement("div"); actions.style.display="flex"; actions.style.justifyContent="space-between"; actions.style.marginTop="auto";
    const resetBtn = document.createElement("button"); resetBtn.textContent = "Сброс настроек"; resetBtn.style.background="#FF3B30"; resetBtn.style.color="#fff"; resetBtn.style.borderRadius="8px"; resetBtn.style.padding="6px 8px";
    const applyBtn = document.createElement("button"); applyBtn.textContent = "Применить"; applyBtn.style.background="#34C759"; applyBtn.style.color="#fff"; applyBtn.style.borderRadius="8px"; applyBtn.style.padding="6px 8px";
    const closeBtn = document.createElement("button"); closeBtn.textContent = "Закрыть"; closeBtn.style.background="#ccc"; closeBtn.style.borderRadius="8px"; closeBtn.style.padding="6px 8px";
    resetBtn.onclick = () => { if (!confirm("Сбросить настройки к значениям по умолчанию? HUD перезагрузится.")) return; localStorage.removeItem(LS_KEY); location.reload(); };
    applyBtn.onclick = () => { state = { ...state, ...tempState }; saveState(state); applyThemeToElement(hud, state.theme); bottomRow.style.opacity = state.textOpacity; crashVal.style.display = state.showCurrentCrash ? "" : "none"; saveState(state); closeSettings(); };
    closeBtn.onclick = () => { const staged = JSON.stringify(tempState); const savedStr = JSON.stringify(state); if (staged !== savedStr) { const ans = confirm("Применить изменения? Нажмите OK — применить; Отмена — закрыть без сохранения."); if (ans) { applyBtn.click(); return; } else { closeSettings(false); return; } } closeSettings(); };
    actions.appendChild(resetBtn); actions.appendChild(closeBtn); actions.appendChild(applyBtn); settingsModal.appendChild(actions);

    // modal drag support
    let modalDrag = null;
    const startModalDrag = (e) => { e.preventDefault(); const t = e.touches ? e.touches[0] : e; modalDrag = { x: t.clientX, y: t.clientY, left: settingsModal.offsetLeft, top: settingsModal.offsetTop }; settingsModal.style.position = "absolute"; };
    const onModalDrag = (e) => { if (!modalDrag) return; const t = e.touches ? e.touches[0] : e; settingsModal.style.left = (modalDrag.left + (t.clientX - modalDrag.x)) + "px"; settingsModal.style.top = (modalDrag.top + (t.clientY - modalDrag.y)) + "px"; };
    const stopModalDrag = () => { modalDrag = null; };
    header.addEventListener("mousedown", startModalDrag); header.addEventListener("touchstart", startModalDrag);
    document.addEventListener("mousemove", onModalDrag); document.addEventListener("touchmove", onModalDrag);
    document.addEventListener("mouseup", stopModalDrag); document.addEventListener("touchend", stopModalDrag);

    settingsBackdrop.appendChild(settingsModal);
    document.body.appendChild(settingsBackdrop);
  }
  function closeSettings(removeNode = true) { if (!settingsBackdrop) return; settingsBackdrop.remove(); settingsBackdrop = null; settingsModal = null; tempState = null; }
  gear.addEventListener("click", () => { if (settingsBackdrop) closeSettings(); else openSettings(); });

  // --- dragging/resizing HUD (title draggable) ---
  let dragInfo = null, resizeInfo = null, raf = null;
  const startDrag = (e) => { e.preventDefault(); const t = e.touches ? e.touches[0] : e; dragInfo = { x: t.clientX, y: t.clientY, left: hud.offsetLeft, top: hud.offsetTop }; };
  const onDrag = (e) => { if (!dragInfo) return; const t = e.touches ? e.touches[0] : e; const dx = t.clientX - dragInfo.x; const dy = t.clientY - dragInfo.y; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { hud.style.left = (dragInfo.left + dx) + "px"; hud.style.top = (dragInfo.top + dy) + "px"; }); };
  const stopDrag = () => { if (!dragInfo) return; state.left = hud.offsetLeft; state.top = hud.offsetTop; saveState(state); dragInfo = null; };
  const dragHandle = titleEl; dragHandle.style.cursor = "grab";
  dragHandle.addEventListener("mousedown", startDrag); dragHandle.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("mousemove", onDrag); document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag); document.addEventListener("touchend", stopDrag);

  const resizeHandle = document.createElement("div");
  resizeHandle.textContent = "↘️"; resizeHandle.style.position = "absolute"; resizeHandle.style.right = "8px"; resizeHandle.style.bottom = "8px"; resizeHandle.style.cursor = "nwse-resize";
  resizeHandle.style.fontSize = "14px"; resizeHandle.style.background = "rgba(255,255,255,0.6)"; resizeHandle.style.borderRadius = "6px"; resizeHandle.style.padding = "2px 6px"; resizeHandle.style.userSelect = "none";
  hud.appendChild(resizeHandle);
  const startResize = (e) => { e.preventDefault(); const t = e.touches ? e.touches[0] : e; resizeInfo = { x: t.clientX, y: t.clientY, w: hud.offsetWidth, h: hud.offsetHeight }; };
  const onResize = (e) => { if (!resizeInfo) return; const t = e.touches ? e.touches[0] : e; const dw = t.clientX - resizeInfo.x; const dh = t.clientY - resizeInfo.y; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { hud.style.width = Math.max(200, resizeInfo.w + dw) + "px"; hud.style.height = Math.max(120, resizeInfo.h + dh) + "px"; }); };
  const stopResize = () => { if (!resizeInfo) return; state.width = hud.offsetWidth; state.height = hud.offsetHeight; saveState(state); resizeInfo = null; };
  resizeHandle.addEventListener("mousedown", startResize); resizeHandle.addEventListener("touchstart", startResize, { passive: false });
  document.addEventListener("mousemove", onResize); document.addEventListener("touchmove", onResize, { passive: false });
  document.addEventListener("mouseup", stopResize); document.addEventListener("touchend", stopResize);

  collapseBtn.addEventListener("click", () => { collapseBtn.style.display = "none"; hud.style.display = "flex"; state.collapsed = false; saveState(state); });
  titleEl.addEventListener("dblclick", () => { hud.style.display = "none"; collapseBtn.style.display = "flex"; state.collapsed = true; saveState(state); });

  // --- Ably subscription ---
  channel.subscribe("update", (msg) => {
    const data = msg.data || {};
    hideProgressOverlayThenShowReceived();
    renderPayload(data);
  });
  window.__cs2run_showWait = () => { showProgressOverlay(); };

  try { const lastSaved = JSON.parse(localStorage.getItem("cs2run_lastData") || "null"); if (lastSaved) renderPayload(lastSaved); } catch {}
  crashVal.style.display = state.showCurrentCrash ? "" : "none";
  bottomRow.style.opacity = state.textOpacity;
  applyThemeToElement(hud, state.theme);
  if (state.collapsed) { hud.style.display = "none"; collapseBtn.style.display = "flex"; }

  // show overlay on open until data arrives (short)
  showProgressOverlay();
  setTimeout(() => { progressOverlay.style.display = "none"; }, 800);

})();