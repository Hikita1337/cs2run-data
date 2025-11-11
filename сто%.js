// ==UserScript==
// @name         CS2Run HUD — Final Bundle
// @namespace    cs2rukR.hud
// @version      3.0.2
// @description  Полный HUD cs2run
// @match        *://*.run/*
// @match        *://*.bet/*
// @grant        none
// @run-at       document-end
// ==/UserScript==


const TOKEN_SERVER = "https://token-server-dkjk.onrender.com";
const SECRET_SUFFIX = "c2F4YXJvazMyMgIwjwn"; // <- твой указанный SECRET_SUFFIX
const AUTH_CHANNEL = `hud-auth-${SECRET_SUFFIX}`;
const STATS_CHANNEL = `cs2run-${SECRET_SUFFIX}`;
const INTERNAL_KEY = "Qosn82_iwnmwllq-oq92nwk92nwkkwnkJwnnJJj";

/* локальные константы безопасности */
const HUD_SECRET_KEY = "hud_protect_v1";
const HUD_SIG_FIELD = "hud_sig";
const LS_KEY = "cs2run_hud_state_v2";
/* ========================================================== */

if (location.protocol !== "https:") {
  alert("⚠️ HUD работает только через защищённое соединение HTTPS!");
  throw new Error("HUD aborted: insecure connection");
}

