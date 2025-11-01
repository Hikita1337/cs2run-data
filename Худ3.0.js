// pools.js
// ==UserScript==
// @name         CS2Run HUD (OmSK, pools.js final)
// @namespace    cs2run3.hud
// @version      3.0
// @description  HUD статистики CS2Run — OmSK time, settings, logs, loading overlay, nice visuals
// @match        *://cs2run.bet/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
  const ABLY_PUBLIC_KEY = "OPAt8A.dMkrwA:A9niPpJUrzV7J62AKvitMDaExAN6wJkJ_P1EnQ8Ya9Y";
  // ====== CONFIG DEFAULTS ======
  const DEFAULTS = {
    theme: "light", // "light" or "dark"
    bgOpacity: 0.92,   // background alpha 0.3..1
    textOpacity: 1.0,  // text alpha 0.5..1
    showCurrent: true,
    showStatsLine: true, // show ping/cpu/time
    scaleTextWithWindow: false, // by default off
    hudWidth: 320,
    hudTop: 20,
    hudLeft: 20,
    hudHeight: null,
    hidden: false
  };
  const STORAGE_KEY = "cs2run_hud_state_v3";
  const LOGS_KEY = "cs2run_hud_logs_v3";
  const VERSION = "3.0";

  // ====== UTIL ======
  function loadState() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) return { ...DEFAULTS };
      const parsed = JSON.parse(s);
      return { ...DEFAULTS, ...parsed };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }
  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
  function pushLog(entry) {
    try {
      const arr = JSON.parse(localStorage.getItem(LOGS_KEY) || "[]");
      arr.unshift({ ts: Date.now(), ...entry });
      if (arr.length > 200) arr.length = 200;
      localStorage.setItem(LOGS_KEY, JSON.stringify(arr));
    } catch {}
  }
  function getLogs() {
    try { return JSON.parse(localStorage.getItem(LOGS_KEY) || "[]"); } catch { return []; }
  }
  function fmtTimeSmart(input) {
    // Accepts:
    // - already hh:mm:ss (return as-is)
    // - ISO or other date -> format in Asia/Omsk hh:mm:ss
    if (!input) return "—";
    if (typeof input === "string") {
      const simple = input.trim();
      if (/^\d{2}:\d{2}:\d{2}$/.test(simple)) return simple;
      // Try parse
      const d = new Date(input);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString("ru-RU", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Omsk" });
      }
      // If it's like "HH:MM" or similar, return
      if (/^\d{2}:\d{2}$/.test(simple)) return simple + ":00";
    }
    // fallback
    try {
      const d = new Date(input);
      if (!isNaN(d.getTime())) return d.toLocaleTimeString("ru-RU", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Omsk" });
    } catch {}
    return "—";
  }

  // ====== LOAD STATE ======
  let state = loadState();

  // ====== LOAD Ably SDK if missing ======
  const ensureAbly = () => new Promise((resolve, reject) => {
    if (window.Ably) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/ably@1.2.28/browser/static/ably-commonjs.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Ably"));
    document.head.appendChild(s);
  });

  // ====== Build HUD DOM ======
  function createHUD() {
    document.getElementById("cs2run_hud_final")?.remove();

    const hud = document.createElement("div");
    hud.id = "cs2run_hud_final";
    hud.style.position = "fixed";
    hud.style.top = (state.hudTop ?? 20) + "px";
    hud.style.left = (state.hudLeft ?? 20) + "px";
    hud.style.width = (state.hudWidth ?? 320) + "px";
    if (state.hudHeight) hud.style.height = state.hudHeight + "px";
    hud.style.zIndex = 999999;
    hud.style.borderRadius = "10px";
    hud.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
    hud.style.overflow = "hidden";
    hud.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";
    hud.style.transition = "transform 0.25s ease, opacity 0.25s ease, backdrop-filter 0.25s";
    hud.style.display = state.hidden ? "none" : "block";

    // apply theme/bg/text
    applyThemeAndOpacity(hud, state.theme, state.bgOpacity, state.textOpacity);

    // header (draggable)
    const header = document.createElement("div");
    header.style.cursor = "grab";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "8px 10px";
    header.style.borderBottom = "1px solid rgba(0,0,0,0.06)";
    header.style.userSelect = "none";
    header.style.gap = "8px";

    // title
    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.alignItems = "center";

    const title = document.createElement("div");
    title.innerHTML = `🎯 CS2Run <span id="cs2run_live_tag" style="color:#007AFF;font-weight:600;">(live)</span>`;
    title.style.fontWeight = 700;
    title.style.fontSize = "15px";
    titleWrap.appendChild(title);

    // current crash near live (30px gap)
    const currWrap = document.createElement("div");
    currWrap.style.display = "flex";
    currWrap.style.alignItems = "center";
    currWrap.style.marginLeft = "30px";
    currWrap.style.gap = "8px";

    const crashEl = document.createElement("div");
    crashEl.id = "cs2run_current_crash";
    crashEl.style.fontWeight = 800;
    crashEl.style.fontSize = "16px";
    crashEl.style.transition = "all 0.5s ease";
    crashEl.textContent = ""; // filled on update
    currWrap.appendChild(crashEl);

    titleWrap.appendChild(currWrap);

    header.appendChild(titleWrap);

    // controls (settings, hide, pin)
    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "8px";

    const settingsBtn = document.createElement("button");
    settingsBtn.title = "Настройки";
    settingsBtn.innerText = "⚙️";
    styleControlButton(settingsBtn);
    controls.appendChild(settingsBtn);

    const logsBtn = document.createElement("button");
    logsBtn.title = "Логи";
    logsBtn.innerText = "📜";
    styleControlButton(logsBtn);
    controls.appendChild(logsBtn);

    const hideBtn = document.createElement("button");
    hideBtn.title = "Скрыть HUD";
    hideBtn.innerText = "👁️";
    styleControlButton(hideBtn);
    controls.appendChild(hideBtn);

    header.appendChild(controls);

    hud.appendChild(header);

    // small divider strip under header (draggable area visual)
    const strip = document.createElement("div");
    strip.style.height = "6px";
    strip.style.background = themeStripColor(state.theme);
    hud.appendChild(strip);

    // content area
    const content = document.createElement("div");
    content.id = "cs2run_content";
    content.style.padding = "10px";
    content.style.fontSize = "14px";
    content.style.color = getTextColor(state.theme);
    content.style.opacity = state.textOpacity ?? 1;
    content.innerHTML = getInitialContentHTML(); // placeholder
    hud.appendChild(content);

    // footer: author + version
    const footer = document.createElement("div");
    footer.style.fontSize = "12px";
    footer.style.color = getMutedTextColor(state.theme);
    footer.style.padding = "8px 10px";
    footer.style.borderTop = "1px solid rgba(0,0,0,0.06)";
    footer.style.display = "flex";
    footer.style.justifyContent = "space-between";
    footer.innerHTML = `<div style="font-size:13px;">Автор проекта: <b style="font-weight:600">saxarok322</b></div><div>v${VERSION}</div>`;
    hud.appendChild(footer);

    document.body.appendChild(hud);

    // loading overlay (cover whole hud)
    const loadingOv = document.createElement("div");
    loadingOv.id = "cs2run_loading_overlay";
    loadingOv.style.position = "absolute";
    loadingOv.style.left = 0;
    loadingOv.style.top = 0;
    loadingOv.style.right = 0;
    loadingOv.style.bottom = 0;
    loadingOv.style.display = "flex";
    loadingOv.style.flexDirection = "column";
    loadingOv.style.alignItems = "center";
    loadingOv.style.justifyContent = "center";
    loadingOv.style.backdropFilter = "blur(3px)";
    loadingOv.style.background = overlayBg(state.theme, 0.85);
    loadingOv.style.transition = "opacity 0.5s ease";
    loadingOv.innerHTML = `
      <div style="font-size:18px;font-weight:700;margin-bottom:12px;">Ждём окончания игры</div>
      <div style="width:80%;height:10px;border-radius:6px;background:rgba(255,255,255,0.12);overflow:hidden;">
        <div id="cs2run_progress" style="height:100%;width:0%;background:linear-gradient(90deg,#00ccff,#7a00ff);transition:width 2s linear;"></div>
      </div>
      <div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,0.85)">Ожидаем данные от парсера...</div>
    `;
    loadingOv.hidden = false;
    hud.appendChild(loadingOv);

    // make header draggable
    makeDraggable(hud, header);

    // controls events
    settingsBtn.addEventListener("click", () => openSettings(hud));
    logsBtn.addEventListener("click", () => openLogsWindow());
    hideBtn.addEventListener("click", () => toggleHideHud(hud));

    // pin restore button (hidden initially)
    createPinButton();

    // store references for updates
    return { hud, content, crashEl, loadingOv };
  }

  // ====== helpers for UI ======
  function styleControlButton(btn) {
    btn.style.border = "none";
    btn.style.background = "rgba(255,255,255,0.06)";
    btn.style.padding = "6px 8px";
    btn.style.borderRadius = "8px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "14px";
    btn.style.lineHeight = "1";
  }
  function themeStripColor(theme) {
    if (theme === "dark") return "linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))";
    return "linear-gradient(90deg, rgba(0,0,0,0.03), rgba(0,0,0,0.02))";
  }
  function overlayBg(theme, a = 0.9) {
    if (theme === "dark") return `rgba(0,0,0,${a})`;
    return `rgba(255,255,255,${a})`;
  }
  function getTextColor(theme) { return theme === "dark" ? "#fff" : "#000"; }
  function getMutedTextColor(theme) { return theme === "dark" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)"; }
  function applyThemeAndOpacity(hud, theme, bgOpacity = 0.92, textOpacity = 1.0) {
    // bgOpacity 0.3..1, textOpacity 0.5..1
    const bgBase = theme === "dark" ? "20,20,25" : "255,255,255";
    hud.style.background = `rgba(${bgBase},${Math.max(0.3, Math.min(1, bgOpacity))})`;
    hud.style.color = getTextColor(theme);
    hud.style.backdropFilter = theme === "dark" ? "blur(6px) saturate(1.2)" : "blur(6px)";
    // text opacity will be applied to content area when created
  }
  function getInitialContentHTML() {
    return `
      <div style="font-weight:700;margin-bottom:6px;">Статистика</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div>📊 10 игр — <b id="cs2_avg10">—</b></div>
        <div>📊 25 игр — <b id="cs2_avg25">—</b></div>
        <div>📊 50 игр — <b id="cs2_avg50">—</b></div>
      </div>
      <hr style="margin:10px 0;">
      <div>📈 Среднее (<span id="cs2_count">—</span> игр): <b id="cs2_totalAvg">—</b></div>
      <div style="margin-top:6px;color:#FF9500;">🔥 Макс за сутки: <b id="cs2_max24">—</b></div>
      <hr style="margin:10px 0;">
      <div style="font-size:13px;color:var(--muted);">
         🕓 Обновлено (Омск): <b id="cs2_updated">—</b> |
         ⚡ Пинг: <b id="cs2_ping">—</b> s |
         🧩 CPU: <b id="cs2_cpu">—</b>
      </div>
    `;
  }

  // ====== Dragging (header) ======
  function makeDraggable(hud, handle) {
    let dragging = null, start = null, raf = null;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true;
      start = { x: e.clientX, y: e.clientY, left: hud.offsetLeft, top: hud.offsetTop };
      handle.style.cursor = "grabbing";
    });
    handle.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      dragging = true;
      start = { x: t.clientX, y: t.clientY, left: hud.offsetLeft, top: hud.offsetTop };
    }, { passive: true });

    function moveTo(clientX, clientY) {
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      let nx = start.left + dx;
      let ny = start.top + dy;
      // allow moving off-screen but keep 20% visible
      const w = hud.offsetWidth;
      const h = hud.offsetHeight;
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;
      const keepX = Math.round(w * 0.2);
      const keepY = Math.round(h * 0.2);
      nx = Math.max(-w + keepX, Math.min(screenW - keepX, nx));
      ny = Math.max(-h + keepY, Math.min(screenH - keepY, ny));
      hud.style.left = nx + "px";
      hud.style.top = ny + "px";
    }

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => moveTo(e.clientX, e.clientY));
    });
    document.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => moveTo(t.clientX, t.clientY));
    }, { passive: true });

    function stop() {
      if (!dragging) return;
      dragging = false;
      start = null;
      handle.style.cursor = "grab";
      // save
      const hudEl = document.getElementById("cs2run_hud_final");
      if (hudEl) {
        state.hudLeft = hudEl.offsetLeft;
        state.hudTop = hudEl.offsetTop;
        state.hudWidth = hudEl.offsetWidth;
        state.hudHeight = hudEl.offsetHeight;
        saveState(state);
      }
    }
    document.addEventListener("mouseup", stop);
    document.addEventListener("touchend", stop);
  }

  // ====== Pin button for hidden HUD restore ======
  let pinBtn = null;
  function createPinButton() {
    if (document.getElementById("cs2run_pin_restore")) {
      pinBtn = document.getElementById("cs2run_pin_restore");
      return;
    }
    pinBtn = document.createElement("div");
    pinBtn.id = "cs2run_pin_restore";
    pinBtn.style.position = "fixed";
    pinBtn.style.right = "12px";
    pinBtn.style.top = "12px";
    pinBtn.style.zIndex = 999999;
    pinBtn.style.background = "rgba(0,0,0,0.6)";
    pinBtn.style.color = "#fff";
    pinBtn.style.padding = "8px";
    pinBtn.style.borderRadius = "8px";
    pinBtn.style.cursor = "pointer";
    pinBtn.style.display = state.hidden ? "block" : "none";
    pinBtn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    pinBtn.style.fontSize = "16px";
    pinBtn.title = "Развернуть HUD";
    pinBtn.textContent = "📌";
    pinBtn.addEventListener("click", () => {
      state.hidden = false;
      saveState(state);
      document.getElementById("cs2run_hud_final")?.style.setProperty("display", "block");
      pinBtn.style.display = "none";
    });
    document.body.appendChild(pinBtn);
  }

  function toggleHideHud(hudEl) {
    state.hidden = !state.hidden;
    saveState(state);
    hudEl.style.display = state.hidden ? "none" : "block";
    if (pinBtn) pinBtn.style.display = state.hidden ? "block" : "none";
  }

  // ====== Settings window ======
  let settingsWindow = null;
  function openSettings(hudEl) {
    if (settingsWindow) return; // single instance
    // center modal scaled 45% viewport
    settingsWindow = document.createElement("div");
    settingsWindow.style.position = "fixed";
    settingsWindow.style.left = "50%";
    settingsWindow.style.top = "50%";
    settingsWindow.style.transform = "translate(-50%,-50%)";
    settingsWindow.style.width = Math.min(800, Math.round(window.innerWidth * 0.5)) + "px";
    settingsWindow.style.height = Math.min(600, Math.round(window.innerHeight * 0.5)) + "px";
    settingsWindow.style.zIndex = 1000000;
    settingsWindow.style.background = state.theme === "dark" ? "rgba(20,20,22,0.96)" : "rgba(255,255,255,0.98)";
    settingsWindow.style.borderRadius = "12px";
    settingsWindow.style.boxShadow = "0 12px 40px rgba(0,0,0,0.4)";
    settingsWindow.style.padding = "18px";
    settingsWindow.style.display = "flex";
    settingsWindow.style.flexDirection = "column";
    settingsWindow.style.gap = "12px";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.justifyContent = "space-between";
    head.style.alignItems = "center";
    head.innerHTML = `<div style="font-weight:700;font-size:18px">Настройки HUD</div>`;
    settingsWindow.appendChild(head);

    // content form
    const form = document.createElement("div");
    form.style.flex = "1";
    form.style.overflow = "auto";
    form.style.paddingRight = "6px";
    form.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="min-width:240px;">
          <label>Тема</label>
          <select id="cs2_theme_select" style="width:100%;padding:8px;margin-top:6px">
             <option value="light">Светлая</option>
             <option value="dark">Тёмная</option>
          </select>
        </div>
        <div style="min-width:240px;">
          <label>Непрозрачность фона (${state.bgOpacity})</label>
          <input id="cs2_bg_op" type="range" min="0.3" max="1" step="0.01" style="width:100%" />
        </div>
        <div style="min-width:240px;">
          <label>Непрозрачность текста (${state.textOpacity})</label>
          <input id="cs2_text_op" type="range" min="0.5" max="1" step="0.01" style="width:100%" />
        </div>
      </div>
      <hr />
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <label><input id="cs2_show_curr" type="checkbox" /> Показ текущего коэффициента</label>
        <label><input id="cs2_show_statsline" type="checkbox" /> Показ пинг/CPU/время</label>
        <label><input id="cs2_scale_text" type="checkbox" /> Масштаб окна вместе с текстом</label>
      </div>
      <hr />
      <div style="display:flex;gap:12px;align-items:center;">
        <button id="cs2_reset_btn" style="padding:8px 12px;border-radius:8px">Сброс настроек</button>
        <button id="cs2_clear_logs" style="padding:8px 12px;border-radius:8px">Очистить логи</button>
        <div style="margin-left:auto;color:var(--muted)">Версия: ${VERSION}</div>
      </div>
      <hr />
      <div style="font-size:13px;color:var(--muted);">
        Автор проекта: <b>saxarok322</b>
      </div>
    `;
    settingsWindow.appendChild(form);

    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.gap = "8px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Закрыть";
    cancelBtn.style.padding = "8px 12px";
    cancelBtn.style.borderRadius = "8px";

    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Применить";
    applyBtn.style.padding = "8px 12px";
    applyBtn.style.borderRadius = "8px";
    applyBtn.style.background = "#007aff";
    applyBtn.style.color = "#fff";

    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
    settingsWindow.appendChild(footer);

    document.body.appendChild(settingsWindow);

    // fill controls with current values
    document.getElementById("cs2_bg_op").value = state.bgOpacity;
    document.getElementById("cs2_text_op").value = state.textOpacity;
    document.getElementById("cs2_theme_select").value = state.theme;
    document.getElementById("cs2_show_curr").checked = state.showCurrent;
    document.getElementById("cs2_show_statsline").checked = state.showStatsLine;
    document.getElementById("cs2_scale_text").checked = state.scaleTextWithWindow;

    // make dragable by header
    makeDraggable(settingsWindow, head);

    // reset confirm
    document.getElementById("cs2_reset_btn").addEventListener("click", () => {
      if (confirm("Сбросить все настройки HUD к значениям по умолчанию?")) {
        state = { ...DEFAULTS };
        saveState(state);
        // re-render HUD
        recreateHUD();
        settingsWindow.remove();
        settingsWindow = null;
      }
    });

    document.getElementById("cs2_clear_logs").addEventListener("click", () => {
      if (confirm("Очистить логи?")) {
        localStorage.removeItem(LOGS_KEY);
        alert("Логи очищены");
      }
    });

    cancelBtn.addEventListener("click", () => {
      settingsWindow.remove();
      settingsWindow = null;
    });

    applyBtn.addEventListener("click", () => {
      // read values and apply live
      const newTheme = document.getElementById("cs2_theme_select").value;
      const newBgOp = parseFloat(document.getElementById("cs2_bg_op").value);
      const newTextOp = parseFloat(document.getElementById("cs2_text_op").value);
      const newShowCurr = document.getElementById("cs2_show_curr").checked;
      const newShowStatsLine = document.getElementById("cs2_show_statsline").checked;
      const newScaleText = document.getElementById("cs2_scale_text").checked;

      state.theme = newTheme;
      state.bgOpacity = newBgOp;
      state.textOpacity = newTextOp;
      state.showCurrent = newShowCurr;
      state.showStatsLine = newShowStatsLine;
      state.scaleTextWithWindow = newScaleText;
      saveState(state);

      recreateHUD(); // rebuild to apply theme and ops
      // keep settings window open (apply without reload)
    });
  }

  // ====== Logs window ======
  let logsWindow = null;
  function openLogsWindow() {
    if (logsWindow) return;
    logsWindow = document.createElement("div");
    logsWindow.style.position = "fixed";
    logsWindow.style.left = "50%";
    logsWindow.style.top = "50%";
    logsWindow.style.transform = "translate(-50%,-50%)";
    logsWindow.style.width = Math.min(900, Math.round(window.innerWidth * 0.6)) + "px";
    logsWindow.style.height = Math.min(600, Math.round(window.innerHeight * 0.6)) + "px";
    logsWindow.style.zIndex = 1000001;
    logsWindow.style.background = state.theme === "dark" ? "#111" : "#fff";
    logsWindow.style.color = getTextColor(state.theme);
    logsWindow.style.borderRadius = "12px";
    logsWindow.style.padding = "12px";
    logsWindow.style.boxShadow = "0 12px 40px rgba(0,0,0,0.4)";
    logsWindow.style.overflow = "auto";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.justifyContent = "space-between";
    head.style.alignItems = "center";
    head.style.marginBottom = "12px";
    head.innerHTML = `<div style="font-weight:700">Логи HUD (последние)</div>`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Закрыть";
    closeBtn.style.padding = "6px 10px";
    closeBtn.style.borderRadius = "8px";
    closeBtn.addEventListener("click", () => {
      logsWindow.remove();
      logsWindow = null;
    });
    head.appendChild(closeBtn);
    logsWindow.appendChild(head);

    const list = document.createElement("div");
    list.style.fontSize = "13px";
    list.style.lineHeight = "1.4";
    const rows = getLogs();
    if (!rows.length) list.innerHTML = "<i>Нет записей</i>";
    else {
      list.innerHTML = rows.map(r => {
        const t = new Date(r.ts).toLocaleString("ru-RU", { hour12:false, timeZone: "Asia/Omsk" });
        const updatedMark = r.updated ? " (данные обновлены)" : " (данные не обновлялись)";
        // build a readable text
        let gist = `<b>${t}</b> — ${r.note ?? ""}`;
        if (r.count != null) gist += ` | игры: ${r.count}`;
        if (r.avg10 != null) gist += ` | 10: ${r.avg10}x`;
        if (r.avg25 != null) gist += ` | 25: ${r.avg25}x`;
        if (r.avg50 != null) gist += ` | 50: ${r.avg50}x`;
        if (r.totalAvg != null) gist += ` | avg: ${r.totalAvg}x`;
        if (r.max24h != null) gist += ` | max24h: ${r.max24h}x`;
        if (r.lastCrash != null) gist += ` | last: ${r.lastCrash}x`;
        return `<div style="padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.06)">${gist}${updatedMark}</div>`;
      }).join("");
    }
    logsWindow.appendChild(list);

    document.body.appendChild(logsWindow);
    makeDraggable(logsWindow, head);
  }

  // ====== recreateHUD (apply changes) ======
  let refs = null;
  function recreateHUD() {
    // remove old
    document.getElementById("cs2run_hud_final")?.remove();
    // build new
    refs = createHUD();
    // after recreation we must restore last shown values if we have them in localStorage logs
    // if there was last payload stored in logs, use it to render initial content
    const logs = getLogs();
    if (logs && logs.length) {
      const last = logs[0];
      // some fields may be present
      const payload = {
        avg10: last.avg10,
        avg25: last.avg25,
        avg50: last.avg50,
        totalAvg: last.totalAvg,
        max24h: last.max24h,
        count: last.count,
        updatedAt: last.updatedAt,
        currentPeriod: last.currentPeriod,
        lastCrash: last.lastCrash,
        ping: last.ping,
        cpuLoad: last.cpuLoad
      };
      renderPayload(payload, false);
    }
  }

  // ====== Rendering payload into HUD ======
  function renderPayload(d = {}, fromNetwork = true) {
    refs = refs || createHUD();
    const { content, crashEl, loadingOv } = refs;

    // fill fields
    const el = (id) => document.getElementById(id);
    if (el("cs2_avg10")) el("cs2_avg10").textContent = (d.avg10 != null && !isNaN(d.avg10)) ? d.avg10.toFixed(2) + "x" : "—";
    if (el("cs2_avg25")) el("cs2_avg25").textContent = (d.avg25 != null && !isNaN(d.avg25)) ? d.avg25.toFixed(2) + "x" : "—";
    if (el("cs2_avg50")) el("cs2_avg50").textContent = (d.avg50 != null && !isNaN(d.avg50)) ? d.avg50.toFixed(2) + "x" : "—";
    if (el("cs2_totalAvg")) el("cs2_totalAvg").textContent = (d.totalAvg != null && !isNaN(d.totalAvg)) ? d.totalAvg.toFixed(2) + "x" : "—";
    if (el("cs2_count")) el("cs2_count").textContent = d.count ?? "—";
    if (el("cs2_max24")) el("cs2_max24").textContent = (d.max24h != null && !isNaN(d.max24h)) ? d.max24h.toFixed(2) + "x" : "—";
    if (el("cs2_ping")) el("cs2_ping").textContent = (d.ping != null) ? Number(d.ping).toFixed(3) : "—";
    if (el("cs2_cpu")) el("cs2_cpu").textContent = (d.cpuLoad != null) ? Number(d.cpuLoad).toFixed(2) + "%" : "—";
    if (el("cs2_updated")) el("cs2_updated").textContent = fmtTimeSmart(d.updatedAt);

    // current crash formatting with colors and animation
    const crash = d.lastCrash ?? d.last_crash ?? d.last ?? null;
    const crashVal = (typeof crash === "number" && !isNaN(crash)) ? Number(crash) : null;
    if (state.showCurrent && crashVal !== null) {
      // determine color ranges
      let color = "#007AFF"; // default blue
      if (crashVal < 1.2) color = "#FF3B30";
      else if (crashVal < 2) color = "#5AC8FA";
      else if (crashVal < 4) color = "#FF2D8C"; // pink for 2-3.99 (use same pink)
      else if (crashVal < 8) color = "#34C759";
      else if (crashVal < 25) color = "#FFD60A";
      else color = null; // gradient
      if (crashEl) {
        crashEl.textContent = crashVal.toFixed(2) + "x";
        if (color) {
          crashEl.style.background = "none";
          crashEl.style.color = color;
          crashEl.style.webkitBackgroundClip = "unset";
          crashEl.style.webkitTextFillColor = "unset";
        } else {
          crashEl.style.background = "linear-gradient(90deg,#9b4dff,#3cd3ff)";
          crashEl.style.webkitBackgroundClip = "text";
          crashEl.style.webkitTextFillColor = "transparent";
        }
        // add highlight pulse animation
        crashEl.animate([
          { transform: "scale(1.02)", opacity: 0.9, filter: "brightness(1.15)" },
          { transform: "scale(1)", opacity: 1, filter: "brightness(1)" }
        ], { duration: 500, easing: "ease-out" });
      }
    } else {
      if (crashEl) crashEl.textContent = "";
    }

    // hide/show statsline based on settings
    const statsLine = el("cs2_ping")?.parentElement;
    if (statsLine) {
      statsLine.style.display = state.showStatsLine ? "block" : "none";
    }

    // hide/show current
    if (refs.crashEl) refs.crashEl.style.display = state.showCurrent ? "inline-block" : "none";

    // if loading overlay is visible -> fade it out after 500ms
    if (loadingOv && !loadingOv.hidden) {
      // animate progress to 95%
      const prog = document.getElementById("cs2run_progress");
      if (prog) {
        prog.style.transition = "width 0.5s linear";
        prog.style.width = "95%";
      }
      setTimeout(() => {
        loadingOv.style.opacity = "0";
        setTimeout(() => {
          loadingOv.hidden = true;
          loadingOv.style.opacity = "1";
          // reset progress
          if (prog) { prog.style.width = "0%"; prog.style.transition = "width 2s linear"; }
        }, 500);
      }, 500);
    }

    // store in logs
    pushLog({
      updated: !!fromNetwork,
      avg10: d.avg10,
      avg25: d.avg25,
      avg50: d.avg50,
      totalAvg: d.totalAvg,
      max24h: d.max24h,
      count: d.count,
      updatedAt: d.updatedAt,
      lastCrash: crashVal,
      ping: d.ping,
      cpuLoad: d.cpuLoad,
      note: d.note ?? ""
    });
  }

  // ====== Start Ably and subscription ======
  async function start() {
    await ensureAbly();
    // create HUD refs
    refs = createHUD();

    // Ably connection
    const client = new Ably.Realtime(ABLY_PUBLIC_KEY);
    const channel = client.channels.get("cs2run");

    // show loading overlay until first update
    const loadingOv = document.getElementById("cs2run_loading_overlay");
    if (loadingOv) {
      loadingOv.hidden = false;
      const prog = document.getElementById("cs2run_progress");
      if (prog) {
        // animate slowly towards 70% as heartbeat
        prog.style.width = "70%";
      }
    }

    channel.subscribe("update", (msg) => {
      try {
        const data = msg.data || {};
        // ensure numbers
        if (data.max24h != null && typeof data.max24h === "number") data.max24h = Number(data.max24h);
        // render
        renderPayload(data, true);
      } catch (e) {
        console.warn("Render error:", e);
      }
    });

    // also try to load last saved log and render it
    const logs = getLogs();
    if (logs.length) {
      renderPayload(logs[0], false);
      // hide loading overlay gently
      const loadingOv = document.getElementById("cs2run_loading_overlay");
      if (loadingOv) {
        setTimeout(() => {
          loadingOv.style.opacity = "0";
          setTimeout(() => { loadingOv.hidden = true; loadingOv.style.opacity = "1"; }, 500);
        }, 500);
      }
    }
  }

  // ====== small utilities to format and CSS ======
  // Run
  recreateHUD();
  createPinButton();
  start().catch(err => console.error("Ably start failed:", err));

  // ====== Public helper: update HUD from external (if needed) ======
  window.__cs2run_hud_update = (payload) => renderPayload(payload, true);

})();
