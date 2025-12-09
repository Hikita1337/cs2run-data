// .github/scripts/update-data.js
// ✅ Исправлено: теперь cs2run_history.json хранится в порядке от старых к новым (старые сверху)
// ✅ Добавлена защита от дубликатов, обрывов и пустых API-ответов
// ✅ Работает с Node 18+ (встроенный fetch)

const fs = requ.    ire("fs");
const path = require("path");

const HISTORY_FILE = path.join(process.cwd(), "cs2run_history.json");
const API_URL = "https://cs2run.app/crash/state";
const MAX_HISTORY = 200000;
const FETCH_TIMEOUT_MS = 10000; // 10 секунд

// === Быстрая обёртка над fetch с таймаутом ===
async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// === Безопасный JSON-парсер ===
function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// === Нормализация данных API ===
function normalizeRemoteHistory(raw) {
  if (!raw) return [];

  // Формат { data: { history: [ {id, crash}, ... ] } }
  if (raw.data && Array.isArray(raw.data.history)) {
    return raw.data.history.map(h => ({
      id: h.id ?? null,
      crash: parseFloat((h.crash ?? "").toString().replace(/[^\d.]/g, "")) || null
    })).filter(x => x.id != null && Number.isFinite(x.crash));
  }

  // Формат — просто массив
  if (Array.isArray(raw)) {
    return raw.map(h => ({
      id: h?.id ?? h?.gameId ?? h?.round ?? null,
      crash: parseFloat((h?.crash ?? h?.value ?? h?.multiplier ?? "").toString().replace(/[^\d.]/g, "")) || null
    })).filter(x => x.id != null && Number.isFinite(x.crash));
  }

  return [];
}

// === Чтение локального файла истории ===
function readLocalHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const txt = fs.readFileSync(HISTORY_FILE, "utf8").trim();
  if (!txt) return [];
  const parsed = safeParseJson(txt);
  if (!parsed) return [];

  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.data)
      ? parsed.data
      : Object.values(parsed).find(v => Array.isArray(v)) || [];

  return arr
    .map(it => ({
      id: it.id ?? null,
      crash: Number(it.crash ?? it.value ?? it.multiplier) || null,
      time: it.time ?? null
    }))
    .filter(x => x.id != null && Number.isFinite(x.crash));
}

// === Запись локальной истории ===
function writeLocalHistory(arr) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// === Основная функция ===
(async () => {
  try {
    console.log("🔁 update-data.js — обновление данных...");
    const res = await fetchWithTimeout(API_URL);

    if (!res.ok) throw new Error(`Remote API returned ${res.status} ${res.statusText}`);

    const json = await res.json();
    const remoteItems = normalizeRemoteHistory(json);
    console.log(`🌐 Получено ${remoteItems.length} новых значений с API`);

    if (!remoteItems.length) {
      console.log("⚠️ Пустой ответ от API — отмена обновления");
      process.exit(0);
    }

    const nowISO = new Date().toISOString();
  const remoteWithTime = remoteItems.map(it => ({
  id: it.id,
  crash: Number(it.crash),
  time: nowISO,        // Время получения данных
  updated_at: nowISO   // Время обновления данных
}));
  

    const local = readLocalHistory();
    console.log(`📁 Локально сохранено ${local.length} записей`);

    // --- добавляем только новые id ---
    const existingIds = new Set(local.map(x => x.id));
    const newItems = remoteWithTime.filter(it => !existingIds.has(it.id));

    if (!newItems.length) {
      console.log("ℹ️ Новых записей нет — выход без изменений");
      process.exit(0);
    }

    console.log(`➕ Новых записей: ${newItems.length}`);

    // --- объединяем и сортируем по ID (старые сверху, новые снизу) ---
    const merged = [...local, ...newItems]
      .filter(it => it.id != null && Number.isFinite(it.crash));

    // ✅ Сортируем по ID (старые сверху, новые снизу)
    merged.sort((a, b) => (a.id || 0) - (b.id || 0));  // Сортировка по ID (старые сверху, новые снизу)

    // --- убираем дубликаты ---
    const seen = new Set();
    const unique = [];
    for (const it of merged) {
      if (!seen.has(it.id)) {
        unique.push(it);
        seen.add(it.id);
      }
    }

    // --- ограничиваем историю ---
    const truncated = unique.slice(-MAX_HISTORY);

    // --- сохраняем ---
    writeLocalHistory(truncated);
    console.log(`✅ История обновлена: ${truncated.length} записей, порядок — старые сверху, новые снизу`);

    process.exit(0);

  } catch (err) {
    console.error("❌ Ошибка в update-data.js:", err.stack || err);
    process.exit(1);
  }
})();
