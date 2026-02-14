import path from "node:path";
import Database from "better-sqlite3";

function resolveSqlitePath(): string {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  if (!raw.startsWith("file:")) {
    throw new Error("Only sqlite file: URLs are supported");
  }
  const filePath = raw.slice("file:".length);
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(process.cwd(), filePath);
}

export const db = new Database(resolveSqlitePath());
db.pragma("foreign_keys = ON");

function hasColumn(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === columnName);
}

function hasIndex(indexName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`)
    .get(indexName) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function normalizeUsersTable() {
  const hasLegacyEmail = hasColumn("users", "email");
  const hasLegacyName = hasColumn("users", "name");
  const hasLegacyShape = hasLegacyEmail || hasLegacyName;
  if (!hasLegacyShape) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS users_new;
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users_new (id, login_id, password_hash, role, created_at)
    SELECT
      id,
      CASE
        WHEN COALESCE(login_id, '') <> '' THEN login_id
        WHEN COALESCE(name, '') <> '' THEN name
        ELSE 'user_' || id
      END AS login_id,
      password_hash,
      COALESCE(role, 'USER') AS role,
      COALESCE(created_at, CURRENT_TIMESTAMP) AS created_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;

    PRAGMA foreign_keys = ON;
  `);
}

function migrateLoginIdColumn() {
  if (!hasColumn("users", "login_id")) {
    db.exec(`ALTER TABLE users ADD COLUMN login_id TEXT;`);
  }

  const hasName = hasColumn("users", "name");
  const fallbackExpr = hasName ? "COALESCE(name, '')" : "''";

  db.exec(`
    UPDATE users
    SET login_id =
      CASE
        WHEN COALESCE(login_id, '') <> '' THEN login_id
        WHEN ${fallbackExpr} <> '' THEN ${hasName ? "name" : "login_id"}
        ELSE 'user_' || id
      END
    WHERE COALESCE(login_id, '') = '';
  `);

  const duplicates = db
    .prepare(`
      SELECT login_id
      FROM users
      WHERE login_id IS NOT NULL AND login_id <> ''
      GROUP BY login_id
      HAVING COUNT(*) > 1
    `)
    .all() as Array<{ login_id: string }>;

  for (const dup of duplicates) {
    const rows = db
      .prepare(`SELECT id FROM users WHERE login_id = ? ORDER BY id ASC`)
      .all(dup.login_id) as Array<{ id: number }>;

    rows.slice(1).forEach((row) => {
      db.prepare(`UPDATE users SET login_id = ? WHERE id = ?`).run(`${dup.login_id}_${row.id}`, row.id);
    });
  }

  if (!hasIndex("users_login_id_key")) {
    db.exec(`CREATE UNIQUE INDEX users_login_id_key ON users(login_id);`);
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Session" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      playedAt TEXT NOT NULL,
      rule TEXT NOT NULL DEFAULT '',
      stage1 TEXT NOT NULL,
      stage2 TEXT NOT NULL,
      weapon TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      fatigue INTEGER NOT NULL DEFAULT 3,
      irritability INTEGER NOT NULL DEFAULT 3,
      concentration INTEGER NOT NULL DEFAULT 3,
      startXp INTEGER NOT NULL DEFAULT 0,
      endXp INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  normalizeUsersTable();
  migrateLoginIdColumn();

  if (!hasColumn("Session", "userId")) {
    db.exec(`ALTER TABLE "Session" ADD COLUMN "userId" INTEGER;`);
  }
  if (!hasColumn("Session", "concentration")) {
    db.exec(`ALTER TABLE "Session" ADD COLUMN "concentration" INTEGER NOT NULL DEFAULT 3;`);
  }
  if (!hasColumn("Session", "startXp")) {
    db.exec(`ALTER TABLE "Session" ADD COLUMN "startXp" INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!hasColumn("Session", "endXp")) {
    db.exec(`ALTER TABLE "Session" ADD COLUMN "endXp" INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!hasColumn("Session", "rule")) {
    db.exec(`ALTER TABLE "Session" ADD COLUMN "rule" TEXT NOT NULL DEFAULT '';`);
  }

  if (!hasIndex("Session_userId_playedAt_idx")) {
    db.exec(`CREATE INDEX "Session_userId_playedAt_idx" ON "Session"("userId", "playedAt" DESC);`);
  }
  if (!hasIndex("Session_playedAt_id_idx")) {
    db.exec(`CREATE INDEX "Session_playedAt_id_idx" ON "Session"("playedAt" ASC, "id" ASC);`);
  }
  if (!hasIndex("auth_tokens_expires_at_idx")) {
    db.exec(`CREATE INDEX "auth_tokens_expires_at_idx" ON auth_tokens(expires_at);`);
  }
}
