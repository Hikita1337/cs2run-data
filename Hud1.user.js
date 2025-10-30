// ==UserScript==
// @name         CS2Run HUD
// @namespace    cs2run.hud
// @version      1.0
// @description  HUD для статистики CS2Run
// @match        https://cs2run.bet/*
// @grant        none
// @inject-into  content
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

  document.getElementById("cs2run_hud_final")?.remove();

  const hud = document.createElement("div");
  hud.id = "cs2run_hud_final";
  hud.style.cssText = `
    position:fixed;
    right:20px;
    top:20px;
    width:320px;
    background:rgba(255,255,255,0.9);
    padding:10px;
    border-radius:8px;
    z-index:999999;
    font-family:system-ui;
    color:#000;
    text-align:left;
  `;
  hud.innerHTML = `
    <div style="font-weight:600;font-size:15px;">🎯 CS2Run (live)</div>
    <div style="margin-top:8px;font-size:14px;">⏳ Ожидание ответа от сервера...</div>
  `;
  document.body.appendChild(hud);

  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time = d.toLocaleTimeString("ru-RU", { hour12: false, timeZone: tz });
    return `${time}.${ms}`;
  }

  let lastData = null;
  let statusText = "";
  let statusTimeout = null;

  function render(d) {
    const ta = d.timeAverages || {};
    hud.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">🎯 CS2Run (live)</div>
      <div>📊 10 игр — <b>${d.avg10 ?? "—"}</b></div>
      <div>📊 25 игр — <b>${d.avg25 ?? "—"}</b></div>
      <div>📊 50 игр — <b>${d.avg50 ?? "—"}</b></div>
      <hr style="margin:6px 0;">
      <div>📈 Среднее за все игры (${d.count ?? "—"}): <b>${d.totalAvg ?? "—"}</b></div>
      <div style="margin-top:6px;color:#FF9500;">🔥 Максимум за сутки: <b>${d.max24h ?? "—"}</b></div>
      <div style="margin-top:8px;font-size:13px;"><b>🕓 Средние по времени суток</b></div>
      <div style="font-size:13px;">
        🌙 Ночь: <b>${ta.night ?? "—"}</b><br>
        🌅 Утро: <b>${ta.morning ?? "—"}</b><br>
        🌞 День: <b>${ta.day ?? "—"}</b><br>
        🌇 Вечер: <b>${ta.evening ?? "—"}</b>
      </div>
      <hr style="margin:6px 0;">
      <div>⚡ Пинг: <b>${d.ping !== null && d.ping !== undefined ? d.ping.toFixed(3) + " s" : "—"}</b>
        &nbsp; | &nbsp; 🧩 CPU: <b>${d.cpuLoad ?? "—"} %</b>
      </div>
      <div style="font-size:12px;color:#666;margin-top:6px;">
        🕓 Обновлено: <b>${fmtTime(d.updatedAt)}</b><br>
        <span style="color:#007AFF;font-weight:600;">${statusText}</span>
      </div>
    `;
  }

  channel.subscribe("update", (msg) => {
    const newData = msg.data || {};

    if (!lastData) hud.innerHTML = "";

    lastData = {
      ...lastData,
      ...Object.fromEntries(Object.entries(newData).filter(([_, v]) => v != null))
    };

    statusText = "🟢 Игра найдена";
    render(lastData);

    clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusText = "🟡 Поиск игры...";
      render(lastData);
    }, 4000);
  });
})();
