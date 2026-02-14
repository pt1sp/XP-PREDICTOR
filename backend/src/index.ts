import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { db, initDatabase } from "./db";
import {
  predictNextWinRate,
  predictPersonalizedByCondition,
  type PredictionCondition,
  type SessionRecord,
} from "./predict";

const app = express();
const allowedCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedCorsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin is not allowed"));
    },
  })
);
app.use(express.json());

initDatabase();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const AUTH_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15;
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 10;
const userTableColumns = db
  .prepare(`PRAGMA table_info("users")`)
  .all() as Array<{ name: string }>;
const hasNameColumn = userTableColumns.some((c) => c.name === "name");
const BUILTIN_ADMIN_LOGIN_ID = process.env.BUILTIN_ADMIN_LOGIN_ID?.trim() || "administrator";
const BUILTIN_ADMIN_PASSWORD = process.env.BUILTIN_ADMIN_PASSWORD?.trim();

const authAttemptMap = new Map<string, { count: number; resetAt: number }>();

type Role = "USER" | "ADMIN";

type DbUser = {
  id: number;
  login_id: string;
  password_hash: string;
  role: Role;
  created_at: string;
};

type SafeUser = {
  id: number;
  loginId: string;
  role: Role;
  createdAt: string;
};

type SessionRow = {
  id: number;
  userId: number | null;
  playedAt: string;
  rule: string;
  stage1: string;
  stage2: string;
  weapon: string;
  wins: number;
  losses: number;
  fatigue: number;
  irritability: number;
  concentration: number;
  startXp: number;
  endXp: number;
  memo: string | null;
  createdAt: string;
};

function toSafeUser(user: DbUser): SafeUser {
  return {
    id: user.id,
    loginId: user.login_id,
    role: user.role,
    createdAt: user.created_at,
  };
}

function toSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    playedAt: new Date(row.playedAt),
    rule: row.rule,
    stage1: row.stage1,
    stage2: row.stage2,
    weapon: row.weapon,
    wins: row.wins,
    losses: row.losses,
    fatigue: row.fatigue,
    irritability: row.irritability,
    concentration: row.concentration,
    startXp: row.startXp,
    endXp: row.endXp,
    memo: row.memo,
    createdAt: new Date(row.createdAt),
  };
}

function parseBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) return false;
  const hashBuffer = crypto.scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");
  if (hashBuffer.length !== storedBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, storedBuffer);
}

function issueToken(userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  db.prepare(`INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    tokenHash,
    userId,
    expiresAt
  );

  return token;
}

function getUserByToken(token: string): DbUser | null {
  const nowIso = new Date().toISOString();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT u.*
       FROM auth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token = ? AND t.expires_at > ?`
    )
    .get(tokenHash, nowIso) as DbUser | undefined;

  if (row) return row;

  db.prepare(`DELETE FROM auth_tokens WHERE token = ? OR expires_at <= ?`).run(tokenHash, nowIso);
  return null;
}

function getClientIp(req: Request): string {
  const forwardedFor = req.header("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return req.ip || "unknown";
}

function buildAuthRateLimitKey(req: Request, loginId: string): string {
  const normalizedLoginId = loginId.trim().toLowerCase() || "_unknown_user_";
  return `${getClientIp(req)}:${normalizedLoginId}`;
}

function isAuthAllowed(authKey: string): boolean {
  const now = Date.now();
  const current = authAttemptMap.get(authKey);
  if (!current || current.resetAt <= now) return true;
  return current.count < AUTH_RATE_LIMIT_MAX_ATTEMPTS;
}

function recordAuthFailure(authKey: string): void {
  const now = Date.now();
  const current = authAttemptMap.get(authKey);
  if (!current || current.resetAt <= now) {
    authAttemptMap.set(authKey, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return;
  }
  current.count += 1;
  authAttemptMap.set(authKey, current);
}

function clearAuthFailures(authKey: string): void {
  authAttemptMap.delete(authKey);
}

function parseUserIdQuery(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function requireAuth(req: Request, res: Response): DbUser | null {
  const token = parseBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return user;
}

function requireAdmin(req: Request, res: Response): DbUser | null {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "Admin privileges are required" });
    return null;
  }
  return user;
}

function fetchSessionsByUser(userId: number): SessionRow[] {
  return db
    .prepare(`SELECT * FROM "Session" WHERE userId = ? ORDER BY playedAt DESC`)
    .all(userId) as SessionRow[];
}

