// ==UserScript==
// @name         CS2Run
// @namespace    cs2run.hud
// @version      1.0
// @description  HUD статистики CS2Run (автоматический запуск)
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
    await new Promise((resolve, reject) => {
      s.onload = resolve;
      s.onerror = () => reject("Не удалось загрузить Ably SDK");
    });
  }

  const client = new Ably.Realtime(ABLY_PUBLIC_KEY);
  const channel = client.channels.get("cs2run");

  const HUD_ID = "cs2run_hud_final";
  document.getElementById(HUD_ID)?.remove();

  const saved = JSON.parse(localStorage.getItem("cs2run_hud_state") || "{}");
  const hud = document.createElement("div");
  hud.id = HUD_ID;
  hud.style.cssText = `
    position: fixed;
    top: ${saved.top ?? 20}px;
    left: ${saved.left ?? 20}px;
    width: ${saved.width ?? 320}px;
    min-width: 25px;
    min-height: 20px;
    background: rgba(255,255,255,0.92);
    padding: 10px;
    border-radius: 8px;
    z-index: 999999;
    font-family: system-ui;
    color: #000;
    text-align: left;
    backdrop-filter: blur(6px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transition: width 0.1s ease, height 0.1s ease;
    overflow: hidden;
    white-space: nowrap;
  `;
  document.body.appendChild(hud);

  // 🟢 Кнопка перетаскивания (ещё -5%)
  const moveBtn = document.createElement("div");
  moveBtn.textContent = "🤚";
  moveBtn.style.cssText = `
    position: absolute;
    bottom: 2px;
    left: 2px;
    font-size: 15.8px; /* стало меньше */
    background: rgba(255, 255, 255, 0.8);
    border-radius: 6px;
    padding: 2px 4px;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
    opacity: 0.95;
    cursor: grab;
    touch-action: none;
    user-select: none;
  `;
  hud.appendChild(moveBtn);

  // 🟣 Кнопка изменения размера (ещё -5%)
  const resizeBtn = document.createElement("div");
  resizeBtn.textContent = "↘️";
  resizeBtn.style.cssText = `
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 14.2px; /* стало меньше */
    background: rgba(255, 255, 255, 0.8);
    border-radius: 6px;
    padding: 2px 4px;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
    opacity: 0.95;
    cursor: nwse-resize;
    touch-action: none;
    user-select: none;
  `;
  hud.appendChild(resizeBtn);

  // Контент
  const content = document.createElement("div");
  content.style.cssText = `
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    width: 100%;
  `;
  content.innerHTML = `
    <div style="font-weight:600;font-size:15px;">🎯 CS2Run (live)</div>
    <div style="margin-top:8px;font-size:14px;">⏳ Загрузка данных...</div>`;
  hud.appendChild(content);

  // ===== Перемещение =====
  let drag = null;
  let raf = null;
  const startDrag = (e) => {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    drag = { x: t.clientX, y: t.clientY, left: hud.offsetLeft, top: hud.offsetTop };
  };
  const onDrag = (e) => {
    if (!drag) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - drag.x;
    const dy = t.clientY - drag.y;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      hud.style.left = drag.left + dx + "px";
      hud.style.top = drag.top + dy + "px";
    });
  };
  const stopDrag = () => {
    if (!drag) return;
    localStorage.setItem("cs2run_hud_state", JSON.stringify({
      ...JSON.parse(localStorage.getItem("cs2run_hud_state") || "{}"),
      left: hud.offsetLeft,
      top: hud.offsetTop,
      width: hud.offsetWidth
    }));
    drag = null;
  };
  moveBtn.addEventListener("mousedown", startDrag);
  moveBtn.addEventListener("touchstart", startDrag);
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("touchmove", onDrag);
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);

  // ===== Изменение размера =====
  let resize = null;
  const startResize = (e) => {
    e.preventDefault();
    const t = e.touches ? e.touches[0] : e;
    resize = { x: t.clientX, y: t.clientY, w: hud.offsetWidth, h: hud.offsetHeight };
  };
  const onResize = (e) => {
    if (!resize) return;
    const t = e.touches ? e.touches[0] : e;
    const dw = t.clientX - resize.x;
    const dh = t.clientY - resize.y;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      hud.style.width = Math.max(25, resize.w + dw) + "px";
      hud.style.height = Math.max(20, resize.h + dh) + "px";
    });
  };
  const stopResize = () => {
    if (!resize) return;
    localStorage.setItem("cs2run_hud_state", JSON.stringify({
      ...JSON.parse(localStorage.getItem("cs2run_hud_state") || "{}"),
      width: hud.offsetWidth,
      height: hud.offsetHeight
    }));
    resize = null;
  };
  resizeBtn.addEventListener("mousedown", startResize);
  resizeBtn.addEventListener("touchstart", startResize);
  document.addEventListener("mousemove", onResize);
  document.addEventListener("touchmove", onResize);
  document.addEventListener("mouseup", stopResize);
  document.addEventListener("touchend", stopResize);

  // ===== Данные =====
  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time = d.toLocaleTimeString("ru-RU", { hour12: false, timeZone: tz });
    return `${time}.${ms}`;
  }

  let lastData = JSON.parse(localStorage.getItem("cs2run_lastData") || "null");
  let statusText = "🟢 Игра найдена";
  let statusTimeout = null;

  const render = (d) => {
    const ta = d.timeAverages || {};
    content.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">🎯 CS2Run (live)</div>
      <div>📊 10 игр — <b>${d.avg10 ?? "—"}</b></div>
      <div>📊 25 игр — <b>${d.avg25 ?? "—"}</b></div>
      <div>📊 50 игр — <b>${d.avg50 ?? "—"}</b></div>
      <hr style="margin:6px 0;">
      <div>📈 Среднее (${d.count ?? "—"} игр): <b>${d.totalAvg ?? "—"}</b></div>
      <div style="margin-top:6px;color:#FF9500;">🔥 Макс за сутки: <b>${d.max24h ?? "—"}</b></div>
      <div style="margin-top:8px;font-size:13px;"><b>🕓 По времени суток</b></div>
      <div style="font-size:13px;">
        🌙 Ночь: <b>${ta.night ?? "—"}</b><br>
        🌅 Утро: <b>${ta.morning ?? "—"}</b><br>
        🌞 День: <b>${ta.day ?? "—"}</b><br>
        🌇 Вечер: <b>${ta.evening ?? "—"}</b>
      </div>
      <hr style="margin:6px 0;">
      <div>⚡ Пинг: <b>${d.ping?.toFixed?.(3) ?? "—"} s</b> | 🧩 CPU: <b>${d.cpuLoad ?? "—"} %</b></div>
      <div style="font-size:12px;color:#666;margin-top:6px;">
        🕓 Обновлено: <b>${fmtTime(d.updatedAt)}</b><br>
        <span style="color:#007AFF;font-weight:600;">${statusText}</span>
      </div>`;
  };

  if (lastData) render(lastData);

  channel.subscribe("update", (msg) => {
    const newData = msg.data || {};
    lastData = {
      ...lastData,
      ...Object.fromEntries(Object.entries(newData).filter(([_, v]) => v != null))
    };
    localStorage.setItem("cs2run_lastData", JSON.stringify(lastData));

    statusText = "🟢 Игра найдена";
    render(lastData);

    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusText = "🟡 Ждём завершения игры";
      render(lastData);
    }, 4000);
  });
})();
