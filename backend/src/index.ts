import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { db, initDatabase } from "./db";
import {
  predictNextWinRate,
  predictWinRateByCondition,
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
  stage1: string;
  stage2: string;
  weapon: string;
  wins: number;
  losses: number;
  fatigue: number;
  irritability: number;
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
    stage1: row.stage1,
    stage2: row.stage2,
    weapon: row.weapon,
    wins: row.wins,
    losses: row.losses,
    fatigue: row.fatigue,
    irritability: row.irritability,
    memo: row.memo,
    createdAt: new Date(row.createdAt),
  };
}

function parseBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
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
    if (existing.role !== "ADMIN") {
      db.prepare(`UPDATE users SET role = 'ADMIN' WHERE id = ?`).run(existing.id);
    }
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
        error: "loginId と password(8文字以上) が必要です",
      });
    }

    const existing = db
      .prepare(`SELECT id FROM users WHERE login_id = ?`)
      .get(loginId) as { id: number } | undefined;

    if (existing) {
      recordAuthFailure(authKey);
      return res.status(400).json({ error: "登録に失敗しました" });
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
      return res.status(400).json({ error: "loginId と password が必要です" });
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE login_id = ?`)
      .get(loginId) as DbUser | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      recordAuthFailure(authKey);
      return res.status(401).json({ error: "ID またはパスワードが不正です" });
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

app.post("/api/sessions", (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const {
      playedAt,
      stage1,
      stage2,
      weapon,
      wins,
      losses,
      fatigue,
      irritability,
      memo,
    } = req.body ?? {};

    if (!playedAt || !stage1 || !stage2 || !weapon) {
      return res.status(400).json({
        error: "playedAt, stage1, stage2, weapon は必須です",
      });
    }

    const result = db
      .prepare(
        `INSERT INTO "Session" (
          "userId", "playedAt", "stage1", "stage2", "weapon", "wins", "losses", "fatigue", "irritability", "memo"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        String(playedAt),
        String(stage1),
        String(stage2),
        String(weapon),
        Number(wins ?? 0),
        Number(losses ?? 0),
        Number(fatigue ?? 3),
        Number(irritability ?? 3),
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
    const { stage1, stage2, weapon, fatigue, irritability, userId } = req.body ?? {};

    if (!stage1 || !stage2 || !weapon) {
      return res.status(400).json({ error: "stage1, stage2, weapon は必須です" });
    }

    if (
      typeof fatigue !== "number" ||
      typeof irritability !== "number" ||
      fatigue < 1 ||
      fatigue > 5 ||
      irritability < 1 ||
      irritability > 5
    ) {
      return res.status(400).json({ error: "fatigue と irritability は 1-5 の数値が必要です" });
    }

    const requestedUserId = Number(userId);
    const targetUserId =
      user.role === "ADMIN" && Number.isInteger(requestedUserId) && requestedUserId > 0
        ? requestedUserId
        : user.id;

    const sessions = fetchSessionsByUser(targetUserId).map(toSessionRecord);

    const condition: PredictionCondition = {
      stage1: String(stage1),
      stage2: String(stage2),
      weapon: String(weapon),
      fatigue: Number(fatigue),
      irritability: Number(irritability),
    };

    const result = predictWinRateByCondition(sessions, condition);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "failed to predict" });
  }
});

const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});