function fetchAllSessions(): SessionRow[] {
  return db
    .prepare(`SELECT * FROM "Session" ORDER BY playedAt ASC, id ASC`)
    .all() as SessionRow[];
}

function ensureBuiltinAdminAccount() {
  if (!BUILTIN_ADMIN_PASSWORD) {
    console.warn("BUILTIN_ADMIN_PASSWORD is not configured; skipping bootstrap admin creation.");
    return;
  }

  const existing = db
    .prepare(`SELECT id, role FROM users WHERE login_id = ?`)
    .get(BUILTIN_ADMIN_LOGIN_ID) as { id: number; role: Role } | undefined;

  const passwordHash = hashPassword(BUILTIN_ADMIN_PASSWORD);

  if (existing) {
    db.prepare(`UPDATE users SET role = 'ADMIN', password_hash = ? WHERE id = ?`).run(
      passwordHash,
      existing.id
    );
    return;
  }

  const insertColumns = ["login_id", "password_hash", "role"];
  const insertValues: Array<string | Role> = [
    BUILTIN_ADMIN_LOGIN_ID,
    passwordHash,
    "ADMIN",
  ];

  if (hasNameColumn) {
    insertColumns.push("name");
    insertValues.push(BUILTIN_ADMIN_LOGIN_ID);
  }

  const placeholders = insertColumns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO users (${insertColumns.join(", ")}) VALUES (${placeholders})`).run(
    ...insertValues
  );
}

ensureBuiltinAdminAccount();

app.post("/api/auth/register", async (req, res) => {
  try {
    const loginId = String(req.body?.loginId ?? "").trim();
    const password = String(req.body?.password ?? "");
    const authKey = buildAuthRateLimitKey(req, loginId);

    if (!isAuthAllowed(authKey)) {
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    }

    if (!loginId || password.length < 8) {
      recordAuthFailure(authKey);
      return res.status(400).json({
        error: "loginId and password (min 8 chars) are required",
      });
    }

    const existing = db
      .prepare(`SELECT id FROM users WHERE login_id = ?`)
      .get(loginId) as { id: number } | undefined;

    if (existing) {
      recordAuthFailure(authKey);
      return res.status(400).json({ error: "Registration failed" });
    }

    const role: Role = "USER";

    const passwordHash = hashPassword(password);
    const insertColumns = ["login_id", "password_hash", "role"];
    const insertValues: Array<string | Role> = [loginId, passwordHash, role];

    if (hasNameColumn) {
      insertColumns.push("name");
      insertValues.push(loginId);
    }

    const placeholders = insertColumns.map(() => "?").join(", ");
    const result = db
      .prepare(`INSERT INTO users (${insertColumns.join(", ")}) VALUES (${placeholders})`)
      .run(...insertValues);

    const userId = Number(result.lastInsertRowid);
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as DbUser;
    const token = issueToken(userId);
    clearAuthFailures(authKey);

    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const loginId = String(req.body?.loginId ?? "").trim();
    const password = String(req.body?.password ?? "");
    const authKey = buildAuthRateLimitKey(req, loginId);

    if (!isAuthAllowed(authKey)) {
      return res.status(429).json({ error: "Too many attempts. Try again later." });
    }

    if (!loginId || !password) {
      recordAuthFailure(authKey);
      return res.status(400).json({ error: "loginId and password are required" });
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE login_id = ?`)
      .get(loginId) as DbUser | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      recordAuthFailure(authKey);
      return res.status(401).json({ error: "Invalid login ID or password" });
    }

    const token = issueToken(user.id);
    clearAuthFailures(authKey);
    res.json({ token, user: toSafeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json(toSafeUser(user));
});

app.post("/api/auth/logout", (req, res) => {
  const token = parseBearerToken(req);
  if (token) {
    db.prepare(`DELETE FROM auth_tokens WHERE token = ?`).run(hashToken(token));
  }
  res.json({ ok: true });
});