/* --------------------- подпись/хранение пользователя -------------------- */
async function createHudSignature(obj) {
  const msg = JSON.stringify(obj);
  const data = new TextEncoder().encode(msg + HUD_SECRET_KEY);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function saveHudUserSigned(obj) {
  try {
    const sig = await createHudSignature(obj);
    localStorage.setItem("hud_user", JSON.stringify(obj));
    localStorage.setItem(HUD_SIG_FIELD, sig);
  } catch (e) {
    console.warn("saveHudUserSigned error", e);
    localStorage.setItem("hud_user", JSON.stringify(obj));
  }
}
async function verifyHudUserSignature() {
  try {
    const raw = localStorage.getItem("hud_user");
    const sig = localStorage.getItem(HUD_SIG_FIELD);
    if (!raw || !sig) return false;
    const calc = await createHudSignature(JSON.parse(raw));
    return sig === calc;
  } catch (e) {
    return false;
  }
}
function getHudUser() {
  try { return JSON.parse(localStorage.getItem("hud_user") || "null"); } catch { return null; }
}
function saveHudUser(obj) { localStorage.setItem("hud_user", JSON.stringify(obj)); }

/* восстановление подписи, если нужно */
(async () => {
  try {
    const raw = localStorage.getItem("hud_user");
    const sig = localStorage.getItem(HUD_SIG_FIELD);
    if (raw && !sig) {
      const obj = JSON.parse(raw);
      const newSig = await createHudSignature(obj);
      localStorage.setItem(HUD_SIG_FIELD, newSig);
      console.log("🩵 Подпись HUD восстановлена автоматически");
    }
  } catch (e) {
    console.warn("⚠️ Не удалось восстановить подпись:", e);
  }
})();

/* ----------------------- showAuthWindow (изменённый порядок) -----------------------
   Порядок элементов теперь:
     - inputs (логин, пароль)
     - кнопка "Войти"
     - "Забыли пароль?" (под кнопкой, небольшой отступ)
     - статус авторизации (ниже "Забыли пароль?", по центру)
------------------------------------------------------------------------------ */
async function showAuthWindow() {
  const overlay = document.createElement("div");
  overlay.id = "hud_auth_overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display:flex; align-items:center; justify-content:center;
    z-index:2147483647; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    width: 360px; background: rgba(22,22,24,0.95);
    border-radius:12px; padding:28px 28px 22px;
    box-shadow:0 0 32px rgba(0,0,0,0.6); color:#fff; text-align:center; position:relative;
  `;

  const closeBtn = document.createElement("div");
  closeBtn.textContent = "✖";
  closeBtn.style.cssText = `
    position:absolute; right:14px; top:14px; font-size:16px; color:#888; cursor:pointer;
    transition: color .2s ease;
  `;
  closeBtn.onmouseenter = () => closeBtn.style.color = "#fff";
  closeBtn.onmouseleave = () => closeBtn.style.color = "#888";
  closeBtn.onclick = () => overlay.remove();

  const tgLabel = document.createElement("div");
  tgLabel.textContent = "Telegram бот";
  tgLabel.style.cssText = `position:absolute; right:48px; top:14px; font-size:13px; color:#0A84FF;`;

  const title = document.createElement("div");
  title.textContent = "Вход в HUD";
  title.style.cssText = `font-weight:700; font-size:18px; margin-top:10px; margin-bottom:18px;`;

  const userIn = document.createElement("input");
  userIn.placeholder = "Логин";

  const passWrap = document.createElement("div");
  passWrap.style.cssText = "position:relative;";

  const passIn = document.createElement("input");
  passIn.placeholder = "Пароль";
  passIn.type = "password";

  const eye = document.createElement("span");
  eye.textContent = "👁️";
  eye.style.cssText = `position:absolute; right:10px; top:7px; cursor:pointer; font-size:18px; user-select:none;`;
  eye.onclick = () => { passIn.type = passIn.type === "password" ? "text" : "password"; };
  passWrap.append(passIn, eye);

  const loginBtn = document.createElement("button");
  loginBtn.textContent = "Войти";
  loginBtn.style.cssText = `
    width:100%; padding:10px; background: linear-gradient(90deg,#0A84FF,#34C759);
    border:none; border-radius:8px; color:#fff; font-weight:600; font-size:15px; cursor:pointer;
    transition:opacity .3s ease, transform .2s ease;
  `;
  loginBtn.onmouseenter = () => loginBtn.style.opacity = "0.9";
  loginBtn.onmouseleave = () => loginBtn.style.opacity = "1";

  const forgotBtn = document.createElement("div");
  forgotBtn.textContent = "Забыли пароль?";
  forgotBtn.style.cssText = `margin-top:8px; color:#0A84FF; font-size:13px; cursor:pointer;`;
  forgotBtn.onclick = () => window.open("https://t.me/csgorunboost_bot?start=reset", "_blank");

  const statusEl = document.createElement("div");
  statusEl.style.cssText = `
    margin-top:10px; font-size:13px; color:#FFD60A; min-height:18px; text-align:center;
  `;

  [userIn, passIn].forEach(el => {
    el.style.cssText = `
      width:100%; padding:10px 10px; border-radius:8px; border:none; margin-bottom:12px;
      background: rgba(255,255,255,0.1); color:#fff; outline:none; font-size:14px;
    `;
  });

  // собираем в box: inputs -> button -> forgotBtn -> statusEl
  box.append(closeBtn, tgLabel, title, userIn, passWrap, loginBtn, forgotBtn, statusEl);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function showStatus(msg, color = "#FFD60A") {
    statusEl.textContent = msg;
    statusEl.style.color = color;
  }

  loginBtn.onclick = async () => {
    if (window.isLoggingIn) return;
    window.isLoggingIn = true;

    const username = userIn.value.trim();
    const password = passIn.value.trim();
    if (!username || !password) {
      showStatus("Введите данные", "#FF9500");
      window.isLoggingIn = false;
      return;
    }

    showStatus("Проверка аккаунта...", "#999");

    try {
      const deviceId = crypto.randomUUID();
      const resp = await fetch(`${TOKEN_SERVER}/auth-secure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, device_id: deviceId }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.ok) {
        showStatus(data?.error || "Ошибка входа", "#FF453A");
        window.isLoggingIn = false;
        return;
      }

      showStatus("✅ Доступ разрешён. Загружаем HUD...", "#34C759");

const hudUser = {
  user_id: data.user_id || data.user?.id,
  username: data.username || data.user?.username,
  access_token: data.access_token || data.token || null,
  auth_token: data.access_token || data.token || null, // для совместимости с кодом HUD
  refresh_token: data.refresh_token || null,
  device_id: deviceId,
  logged_at: Date.now(),
};
await saveHudUserSigned(hudUser);
      console.log("✅ Пользователь сохранён:", hudUser);

      setTimeout(async () => {
        overlay.remove();
        await initHUD?.();
      }, 800);
    } catch (err) {
      console.error("❌ Ошибка при входе:", err);
      showStatus("Ошибка связи с сервером", "#FF453A");
    } finally {
      window.isLoggingIn = false;
    }
  };
}

/* ------------------ State helpers ------------------ */
const defaults = {
  top: 20, left: 20, width: 360, height: 200,
  bgOpacity: 0.15, theme: "auto",
  showPing: true, showCpu: true, showCurrentCrash: true,
  collapsed: false, autoJoin: false,
};
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch { return { ...defaults }; }
}
function saveState(st) { localStorage.setItem(LS_KEY, JSON.stringify(st)); }
let state = loadState();

/* ------------------ Ably loader & helpers ------------------ */
const AblyScript = document.createElement("script");
AblyScript.src = "https://cdn.jsdelivr.net/npm/ably/browser/static/ably.min.js";
AblyScript.defer = true;
AblyScript.onload = () => console.log("✅ Ably библиотека загружена");
document.head.appendChild(AblyScript);

async function waitForAbly() {
  return new Promise((resolve, reject) => {
    if (window.Ably) return resolve(window.Ably);
    const start = Date.now();
    const check = setInterval(() => {
      if (window.Ably) { clearInterval(check); resolve(window.Ably); }
      else if (Date.now() - start > 10000) { clearInterval(check); reject(new Error("Ably не загрузился за 10 секунд")); }
    }, 200);
  });
}

/* ========== initAbly: обновлено чтобы менять СЛОВО "(live)" в шапке ========== */
async function initAbly() {
  try {
    await waitForAbly();
    const hudUser = JSON.parse(localStorage.getItem("hud_user") || "null");
    const userId = hudUser?.user_id;
    if (!userId) { console.warn("HUD: user_id отсутствует, Ably не запущен"); return; }

    // получить jwt через token server
   const jwtResp = await fetch(`${TOKEN_SERVER}/jwt-ably?user_id=${userId}&key=${INTERNAL_KEY}`);
    const { token: jwtToken } = await jwtResp.json().catch(() => ({}));
    if (!jwtToken) { console.warn("HUD: не удалось получить JWT для Ably"); return; }


// Подключаемся к Ably
const ably = new Ably.Realtime({
  authUrl: `${TOKEN_SERVER}/ably-token?jwt=${jwtToken}`,
  tls: true,
  echoMessages: false,
  recover: false,
});


// сохраняем глобально
window.ably = ably;

    // канал статистики
    const channel = ably.channels.get(STATS_CHANNEL);
    await new Promise((resolve, reject) => channel.attach(err => err ? reject(err) : resolve()));
    window.ably = ably;
    window.ablyChannel = channel;

    channel.subscribe("update", msg => {
      const data = msg.data;
      if (typeof renderPayload === "function") {
        if (!document.getElementById("cs_avg10")) {
          setTimeout(() => renderPayload(data), 800);
        } else {
          renderPayload(data);
        }
      }
    });

    // auth channel (system notifications)
    const authChannel = ably.channels.get(AUTH_CHANNEL);
    window.ablyAuthChannel = authChannel;
    authChannel.subscribe("subscription_expired", msg => {
      console.warn("⛔ Подписка истекла:", msg.data);
      localStorage.removeItem("hud_user");
      alert("❌ Подписка истекла. Требуется новый вход.");
      location.reload();
    });
    authChannel.subscribe("force_logout", msg => {
      console.warn("🚪 Принудительный выход:", msg.data);
      localStorage.removeItem("hud_user");
      const reason = msg.data?.reason || "Неизвестная причина";
      alert(`🚫 Вы были отключены администратором.\nПричина: ${reason}`);
      location.reload();
    });

    console.log("✅ Ably подключён и подписан на каналы:", STATS_CHANNEL, AUTH_CHANNEL);
  } catch (err) {
    console.error("❌ Ошибка initAbly:", err);
  } finally {
  }
} 

/* ------------------ initHUD (полный интерфейс HUD) ------------------ */
async function initHUD() {
  console.log("🚀 Инициализация HUD...");

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
      el.style.color = `rgba(20,20,20,${state.textOpacity || 0.9})`;
      el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    } else {
      const bg = getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      let bright = 255;
      if (m) bright = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
      if (bright < 128) applyThemeToElement(el, "dark"); else applyThemeToElement(el, "light");
    }
  }

 // стили
const style = document.createElement("style");
style.textContent = `
  @keyframes cs_highlight {
    0% { transform:scale(1.03); filter:brightness(1.15); opacity:0.9 }
    100% { transform:scale(1); filter:brightness(1); opacity:1 }
  }
  .cs-highlight { animation: cs_highlight .5s ease; }

  .cs-settings-backdrop {
    position:fixed; inset:0;
    display:flex; align-items:center; justify-content:center;
    z-index:1000001;
    background: rgba(0,0,0,0.25);
  }
  .cs-settings {
    width:46vw; max-width:720px; min-width:320px;
    height:52vh;
    background:rgba(255,255,255,0.98);
    border-radius:12px;
    padding:14px;
    box-shadow:0 6px 30px rgba(0,0,0,0.4);
    display:flex; flex-direction:column; gap:10px;
    box-sizing:border-box;
  }
  .cs-settings.dark { background: rgba(28,28,30,0.98); color: #EEE; }
  .cs-row { display:flex; align-items:center; gap:10px; justify-content:space-between; }
  .cs-row label { font-size:13px; }
  .cs-gear { position:absolute; right:10px; top:8px; cursor:pointer; user-select:none; }

  .ios-toggle {
    appearance:none; width:38px; height:20px;
    background:#ccc; border-radius:10px;
    position:relative; outline:none; cursor:pointer;
    transition:background .25s ease;
  }
  .ios-toggle::before {
    content:""; position:absolute; left:2px; top:2px;
    width:16px; height:16px; border-radius:50%;
    background:white; transition:transform .25s ease;
  }
  .ios-toggle:checked { background:#34C759; }
  .ios-toggle:checked::before { transform:translateX(18px); }
`;
document.head.appendChild(style);

  // top row
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

// title with word (live) — теперь корректный id и начальный статус
const titleEl = document.createElement("div");
titleEl.innerHTML = `<span style="font-weight:700;font-size:15px;">🎯 CS2Run</span>`;
topRow.appendChild(titleEl);

  const rightControls = document.createElement("div");
  rightControls.style.display = "flex";
  rightControls.style.alignItems = "center";
  rightControls.style.gap = "8px";

  // crash value
  const crashVal = document.createElement("span");
  crashVal.id = "cs_crash_val";
  crashVal.style.marginLeft = "8px";
  crashVal.style.fontWeight = "700";
  crashVal.style.fontSize = "16px";
  crashVal.style.transition = "all .3s ease";
  titleEl.appendChild(crashVal);

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
  const gameCountLine = line("🎮 Игр в базе:", "cs_gameCount");
  statsArea.appendChild(gameCountLine);
// === Строка таймера авто-розыгрыша ===
const autoJoinInfo = document.createElement("div");
autoJoinInfo.id = "autoJoinInfo";
autoJoinInfo.style.cssText = `
  width: 100%;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255,255,255,0.9);
  margin-top: 2px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  pointer-events: none;
`;
hud.appendChild(autoJoinInfo);
  // bottom row
  const bottomRow = document.createElement("div");
  bottomRow.style.display = "flex";
  bottomRow.style.justifyContent = "space-between";
  bottomRow.style.alignItems = "center";
  bottomRow.style.fontSize = "12px";
  bottomRow.style.color = "rgba(0,0,0,0.65)";
  bottomRow.style.opacity = state.textOpacity || 0.9;
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

  hud.style.padding = "0";

  // resize handle
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
  resizeHandle.style.transition = "opacity .3s ease";
  resizeHandle.style.zIndex = "1000003";
  resizeHandle.style.pointerEvents = "none";
  hud.appendChild(resizeHandle);

  // collapse icon
  const collapseIcon = document.createElement("div");
  collapseIcon.textContent = "—";
  collapseIcon.style.fontSize = "18px";
  collapseIcon.style.fontWeight = "900";
  collapseIcon.style.cursor = "pointer";
  collapseIcon.style.marginRight = "27px";
  collapseIcon.style.userSelect = "none";
  collapseIcon.style.opacity = "0.9";
  collapseIcon.style.transition = "opacity .2s ease";
  collapseIcon.title = "Свернуть HUD";
  collapseIcon.onclick = () => {
    hud.style.opacity = "0";
    setTimeout(() => { hud.style.display = "none"; hud.style.opacity = "1"; showRestoreButton(); }, 200);
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
  restoreButton.style.transition = "opacity .2s ease";
  restoreButton.onclick = () => {
    restoreButton.style.display = "none";
    hud.style.display = "flex"; hud.style.opacity = "0";
    setTimeout(() => hud.style.opacity = "1", 10);
    state.collapsed = false; saveState(state);
  };
  document.body.appendChild(restoreButton);
  function showRestoreButton() { restoreButton.style.display = "flex"; restoreButton.style.opacity = "0"; setTimeout(() => restoreButton.style.opacity = "1", 100); }

  // drag & resize (kept similar)
  let dragInfo = null, resizeInfo = null, raf = null;
  const startDrag = (e) => {
    const tgt = e.target;
    if (tgt.closest && (tgt.closest('.cs-gear') || tgt.closest('button') || tgt === collapseIcon)) return;
    const t = e.touches ? e.touches[0] : e;
    dragInfo = { x: t.clientX, y: t.clientY, left: hud.offsetLeft, top: hud.offsetTop };
  };
  const onDrag = (e) => {
    if (!dragInfo || !hud) return;
    if (typeof dragInfo.left !== "number" || typeof dragInfo.top !== "number") { dragInfo = null; return; }
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - dragInfo.x; const dy = t.clientY - dragInfo.y;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { hud.style.left = (dragInfo.left + dx) + "px"; hud.style.top = (dragInfo.top + dy) + "px"; });
  };
  const stopDrag = () => { if (!dragInfo) return; state.left = hud.offsetLeft; state.top = hud.offsetTop; saveState(state); dragInfo = null; };
  topRow.style.cursor = "grab"; topRow.style.touchAction = "none";
  topRow.addEventListener("mousedown", startDrag);
  topRow.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("touchmove", onDrag, { passive: false });
  document.addEventListener("mouseup", stopDrag);
  document.addEventListener("touchend", stopDrag);

  const startResize = (e) => { e.preventDefault(); const t = e.touches ? e.touches[0] : e; resizeInfo = { x: t.clientX, y: t.clientY, w: hud.offsetWidth, h: hud.offsetHeight }; };
  const onResize = (e) => { if (!resizeInfo) return; const t = e.touches ? e.touches[0] : e; const dw = t.clientX - resizeInfo.x, dh = t.clientY - resizeInfo.y; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { hud.style.width = Math.max(200, resizeInfo.w + dw) + "px"; hud.style.height = Math.max(120, resizeInfo.h + dh) + "px"; }); };
  const stopResize = () => { if (!resizeInfo) return; state.width = hud.offsetWidth; state.height = hud.offsetHeight; saveState(state); resizeInfo = null; };
  resizeHandle.addEventListener("mousedown", startResize); resizeHandle.addEventListener("touchstart", startResize, { passive: false });
  document.addEventListener("mousemove", onResize); document.addEventListener("touchmove", onResize, { passive: false });
  document.addEventListener("mouseup", stopResize); document.addEventListener("touchend", stopResize);

  // render/update
  let lastPayload = {};
  function colorForCrash(c) {
    if (c == null) return "#007AFF";
    if (c < 1.2) return "#FF3B30";
    if (c < 2) return "#5AC8FA";
    if (c < 4) return "#c958d2";
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
    if (state.showPing) { const p = document.createElement("div"); p.textContent = `⚡ Пинг: ${typeof lastPayload.ping === "number" ? lastPayload.ping.toFixed(3) + " s" : lastPayload.ping ?? "—"}`; perfEl.appendChild(p); }
    if (state.showCpu) { const c = document.createElement("div"); c.textContent = `🧩 CPU: ${lastPayload.cpuLoad ?? "—"}%`; perfEl.appendChild(c); }
    updateBottomLayout();
  }

  function renderPayload(d) {
    window.renderPayload = renderPayload; // expose
    lastPayload = { ...lastPayload, ...d };
    function formatVal(v) { if (v == null || v === "—" || v === "") return "—"; const num = Number(v); return isNaN(num) ? v : num.toFixed(2) + "x"; }
    try { document.getElementById("cs_avg10").textContent = formatVal(lastPayload.avg10); } catch {}
    try { document.getElementById("cs_avg25").textContent = formatVal(lastPayload.avg25); } catch {}
    try { document.getElementById("cs_avg50").textContent = formatVal(lastPayload.avg50); } catch {}
    try { document.getElementById("cs_totalAvg").textContent = formatVal(lastPayload.totalAvg); } catch {}
    try { document.getElementById("cs_max24h").textContent = formatVal(lastPayload.max24h); } catch {}
    try { const el = document.getElementById("cs_gameCount"); if (el) { el.textContent = lastPayload.totalGames ?? "—"; el.classList.remove("cs-highlight"); void el.offsetWidth; el.classList.add("cs-highlight"); } } catch {}
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

  // subscribe if already have channel
  window.ablyChannel?.subscribe("update", (msg) => { const data = msg.data || {}; renderPayload(data); });

  // загрузка кеша через jwt-cache (короткий срок жизни)
  (async () => {
    try {
      const hudUser = JSON.parse(localStorage.getItem("hud_user") || "null");
      const userId = hudUser?.user_id;
      if (!userId) throw new Error("user_id отсутствует в localStorage");

      console.log("📡 Запрос на jwt-cache:", `${TOKEN_SERVER}/jwt-cache?user_id=${userId}`);
      let token = null;
      try {
        const jwtResp = await fetch(`${TOKEN_SERVER}/jwt-cache?user_id=${userId}&key=${INTERNAL_KEY}`);
        const rawText = await jwtResp.text();
        const parsed = JSON.parse(rawText);
        token = parsed?.token ?? null;
        console.log("🔑 JWT для кеша:", token || "⛔ не получен");
        if (!token) throw new Error("JWT не получен");
      } catch (err) {
        console.error("❌ Ошибка получения JWT:", err);
      }

      const cacheResp = await fetch(`${TOKEN_SERVER}/api/last-stats.json`, { headers: { Authorization: `Bearer ${token}` } });
      if (!cacheResp.ok) throw new Error(`Cache error ${cacheResp.status}`);
      const cacheData = await cacheResp.json();
      console.log("💾 Кэш загружен:", cacheData);
      renderPayload(cacheData);
      localStorage.setItem("cs2run_lastData", JSON.stringify(cacheData));
    } catch (e) {
      console.warn("⚠️ Ошибка загрузки кэша:", e);
    }
  })();

  try { const lastSaved = JSON.parse(localStorage.getItem("cs2run_lastData") || "null"); if (lastSaved) renderPayload(lastSaved); } catch {}

  crashVal.style.display = state.showCurrentCrash ? "" : "none";
  bottomRow.style.opacity = state.textOpacity || 0.9;
  applyThemeToElement(hud, state.theme);

  if (state.collapsed) { hud.style.display = "none"; showRestoreButton(); }

  gear.addEventListener("click", openSettings);

  setTimeout(() => {
    requestAnimationFrame(() => {
      gear.style.opacity = "1"; gear.style.pointerEvents = "auto";
      resizeHandle.style.opacity = "0.8"; resizeHandle.style.pointerEvents = "auto";
    });
  }, 200);

  // =========== Настройки (openSettings / closeSettings) ===========
  let settingsBackdrop = null, settingsModal = null, tempState = null;
  const baseBtnStyle = "flex:1; padding:8px 0; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px;";

  function createToggleRow(labelText, key) {
    const row = document.createElement("div");
    row.className = "cs-row";
    const label = document.createElement("label"); label.textContent = labelText;
    const input = document.createElement("input"); input.type = "checkbox"; input.className = "ios-toggle"; input.checked = tempState[key] ?? false;
    input.onchange = () => {
      tempState[key] = input.checked;
      if (key === "autoJoin") {
        state.autoJoin = input.checked; saveState(state);
        const toast = document.createElement("div");
        toast.textContent = input.checked ? "🎮 Авто-розыгрыш включён" : "⏹ Авто-розыгрыш выключен";
        Object.assign(toast.style, { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%) scale(0.95)", background: "rgba(0,0,0,0.6)", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontWeight: "500", fontSize: "12.5px", zIndex: "1000005", opacity: "0", transition: "opacity .35s ease, transform .35s ease", pointerEvents: "none", textAlign: "center", backdropFilter: "blur(4px)" });
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translate(-50%,-50%) scale(1)"; });
        setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translate(-50%,-50%) scale(0.95)"; setTimeout(() => toast.remove(), 400); }, 1600);
      }
    };
    row.append(label, input);
    return row;
  }

  function closeSettings() { if (!settingsBackdrop) return; settingsBackdrop.remove(); settingsBackdrop = null; settingsModal = null; }

  function openSettings() {
    if (settingsBackdrop) return;
    tempState = { ...state };
    settingsBackdrop = document.createElement("div"); settingsBackdrop.className = "cs-settings-backdrop";
    settingsModal = document.createElement("div"); settingsModal.className = "cs-settings"; settingsModal.style.position = "relative";

    if (state.theme === "dark") { settingsModal.classList.add("dark"); settingsModal.style.background = "rgba(28,28,30,0.98)"; settingsModal.style.color = "#EEE"; }
    else if (state.theme === "light") { settingsModal.style.background = "rgba(255,255,255,0.95)"; settingsModal.style.color = "#1C1C1E"; }
    else { const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches; if (prefersDark) { settingsModal.classList.add("dark"); settingsModal.style.background = "rgba(28,28,30,0.98)"; settingsModal.style.color = "#EEE"; } else { settingsModal.style.background = "rgba(255,255,255,0.95)"; settingsModal.style.color = "#1C1C1E"; } }

    const header = document.createElement("div"); header.style.display = "flex"; header.style.justifyContent = "space-between"; header.style.alignItems = "center"; header.innerHTML = `<div style="font-weight:700">Настройки HUD</div><div style="font-size:12px;color:#888">v2.0</div>`;
    settingsModal.appendChild(header);

    // Тема
    const rowTheme = document.createElement("div"); rowTheme.className = "cs-row";
    const labelTheme = document.createElement("label"); labelTheme.textContent = "Тема";
    const selTheme = document.createElement("select");
    selTheme.style.width = "110px"; selTheme.style.marginLeft = "8px"; selTheme.style.background = "rgba(255,255,255,0.08)"; selTheme.style.color = "inherit"; selTheme.style.border = "1px solid rgba(255,255,255,0.12)"; selTheme.style.borderRadius = "6px"; selTheme.style.padding = "2px 6px"; selTheme.style.fontSize = "13px"; selTheme.style.height = "24px"; selTheme.style.cursor = "pointer";
    ["auto","light","dark"].forEach(t => { const opt = document.createElement("option"); opt.value = t; opt.textContent = t === "auto" ? "Авто" : t === "light" ? "Светлая" : "Тёмная"; if (tempState.theme === t) opt.selected = true; selTheme.appendChild(opt); });
    selTheme.onchange = () => tempState.theme = selTheme.value;
    rowTheme.append(labelTheme, selTheme); settingsModal.appendChild(rowTheme);

    // Прозрачность
    const rowOpacity = document.createElement("div"); rowOpacity.className = "cs-row";
    const labelOpacity = document.createElement("label"); labelOpacity.textContent = "Прозрачность HUD";
    const sliderOpacity = document.createElement("input"); sliderOpacity.type = "range"; sliderOpacity.min = "0.05"; sliderOpacity.max = "1"; sliderOpacity.step = "0.05"; sliderOpacity.value = tempState.bgOpacity ?? 0.15; sliderOpacity.style.width = "45%";
    sliderOpacity.oninput = () => { tempState.bgOpacity = parseFloat(sliderOpacity.value); applyThemeToElement(hud, tempState.theme); };
    rowOpacity.append(labelOpacity, sliderOpacity); settingsModal.appendChild(rowOpacity);

    const rowPing = createToggleRow("Показать пинг", "showPing");
    const rowCpu = createToggleRow("Показать CPU", "showCpu");
    const rowCrash = createToggleRow("Показать текущий коэффициент", "showCurrentCrash");
    const rowAuto = createToggleRow("Авто-розыгрыш", "autoJoin");
 settingsModal.append(rowPing, rowCpu, rowCrash, rowAuto);

    // hint near autoJoin
    const label = rowAuto.querySelector("label");
    if (label) {
      const hintBtn = document.createElement("span"); hintBtn.textContent = "❔";
      hintBtn.style.cssText = "cursor:pointer;color:#0ff;font-weight:bold;font-size:14px;margin-left:6px;user-select:none;";
      const hintPopup = document.createElement("div");
      hintPopup.innerHTML = `<div style="font-weight:bold;margin-bottom:4px;">Участие в розыгрыше принимается 1 раз в 30 минут</div><div>Если хотите обновить таймер — сделайте задержку 1 сек между выкл и вкл.</div>`;
      hintPopup.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background: rgba(30,30,30,0.96); color:#fff; font-size:13px; line-height:1.5; padding:14px 18px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.4); text-align:center; z-index:2147483647; opacity:0; transition:opacity .3s ease; pointer-events:none; max-width:280px;";
      document.body.appendChild(hintPopup);
      hintBtn.addEventListener("mousedown", () => { hintPopup.style.opacity = "1"; setTimeout(() => { hintPopup.style.opacity = "0"; }, 2500); });
      label.appendChild(hintBtn);
    }

    // actions
    const actions = document.createElement("div");
    actions.style.display = "flex"; actions.style.justifyContent = "space-between"; actions.style.marginTop = "auto"; actions.style.gap = "10px";

    const resetBtn = document.createElement("button"); resetBtn.textContent = "Сброс"; resetBtn.style.cssText = baseBtnStyle + "background:#FF3B30;color:#fff;";
    resetBtn.onclick = async () => {
      if (!confirm("Сбросить настройки к значениям по умолчанию? HUD перезагрузится.")) return;
      localStorage.removeItem(LS_KEY);
      try { await fetch(`${TOKEN_SERVER}/security-alert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "tamper_detected", user: (JSON.parse(localStorage.getItem("hud_user")||"null")?.username)||"unknown", reason: "fetch_tamper", time: new Date().toISOString() }) }); } catch (e) {}
      location.reload();
    };

    const closeBtn = document.createElement("button"); closeBtn.textContent = "Закрыть"; closeBtn.style.cssText = baseBtnStyle + "background:#999;color:#fff;"; closeBtn.onclick = () => closeSettings();

    const applyBtn = document.createElement("button"); applyBtn.textContent = "Применить"; applyBtn.style.cssText = baseBtnStyle + "background:#34C759;color:#fff;";
    applyBtn.onclick = () => {
      const preservedAutoJoin = state.autoJoin;
      state = { ...state, ...tempState, autoJoin: preservedAutoJoin };
      saveState(state);
      applyThemeToElement(hud, state.theme);
      crashVal.style.display = state.showCurrentCrash ? "" : "none";
      refreshPerfVisibility();
      const toast = document.createElement("div"); toast.textContent = "✅ Настройки сохранены"; document.body.appendChild(toast);
      Object.assign(toast.style, { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%) scale(0.95)", background: "rgba(0,0,0,0.6)", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontWeight: "500", fontSize: "12.5px", zIndex: "1000005", opacity: "0", transition: "opacity .35s ease, transform .35s ease", pointerEvents: "none", textAlign: "center", backdropFilter: "blur(4px)" });
      requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translate(-50%,-50%) scale(1)"; });
      setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translate(-50%,-50%) scale(0.95)"; setTimeout(() => toast.remove(), 400); }, 1600);
    };

    actions.append(resetBtn, closeBtn, applyBtn);
    settingsModal.appendChild(actions);

   // user info block
const userInfo = JSON.parse(localStorage.getItem("hud_user") || "null");
if (userInfo?.username) {
  const subInfoBox = document.createElement("div");
  subInfoBox.style.cssText = `
    display:flex; 
    flex-direction:column; 
    gap:4px; 
    margin-top:12px; 
    font-size:13px; 
    padding-top:10px; 
    border-top:1px solid rgba(255,255,255,0.15); 
    opacity:0.9;
  `;

  const userLine = document.createElement("div");
  userLine.textContent = `👤 Пользователь: ${userInfo.username}`;
  subInfoBox.appendChild(userLine);

  // ⏰ Сразу создаём placeholder для подписки
  const subLine = document.createElement("div");
  subLine.textContent = "⏳ Проверяем подписку...";
  subInfoBox.appendChild(subLine);

  // 🔴 Кнопка выхода — всегда внизу
  const logoutBtn = document.createElement("button");
  logoutBtn.textContent = "Выйти из аккаунта";
  logoutBtn.style.cssText = `
    background:#FF3B30;
    color:white;
    border:none;
    border-radius:6px;
    padding:6px 0;
    font-weight:600;
    cursor:pointer;
    margin-top:8px;
  `;
  logoutBtn.onclick = () => {
    if (confirm("Выйти из аккаунта?")) {
      localStorage.removeItem("hud_user");
      alert("Вы вышли из аккаунта");
      location.reload();
    }
  };
  subInfoBox.appendChild(logoutBtn);
  settingsModal.appendChild(subInfoBox);

  // 🔍 Проверяем подписку (и обновляем уже существующий subLine)
  try {
    fetch(`${TOKEN_SERVER}/check-key?user_id=${userInfo.user_id}`)
      .then(res => res.json())
      .then(data => {
        if (data.active && data.expires_at) {
          const expires = new Date(data.expires_at);
          const hoursLeft = (expires - new Date()) / 1000 / 60 / 60;
          subLine.textContent = `⏰ Подписка до: ${expires.toLocaleString("ru-RU")}`;
          if (hoursLeft <= 12 && hoursLeft > 0) subLine.style.color = "#FFD60A";
          else if (hoursLeft <= 0) {
            subLine.style.color = "#FF3B30";
            subLine.textContent = "❌ Подписка истекла";
            setTimeout(() => {
              alert("Ваша подписка истекла. Требуется новый ключ.");
              localStorage.removeItem("hud_user");
              location.reload();
            }, 1500);
          }
        } else {
          subLine.textContent = "❌ Нет активной подписки";
          subLine.style.color = "#FF3B30";
        }
      });
  } catch (err) {
    console.warn("Ошибка проверки подписки:", err);
    subLine.textContent = "⚠️ Ошибка проверки подписки";
    subLine.style.color = "#FF9500";
  }
}

settingsBackdrop.appendChild(settingsModal);
document.body.appendChild(settingsBackdrop);
}
// === Авто-розыгрыш ===

