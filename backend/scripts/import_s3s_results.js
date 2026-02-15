/* eslint-disable no-console */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function resolveSqlitePath() {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  if (!raw.startsWith("file:")) {
    throw new Error("Only sqlite file: URLs are supported");
  }

  const filePath = raw.slice("file:".length);
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(process.cwd(), filePath);
}

function resolveResultsDir() {
  const configured = process.env.S3S_RESULTS_DIR;
  if (configured && configured.trim()) {
    return path.resolve(process.cwd(), configured.trim());
  }
  return path.resolve(process.cwd(), "../s3s/exports/results");
}

function collectJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  const files = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function pickMatchRoot(payload) {
  if (payload && typeof payload === "object" && payload.vsHistoryDetail) {
    return payload.vsHistoryDetail;
  }
  if (payload && typeof payload === "object" && payload.data?.vsHistoryDetail) {
    return payload.data.vsHistoryDetail;
  }
  return payload;
}

function firstNonEmpty(values, fallback = "") {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function normalizeResult(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "WIN" || text === "LOSE" || text === "DRAW") return text;
  return text || "UNKNOWN";
}

function extractWeapon(root) {
  const direct = firstNonEmpty([
    root?.player?.weapon?.name,
    root?.myPlayer?.weapon?.name,
  ]);
  if (direct) return direct;

  const myTeamPlayers = Array.isArray(root?.myTeam?.players) ? root.myTeam.players : [];
  const myself = myTeamPlayers.find((p) => p?.isMyself);
  if (myself?.weapon?.name) return String(myself.weapon.name);

  return "";
}

function extractMatch(payload, rawText) {
  const root = pickMatchRoot(payload);
  if (!root || typeof root !== "object") {
    return null;
  }

  const externalId = firstNonEmpty([root.id, root.vsResultId]);
  if (!externalId) return null;

  const playedAt = firstNonEmpty(
    [root.playedTime, root.playedAt, root.startTime, root.endTime],
    new Date().toISOString()
  );

  return {
    external_id: externalId,
    played_at: playedAt,
    mode: firstNonEmpty([root.vsMode?.mode, root.vsMode?.name, root.vsMode?.id]),
    rule: firstNonEmpty([root.vsRule?.name, root.rule?.name, root.rule]),
    stage: firstNonEmpty([root.vsStage?.name, root.stage?.name, root.stage]),
    weapon: extractWeapon(root),
    result: normalizeResult(root.judgement || root.result || root.winOrLose),
    raw_json: rawText,
  };
}

function main() {
  const resultsDir = resolveResultsDir();
  const dbPath = resolveSqlitePath();
  const files = collectJsonFiles(resultsDir);
  const userLoginId = String(process.env.XP_USER_LOGIN_ID || "").trim();
  const shouldBackfillNullUserId =
    String(process.env.XP_BACKFILL_NULL_MATCH_USER_ID || "").trim() === "1";

  if (files.length === 0) {
    console.log(`[import_s3s_results] no JSON files found: ${resultsDir}`);
    return;
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      external_id TEXT NOT NULL UNIQUE,
      played_at TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT '',
      rule TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL DEFAULT '',
      weapon TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS matches_played_at_idx ON matches(played_at DESC);
  `);

  const matchColumns = db.prepare(`PRAGMA table_info("matches")`).all();
  const hasUserIdColumn = Array.isArray(matchColumns) && matchColumns.some((c) => c.name === "user_id");
  if (!hasUserIdColumn) {
    // Support older DBs created by previous versions of this script.
    db.exec(`ALTER TABLE matches ADD COLUMN user_id INTEGER;`);
  }

  let userId = null;
  if (userLoginId) {
    const row = db
      .prepare(`SELECT id FROM users WHERE login_id = ?`)
      .get(userLoginId);
    userId = row?.id ?? null;
    if (!userId) {
      console.warn(`[import_s3s_results] XP_USER_LOGIN_ID not found in DB: ${userLoginId}`);
    }
  }

  const existsStmt = db.prepare("SELECT 1 FROM matches WHERE external_id = ?");
  const insertStmt = db.prepare(
    `
      INSERT INTO matches (user_id, external_id, played_at, mode, rule, stage, weapon, result, raw_json)
      VALUES (@user_id, @external_id, @played_at, @mode, @rule, @stage, @weapon, @result, @raw_json)
    `
  );

  let imported = 0;
  let skipped = 0;
  let invalid = 0;

  for (const filePath of files) {
    try {
      const rawText = fs.readFileSync(filePath, "utf8");
      const payload = JSON.parse(rawText);
      const parsed = extractMatch(payload, rawText);
      if (!parsed) {
        invalid += 1;
        continue;
      }

      const exists = existsStmt.get(parsed.external_id);
      if (exists) {
        skipped += 1;
        continue;
      }

      insertStmt.run({ ...parsed, user_id: userId });
      imported += 1;
    } catch (err) {
      invalid += 1;
      console.warn(`[import_s3s_results] failed: ${filePath}`);
      console.warn(err instanceof Error ? err.message : String(err));
    }
  }

  if (userId && shouldBackfillNullUserId) {
    const result = db.prepare(`UPDATE matches SET user_id = ? WHERE user_id IS NULL`).run(userId);
    console.log(`[import_s3s_results] backfill user_id updated=${Number(result.changes ?? 0)}`);
  }

  console.log(
    `[import_s3s_results] done imported=${imported} skipped=${skipped} invalid=${invalid} files=${files.length}`
  );
}

main();