app.get("/api/admin/users", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const users = db
    .prepare(
      `SELECT
         u.id,
         u.login_id as loginId,
         u.role,
         u.created_at as createdAt,
         COUNT(s.id) as sessionCount
       FROM users u
       LEFT JOIN "Session" s ON s.userId = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    )
    .all() as Array<{
    id: number;
    loginId: string;
    role: Role;
    createdAt: string;
    sessionCount: number;
  }>;

  res.json(
    users.map((u) => ({
      id: u.id,
      loginId: u.loginId,
      role: u.role,
      createdAt: u.createdAt,
      _count: { sessions: Number(u.sessionCount) },
    }))
  );
});

app.patch("/api/admin/users/:id/role", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const targetId = Number(req.params.id);
  const roleRaw = String(req.body?.role ?? "").toUpperCase();

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  if (roleRaw !== "ADMIN" && roleRaw !== "USER") {
    return res.status(400).json({ error: "role must be ADMIN or USER" });
  }

  const role = roleRaw as Role;
  const targetUser = db
    .prepare(`SELECT id, login_id FROM users WHERE id = ?`)
    .get(targetId) as { id: number; login_id: string } | undefined;

  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }

  if (targetUser.login_id === BUILTIN_ADMIN_LOGIN_ID && role === "USER") {
    return res.status(403).json({ error: "administrator cannot be changed to USER" });
  }

  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, targetId);
  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(targetId) as DbUser | undefined;

  if (!updated) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(toSafeUser(updated));
});

app.post("/api/admin/dev/reset-user", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const loginId = String(req.body?.loginId ?? "").trim();
    const password = String(req.body?.password ?? "");
    const roleRaw = String(req.body?.role ?? "USER").toUpperCase();
    if (!loginId || password.length < 8) {
      return res.status(400).json({ error: "loginId and password(min 8 chars) are required" });
    }
    if (roleRaw !== "USER" && roleRaw !== "ADMIN") {
      return res.status(400).json({ error: "role must be USER or ADMIN" });
    }
    const role = roleRaw as Role;

    const existing = db
      .prepare(`SELECT id FROM users WHERE login_id = ?`)
      .get(loginId) as { id: number } | undefined;

    if (existing) {
      db.prepare(`DELETE FROM "Session" WHERE userId = ?`).run(existing.id);
      db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(existing.id);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(existing.id);
    }

    const passwordHash = hashPassword(password);
    const insertColumns = ["login_id", "password_hash", "role"];
    const insertValues: Array<string | Role> = [loginId, passwordHash, role];
    if (hasNameColumn) {
      insertColumns.push("name");
      insertValues.push(loginId);
    }
    const placeholders = insertColumns.map(() => "?").join(", ");
    const result = db
      .prepare(`INSERT INTO users (${insertColumns.join(", ")}) VALUES (${placeholders})`)
      .run(...insertValues);

    const userId = Number(result.lastInsertRowid);
    res.json({ ok: true, userId, loginId, role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to reset user" });
  }
});

app.get("/api/admin/sessions", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const filterUserId = parseUserIdQuery(req.query.userId);

  const sessions = db
    .prepare(
      `SELECT
        s.*,
        u.id as user_id,
        u.login_id as user_login_id,
        u.role as user_role
       FROM "Session" s
       LEFT JOIN users u ON u.id = s.userId
       ${filterUserId ? "WHERE s.userId = ?" : ""}
       ORDER BY s.playedAt DESC`
    )
    .all(...(filterUserId ? [filterUserId] : [])) as Array<
    SessionRow & {
      user_id: number | null;
      user_login_id: string | null;
      user_role: Role | null;
    }
  >;

  res.json(
    sessions.map((s) => ({
      ...s,
      user: s.user_id
        ? {
            id: s.user_id,
            loginId: s.user_login_id,
            role: s.user_role,
          }
        : null,
    }))
  );
});

app.delete("/api/admin/sessions/:id", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "Invalid session id" });
  }

  const existing = db
    .prepare(`SELECT id FROM "Session" WHERE id = ?`)
    .get(sessionId) as { id: number } | undefined;

  if (!existing) {
    return res.status(404).json({ error: "Session not found" });
  }

  db.prepare(`DELETE FROM "Session" WHERE id = ?`).run(sessionId);
  res.json({ ok: true });
});

app.get("/api/admin/evaluation/offline", (req, res) => {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  const targetUserId = parseUserIdQuery(req.query.userId);
  if (!targetUserId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const warmupRaw = Number(req.query.warmup ?? 6);
  const warmup = Number.isFinite(warmupRaw) ? Math.max(3, Math.min(30, Math.trunc(warmupRaw))) : 6;
  const limitRaw = Number(req.query.limit ?? 120);
  const limit = Number.isFinite(limitRaw) ? Math.max(20, Math.min(500, Math.trunc(limitRaw))) : 120;

  const allSessions = fetchAllSessions().map(toSessionRecord);
  const targetSessions = allSessions
    .filter((s) => s.userId === targetUserId)
    .sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  if (targetSessions.length <= warmup) {
    return res.status(400).json({
      error: `評価対象の履歴が不足しています (required > ${warmup}, actual ${targetSessions.length})`,
    });
  }

  const rows: Array<{
    sessionId: number;
    playedAt: string;
    rule: string;
    stage1: string;
    stage2: string;
    weapon: string;
    predictedWinRate: number;
    actualWinRate: number;
    winRateAbsError: number;
    winRateInterval: { low: number; high: number };
    winRateCovered: boolean;
    predictedXpDelta: number;
    actualXpDelta: number;
    xpDeltaError: number;
    xpDeltaInterval: { low: number; high: number };
    xpDeltaCovered: boolean;
    recommendPlay: boolean;
    actualRecommendSuccess: boolean;
    advice: string;
    note: string;
  }> = [];

  for (let i = warmup; i < targetSessions.length; i += 1) {
    const current = targetSessions[i];
    const train = allSessions.filter(
      (s) =>
        s.playedAt.getTime() < current.playedAt.getTime() ||
        (s.playedAt.getTime() === current.playedAt.getTime() && s.id < current.id)
    );
    if (train.length < warmup) continue;

    const condition: PredictionCondition = {
      rule: current.rule,
      stage1: current.stage1,
      stage2: current.stage2,
      weapon: current.weapon,
      fatigue: current.fatigue,
      irritability: current.irritability,
      concentration: current.concentration,
      startXp: current.startXp,
    };

    const pred = predictPersonalizedByCondition(train, condition, targetUserId);
    const totalGames = current.wins + current.losses;
    const actualWinRate = totalGames > 0 ? current.wins / totalGames : 0;
    const actualXpDelta = current.endXp - current.startXp;
    rows.push({
      sessionId: current.id,
      playedAt: current.playedAt.toISOString(),
      rule: current.rule,
      stage1: current.stage1,
      stage2: current.stage2,
      weapon: current.weapon,
      predictedWinRate: pred.predictedWinRate,
      actualWinRate,
      winRateAbsError: Math.abs(pred.predictedWinRate - actualWinRate),
      winRateInterval: pred.winRateInterval,
      winRateCovered:
        actualWinRate >= pred.winRateInterval.low && actualWinRate <= pred.winRateInterval.high,
      predictedXpDelta: pred.predictedXpDelta,
      actualXpDelta,
      xpDeltaError: pred.predictedXpDelta - actualXpDelta,
      xpDeltaInterval: pred.xpDeltaInterval,
      xpDeltaCovered:
        actualXpDelta >= pred.xpDeltaInterval.low && actualXpDelta <= pred.xpDeltaInterval.high,
      recommendPlay: pred.recommendPlay,
      actualRecommendSuccess: actualXpDelta > 0,
      advice: pred.advice,
      note: pred.note,
    });
  }

  const recent = rows.slice(-limit);
  if (recent.length === 0) {
    return res.status(400).json({ error: "評価データを生成できませんでした" });
  }

  const maeWinRate = recent.reduce((a, r) => a + r.winRateAbsError, 0) / recent.length;
  const rmseWinRate = Math.sqrt(
    recent.reduce((a, r) => a + (r.predictedWinRate - r.actualWinRate) ** 2, 0) / recent.length
  );
  const maeXpDelta = recent.reduce((a, r) => a + Math.abs(r.xpDeltaError), 0) / recent.length;
  const rmseXpDelta = Math.sqrt(
    recent.reduce((a, r) => a + r.xpDeltaError ** 2, 0) / recent.length
  );
  const winRateCoverage =
    recent.filter((r) => r.winRateCovered).length / Math.max(1, recent.length);
  const xpDeltaCoverage =
    recent.filter((r) => r.xpDeltaCovered).length / Math.max(1, recent.length);

  const recommended = recent.filter((r) => r.recommendPlay);
  const recommendationPrecision =
    recommended.filter((r) => r.actualRecommendSuccess).length / Math.max(1, recommended.length);

  res.json({
    targetUserId,
    warmup,
    evaluatedCount: recent.length,
    summary: {
      maeWinRate,
      rmseWinRate,
      maeXpDelta,
      rmseXpDelta,
      winRateCoverage,
      xpDeltaCoverage,
      recommendationPrecision,
      avgPredictedXpDelta:
        recent.reduce((a, r) => a + r.predictedXpDelta, 0) / Math.max(1, recent.length),
      avgActualXpDelta: recent.reduce((a, r) => a + r.actualXpDelta, 0) / Math.max(1, recent.length),
    },
    rows: recent,
  });
});

app.post("/api/sessions", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const {
      playedAt,
      rule,
      stage1,
      stage2,
      weapon,
      wins,
      losses,
      fatigue,
      irritability,
      concentration,
      startXp,
      endXp,
      memo,
    } = req.body ?? {};

    if (!playedAt || !rule || !stage1 || !stage2 || !weapon) {
      return res.status(400).json({
        error: "playedAt, rule, stage1, stage2, and weapon are required",
      });
    }

    const result = db
      .prepare(
        `INSERT INTO "Session" (
          "userId", "playedAt", "rule", "stage1", "stage2", "weapon", "wins", "losses", "fatigue", "irritability", "concentration", "startXp", "endXp", "memo"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        String(playedAt),
        String(rule),
        String(stage1),
        String(stage2),
        String(weapon),
        Number(wins ?? 0),
        Number(losses ?? 0),
        Number(fatigue ?? 3),
        Number(irritability ?? 3),
        Number(concentration ?? 3),
        Number(startXp ?? 0),
        Number(endXp ?? 0),
        memo ? String(memo) : null
      );

    const created = db
      .prepare(`SELECT * FROM "Session" WHERE id = ?`)
      .get(Number(result.lastInsertRowid)) as SessionRow;

    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to create session" });
  }
});

