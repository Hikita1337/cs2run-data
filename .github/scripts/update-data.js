// .github/scripts/update-data.js
// Node 18+ (Actions): собирает историю из API и обновляет cs2run_history.json
// Работает idempotent: коммитит только при изменениях.

const fs = require("fs");
const path = require("path");
const HISTORY_FILE = path.join(process.cwd(), "cs2run_history.json");
const API_URL = "https://cs2run.app/crash/state";
const MAX_HISTORY = 2000;
const FETCH_TIMEOUT_MS = 10000; // 10s

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

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function normalizeRemoteHistory(raw) {
  // Expect raw like: { success: true, data: { history: [ {id, crash}, ... ] } }
  if (!raw) return [];
  // If remote returns wrapper
  if (raw.data && Array.isArray(raw.data.history)) {
    return raw.data.history.map(h => {
      const id = h.id ?? null;
      const crash = (typeof h.crash === "string") ? parseFloat(h.crash.replace(/[^\d.]/g, "")) : Number(h.crash);
      return { id: id === undefined ? null : id, crash: Number.isFinite(crash) ? crash : null };
    }).filter(x => x && x.id != null && Number.isFinite(x.crash));
  }
  // If it's already an array
  if (Array.isArray(raw)) {
    return raw.map(h => {
      const id = (h && (h.id ?? h.gameId ?? h.round)) ?? null;
      const crash = (typeof h.crash === "string") ? parseFloat(h.crash.replace(/[^\d.]/g, "")) : Number(h.crash ?? h.value ?? h.multiplier);
      return { id: id === undefined ? null : id, crash: Number.isFinite(crash) ? crash : null };
    }).filter(x => x && x.id != null && Number.isFinite(x.crash));
  }
  return [];
}

function readLocalHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const txt = fs.readFileSync(HISTORY_FILE, "utf8").trim();
  if (!txt) return [];
  const parsed = safeParseJson(txt);
  if (!parsed) return [];
  // Support both object-with-meta and plain array
  if (Array.isArray(parsed)) {
    return parsed.map(it => {
      // if items already have time or crash
      return { id: it.id ?? null, crash: Number(it.crash ?? it.value ?? it.multiplier) || null, time: it.time ?? null };
    }).filter(x => x.id != null && Number.isFinite(x.crash));
  } else if (parsed && parsed.data && Array.isArray(parsed.data)) {
    // possible older format { data: [...] }
    return parsed.data.map(it => ({ id: it.id ?? null, crash: Number(it.crash) || null, time: it.time ?? null }))
      .filter(x => x.id != null && Number.isFinite(x.crash));
  } else {
    // object with fields? try to find array field
    const maybeArray = Object.values(parsed).find(v => Array.isArray(v));
    if (Array.isArray(maybeArray)) {
      return maybeArray.map(it => ({ id: it.id ?? null, crash: Number(it.crash) || null, time: it.time ?? null }))
        .filter(x => x.id != null && Number.isFinite(x.crash));
    }
  }
  return [];
}

function writeLocalHistory(arr) {
  // Write as plain array of objects {id, crash, time}
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(arr, null, 2), "utf8");
}

(async () => {
  try {
    console.log("🔁 Start update-data.js — fetching remote state...");
    const res = await fetchWithTimeout(API_URL);
    if (!res.ok) {
      throw new Error(`Remote API returned ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const remoteItems = normalizeRemoteHistory(json);
    console.log(`🔍 Remote returned ${remoteItems.length} history items`);

    // Add timestamp for remote items if needed (use current time for batch)
    const nowISO = new Date().toISOString();
    const remoteWithTime = remoteItems.map(it => ({ id: it.id, crash: Number(it.crash), time: nowISO }));

    // Read local history
    const local = readLocalHistory();
    console.log(`📁 Local history currently ${local.length} items`);

    // Build map of existing ids for dedupe
    const existingIds = new Set(local.map(x => x.id).filter(Boolean));

    // Merge: add remote items that are not present (preserve order: newest first)
    // remoteWithTime likely is newest-first from API.history (confirm), but we'll push new ones to head
    const toAdd = [];
    for (const it of remoteWithTime) {
      if (!existingIds.has(it.id)) {
        toAdd.push(it);
        existingIds.add(it.id);
      }
    }

    if (toAdd.length === 0) {
      console.log("ℹ️ No new items to add — exiting without writing.");
      process.exit(0);
    }

    // Prepend new items (newest first)
    const merged = [...toAdd, ...local];

    // Ensure unique by id (in case local had duplicates) — keep first occurrence
    const seen = new Set();
    const unique = [];
    for (const it of merged) {
      if (it.id == null) continue;
      if (!seen.has(it.id)) {
        unique.push(it);
        seen.add(it.id);
      }
    }

    // Trim to MAX_HISTORY
    const truncated = unique.slice(0, MAX_HISTORY);

    // Write only if changed length or first id differs
    const localFirstId = local.length ? local[0].id : null;
    const changed = truncated.length !== local.length || (truncated.length && truncated[0].id !== localFirstId);

    if (!changed) {
      console.log("ℹ️ After dedupe/truncation nothing changed — exit.");
      process.exit(0);
    }

    writeLocalHistory(truncated);
    console.log(`✅ Wrote history: new ${toAdd.length} records, total stored ${truncated.length}`);
    process.exit(0);

  } catch (err) {
    console.error("❌ Fatal error in update-data.js:", err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
