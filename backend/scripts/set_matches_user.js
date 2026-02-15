/* eslint-disable no-console */
"use strict";

const path = require("node:path");
const Database = require("better-sqlite3");

function resolveSqlitePath() {
  const raw = process.env.DATABASE_URL || `file:${path.resolve(__dirname, "..", "dev.db")}`;
  if (!raw.startsWith("file:")) {
    throw new Error("Only sqlite file: URLs are supported");
  }
  const filePath = raw.slice("file:".length);
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(process.cwd(), filePath);
}

function main() {
  const loginId = String(process.env.XP_USER_LOGIN_ID || "").trim();
  if (!loginId) {
    throw new Error("XP_USER_LOGIN_ID is required (e.g. pt0sp)");
  }

  // Safety: default is to update only rows with user_id IS NULL.
  const forceAll = String(process.env.XP_MATCHES_FORCE_ALL || "").trim() === "1";

  const dbPath = resolveSqlitePath();
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const user = db
    .prepare(`SELECT id, login_id FROM users WHERE login_id = ?`)
    .get(loginId);
  if (!user?.id) {
    throw new Error(`user not found: ${loginId}`);
  }

  const before = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) as nulls,
         SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as mine
       FROM matches`
    )
    .get(user.id);

  const stmt = forceAll
    ? db.prepare(`UPDATE matches SET user_id = ?`)
    : db.prepare(`UPDATE matches SET user_id = ? WHERE user_id IS NULL`);

  const result = stmt.run(user.id);

  const after = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) as nulls,
         SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as mine
       FROM matches`
    )
    .get(user.id);

  console.log(
    `[set_matches_user] login_id=${user.login_id} user_id=${user.id} scope=${forceAll ? "all" : "null-only"} updated=${Number(
      result.changes ?? 0
    )}`
  );
  console.log(`[set_matches_user] before=${JSON.stringify(before)}`);
  console.log(`[set_matches_user] after=${JSON.stringify(after)}`);
}

main();