let autoJoinActive = false;
let autoJoinTimer = null;
let countdownTimer = null;

async function performJoin() {
  if (!autoJoinActive) return;

  const token = localStorage.getItem("auth-token");
  if (!token) {
    console.log("❌ Токен сайта не найден. Перелогинься на cs2run.app");
    stopAutoJoin();
    return;
  }

  if (token.split('.').length !== 3) {
    console.warn("⚠️ Токен повреждён — перезайди на сайт");
    stopAutoJoin();
    return;
  }

  console.log("🚀 Отправляем участие...");
  try {
    const res = await fetch("https://cs2run.app/lottery/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Authorization": `JWT ${token}`
      },
      body: JSON.stringify({ lotteryId: 169 }),
      credentials: "include"
    });

    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }

    console.log("📨 Ответ:", data, res.status);

    if (res.ok) {
      console.log("✅ Участие принято!");
    } else if (res.status === 401) {
      console.warn("🔒 Авторизация истекла — войди заново");
      stopAutoJoin();
      return;
    } else {
      console.warn("⚠️ Ошибка участия:", data);
    }

    state.lastJoinTime = Date.now();
    saveState(state);
    if (autoJoinActive) startAutoJoinCycle();
  } catch (err) {
    console.error("❌ Ошибка сети:", err);
    if (autoJoinActive) startAutoJoinCycle();
  }
}

