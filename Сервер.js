// === 🧩 Загрузка ENV из .env ===
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import Ably from "ably";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

// === 🔧 Init Express ===
const app = express();

// === 🌐 CORS / allowed domains ===
const allowedDomains = [
  "https://cs2run.bet",
  "https://csrun.bet",
  "https://token-server-dkjk.onrender.com"
];

app.use(cors({ origin: allowedDomains, credentials: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// === 🛡️ Rate limiter ===
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 110,
  message: { error: "Слишком много запросов, попробуйте позже." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// === 🔑 ENV ===
const {
  ABLY_KEY,
  ABLY_KEY_AUTH,
  SECRET_SUFFIX,
  INTERNAL_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  JWT_PRIVATE_KEY,
  JWT_PUBLIC_KEY,
  PORT
} = process.env;

// минимальная валидация env
if (!ABLY_KEY || !ABLY_KEY_AUTH || !SECRET_SUFFIX || !INTERNAL_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY) {
  console.error("❌ Не все обязательные ENV заданы.");
  process.exit(1);
}

// === 🔧 Ably и Supabase ===
const ably = new Ably.Rest(ABLY_KEY);
const ablyAuth = new Ably.Rest(ABLY_KEY_AUTH);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// === 🎯 Helpers ===
async function hasActiveSubscription(userId) {
  if (!userId) return { ok: false };
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("subscription")
      .eq("id", userId)
      .maybeSingle();
    if (error || !user) return { ok: false };
    return { ok: !!user.subscription };
  } catch (e) {
    console.error("hasActiveSubscription error:", e);
    return { ok: false };
  }
}

// === 🔔 Kick пользователя через Ably ===
async function kickUser(userId) {
  try {
    const channelName = `hud-${userId}`;
    await ably.channels.get(channelName).publish("subscription_expired", { user_id: userId });
    console.log(`🚨 HUD: пользователь ${userId} выкинут из сессии (subscription=false)`);
  } catch (e) {
    console.warn("Ably notify failed:", e.message || e);
  }
}

// === Realtime: следим за подпиской ===
supabase
  .channel('public:users')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, payload => {
    const newSub = payload.new.subscription;
    const oldSub = payload.old.subscription;
    const userId = payload.new.id;

    if (oldSub && !newSub) {
      kickUser(userId);
    }
  })
  .subscribe();

// === /check-key — проверка подписки ===
app.get("/check-key", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ active: false, error: "user_id missing" });

    const { ok } = await hasActiveSubscription(user_id);
    res.json({ active: ok });
  } catch (err) {
    console.error("/check-key error:", err);
    res.status(500).json({ active: false, error: "Internal error" });
  }
});

// === /auth-secure — логин HUD, access + refresh ===
app.post("/auth-secure", async (req, res) => {
  try {
    const { username, password, device_id } = req.body;
    if (!username || !password || !device_id)
      return res.status(400).json({ ok: false, error: "Отсутствует логин, пароль или device_id" });

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, password_hash")
      .eq("username", username)
      .maybeSingle();

    if (error || !user) return res.status(401).json({ ok: false, error: "Пользователь не найден" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(403).json({ ok: false, error: "Неверный пароль" });

    const { ok } = await hasActiveSubscription(user.id);
    if (!ok) return res.status(403).json({ ok: false, error: "Подписка неактивна" });

    const sessionId = crypto.randomUUID?.() || `${user.id}-${Date.now()}`;
    const accessPayload = { user_id: user.id, username: user.username, session_id: sessionId, type: "access" };
    const accessToken = jwt.sign(accessPayload, JWT_PRIVATE_KEY, { algorithm: "RS256", expiresIn: "15m" });

    const refreshPayload = { user_id: user.id, username: user.username, device_id, type: "refresh" };
    const refreshToken = jwt.sign(refreshPayload, JWT_PRIVATE_KEY, { algorithm: "RS256", expiresIn: 30 * 24 * 3600 + "s" });

    // сохраняем сессию
    await supabase.from("sessions").insert([{
      user_id: user.id,
      fingerprint: device_id,
      created_at: new Date().toISOString(),
      revoked: false
    }]);

    res.json({ ok: true, user_id: user.id, username: user.username, access_token: accessToken, refresh_token: refreshToken, expires_in: 15 * 60 });
  } catch (err) {
    console.error("/auth-secure error:", err);
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// === /refresh — обновление access_token через refresh ===
app.post("/refresh", async (req, res) => {
  try {
    const { refresh_token, device_id } = req.body;
    if (!refresh_token || !device_id) return res.status(400).json({ ok: false, error: "refresh_token и device_id обязательны" });

    let decoded;
    try {
      decoded = jwt.verify(refresh_token, JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
    } catch {
      return res.status(403).json({ ok: false, error: "Недействительный refresh token" });
    }

    if (decoded.type !== "refresh") return res.status(403).json({ ok: false, error: "Неверный тип токена" });
    if (decoded.device_id !== device_id) return res.status(403).json({ ok: false, error: "Device mismatch" });

    const { ok } = await hasActiveSubscription(decoded.user_id);
    if (!ok) {
      await kickUser(decoded.user_id);
      return res.status(403).json({ ok: false, error: "Подписка неактивна" });
    }

    const newAccess = jwt.sign({ user_id: decoded.user_id, username: decoded.username, type: "access" }, JWT_PRIVATE_KEY, { algorithm: "RS256", expiresIn: "15m" });
    res.json({ ok: true, access_token: newAccess, expires_in: 15 * 60 });
  } catch (err) {
    console.error("/refresh error:", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// === /verify-session — проверка access_token ===
app.post("/verify-session", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok: false, error: "Token missing" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
    } catch {
      return res.status(403).json({ ok: false, error: "Invalid token" });
    }

    const { ok } = await hasActiveSubscription(decoded.user_id);
    if (!ok) return res.status(403).json({ ok: false, error: "Subscription inactive" });

    res.json({ ok: true });
  } catch (err) {
    console.error("/verify-session error:", err);
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// === /ably-token — токен для Ably HUD ===
app.get("/ably-token", async (req, res) => {
  try {
    const tokenRequest = await new Promise((resolve, reject) => {
      ably.auth.createTokenRequest({ clientId: "cs2run-hud" }, (err, token) => err ? reject(err) : resolve(token));
    });
    res.json(tokenRequest);
  } catch (err) {
    console.error("Ошибка при создании Ably токена:", err);
    res.status(500).json({ error: "Ошибка создания Ably токена" });
  }
});

// === Health
app.get("/healthz", (_, res) => res.status(200).send("OK"));

// === Start
const LISTEN_PORT = Number(PORT || 10000);
app.listen(LISTEN_PORT, "0.0.0.0", () => console.log(`🌐 Token server запущен на порту ${LISTEN_PORT}`));