app.get("/api/sessions", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const filterUserId = parseUserIdQuery(req.query.userId);
  const targetUserId = user.role === "ADMIN" && filterUserId ? filterUserId : user.id;

  const sessions = fetchSessionsByUser(targetUserId);
  res.json(sessions);
});

app.delete("/api/sessions/:id", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "Invalid session id" });
  }

  const existing = db
    .prepare(`SELECT id, userId FROM "Session" WHERE id = ?`)
    .get(sessionId) as { id: number; userId: number | null } | undefined;

  if (!existing) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (existing.userId !== user.id) {
    return res.status(403).json({ error: "You can only delete your own session" });
  }

  db.prepare(`DELETE FROM "Session" WHERE id = ?`).run(sessionId);
  res.json({ ok: true });
});

app.get("/api/prediction", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const filterUserId = parseUserIdQuery(req.query.userId);
  const targetUserId = user.role === "ADMIN" && filterUserId ? filterUserId : user.id;

  const sessions = fetchSessionsByUser(targetUserId).map(toSessionRecord);
  const result = predictNextWinRate(sessions);
  res.json(result);
});

app.post("/api/prediction/next", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { rule, stage1, stage2, weapon, fatigue, irritability, concentration, startXp, userId } = req.body ?? {};

    if (!rule || !stage1 || !stage2 || !weapon) {
      return res.status(400).json({ error: "rule, stage1, stage2, and weapon are required" });
    }

    if (
      typeof fatigue !== "number" ||
      typeof irritability !== "number" ||
      typeof concentration !== "number" ||
      typeof startXp !== "number" ||
      fatigue < 1 ||
      fatigue > 5 ||
      irritability < 1 ||
      irritability > 5 ||
      concentration < 1 ||
      concentration > 5 ||
      startXp < 0
    ) {
      return res
        .status(400)
        .json({ error: "fatigue/irritability/concentration must be 1-5 and startXp must be >= 0" });
    }

    const requestedUserId = Number(userId);
    const targetUserId =
      user.role === "ADMIN" && Number.isInteger(requestedUserId) && requestedUserId > 0
        ? requestedUserId
        : user.id;

    const condition: PredictionCondition = {
      rule: String(rule),
      stage1: String(stage1),
      stage2: String(stage2),
      weapon: String(weapon),
      fatigue: Number(fatigue),
      irritability: Number(irritability),
      concentration: Number(concentration),
      startXp: Number(startXp),
    };

    const allSessions = fetchAllSessions().map(toSessionRecord);
    const result = predictPersonalizedByCondition(allSessions, condition, targetUserId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to predict" });
  }
});

const projectRoot = path.resolve(__dirname, "../../");
const frontendDistPath = path.join(projectRoot, "frontend/dist");

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^\/(?!api|assets\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
} else {
  console.warn(`Frontend dist not found at ${frontendDistPath}; starting API server only.`);
}
const PORT = Number(process.env.PORT ?? 10000);
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