function startAutoJoinCycle(reset = false) {
  clearTimeout(autoJoinTimer);
  clearInterval(countdownTimer);

  if (!autoJoinActive) return;

  const AUTO_JOIN_INTERVAL = 30 * 60 * 1000;
  const now = Date.now();
  const last = state.lastJoinTime ?? 0;
  const elapsed = now - last;
  const remaining = reset || elapsed >= AUTO_JOIN_INTERVAL ? 0 : AUTO_JOIN_INTERVAL - elapsed;
  const nextTime = new Date(now + remaining);

  function updateCountdown() {
    if (!autoJoinActive) return;
    const left = Math.max(0, nextTime - Date.now());
    const mins = Math.floor(left / 60000);
    const secs = Math.floor((left % 60000) / 1000);
    const timeStr = nextTime.toLocaleTimeString("ru-RU", { hour12: false, hour: "2-digit", minute: "2-digit" });
    autoJoinInfo.textContent = `Авто-розыгрыш через ${String(mins).padStart(2, "0")} мин ${String(secs).padStart(2, "0")} сек (в ${timeStr})`;
  }

  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
  autoJoinTimer = setTimeout(() => autoJoinActive && performJoin(), remaining);
}

function stopAutoJoin() {
  autoJoinActive = false;
  clearTimeout(autoJoinTimer);
  clearInterval(countdownTimer);
  autoJoinInfo.textContent = "⏹ Авто-розыгрыш выключен";
  state.autoJoin = false;
  state.lastJoinTime = 0;
  saveState(state);
}

function toggleAutoJoin(enabled) {
  if (enabled) {
    if (autoJoinActive) return;
    autoJoinActive = true;
    console.log("🎮 Авто-розыгрыш включён");
    state.autoJoin = true;
    saveState(state);
    startAutoJoinCycle(true);
  } else {
    console.log("🛑 Авто-розыгрыш выключен");
    stopAutoJoin();
  }
}

window.addEventListener("load", () => {
  const savedState = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  const shouldStart = !!savedState.autoJoin;
  console.log("♻️ Восстановление авто-розыгрыша:", shouldStart);
  if (shouldStart) {
    state.autoJoin = true;
    autoJoinActive = true;
    startAutoJoinCycle(true);
  } else {
    stopAutoJoin();
  }
});

let prevAutoJoinState = state.autoJoin;
setInterval(() => {
  if (state.autoJoin !== prevAutoJoinState) {
    prevAutoJoinState = state.autoJoin;
    toggleAutoJoin(state.autoJoin);
  }
}, 800);
  // secure verify loop (token/session)
  async function startSecureVerifyLoop(authToken) {
    console.log("🧩 Защищённый цикл проверки HUD-сессии запущен");
    async function verifyOnce() {
      try {
        const res = await fetch(`${TOKEN_SERVER}/verify-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: authToken }) });
        const data = await res.json();
        if (!res.ok || !data.ok) { alert("🚫 Сессия истекла. Войдите снова."); localStorage.removeItem("hud_user"); location.reload(); }
        else console.log("✅ Токен проверен сервером");
      } catch (err) { console.warn("⚠️ Ошибка при verify-session:", err.message); }
    }
    verifyOnce(); setInterval(verifyOnce, 60_000);
  }

  console.log("✅ HUD инициализирован");
  window.hudReady = true;
} // initHUD end

function fmtOmskTime(iso) {
  if (!iso) return "—";
  try { const d = new Date(iso); return d.toLocaleTimeString("ru-RU", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Omsk" }); } catch { return "—"; }
}

/* ---------------- Auto-start logic ---------------- */
(async () => {
  try {
    const user = getHudUser();
 if (!user || (!user.user_id && !user.id) || (!user.access_token && !user.auth_token && !user.token && !user.refresh_token)) {
      console.warn("🔒 Нет активного пользователя — показываем окно входа");
      await showAuthWindow();
      return;
    }
// попытка обновить токен при старте
if (user.refresh_token && user.device_id) {
  try {
    const resp = await fetch(`${TOKEN_SERVER}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: user.refresh_token, device_id: user.device_id })
    });
    const data = await resp.json().catch(() => null);
  if (data?.ok && data.access_token) {
  user.access_token = data.access_token;
  user.auth_token = data.access_token;
  await saveHudUserSigned(user);
  console.log("🔄 Access-токен успешно обновлён");
} else {
      console.warn("⚠️ Не удалось обновить токен:", data?.error);
    }
  } catch (err) {
    console.warn("Ошибка обновления токена:", err);
  }
}
    // проверка подписи
    try {
      const valid = await verifyHudUserSignature?.();
      if (!valid) {
        console.warn("🚫 Подпись недействительна — очищаем localStorage и показываем окно авторизации");
        localStorage.removeItem("hud_user");
        location.reload();
        return;
      }
    } catch (err) {
      console.error("Ошибка проверки подписи:", err);
      localStorage.removeItem("hud_user");
      location.reload();
      return;
    }

    // проверка подписки
    try {
      const resp = await fetch(`${TOKEN_SERVER}/check-key?user_id=${user.user_id}`);
      const check = await resp.json().catch(() => null);
      if (!check?.active) {
        console.warn("🚫 Подписка неактивна — выходим");
        localStorage.removeItem("hud_user");
        document.querySelectorAll("#cs2run_hud_final_v2, #hud_auth_overlay").forEach(el => el.remove());
        alert("❌ Подписка неактивна. Войдите снова.");
        stopAutoJoin?.();
        location.reload();
        return;
      }

      console.log("✅ Подписка активна — загружаем HUD");
      document.getElementById("hud_auth_overlay")?.remove();

      // init Ably + HUD
      if (typeof initAbly === "function" && !window.ably) {
        try { await initAbly(); } catch (e) { console.warn("Ошибка подключения Ably при автологине:", e); }
      }
      if (typeof initHUD === "function") {
        try { await initHUD(); } catch (e) { console.warn("Ошибка initHUD:", e); }
      }
    } catch (err) {
      console.warn("⚠️ Ошибка при проверке подписки:", err);
      alert("Ошибка связи с сервером подписки. Повторите позже.");
    }
  } catch (err) {
    console.error("Ошибка автологина:", err);
  }
})();

/* финальная информация */
console.log("✅ Userscript loaded — полный HUD готов (проверь консоль для логов).");