/* eslint-disable no-console */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

function loadState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { uploaded: {} };
    if (!parsed.uploaded || typeof parsed.uploaded !== "object") return { uploaded: {} };
    return parsed;
  } catch {
    return { uploaded: {} };
  }
}

function saveState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function main() {
  const apiBaseUrl = String(process.env.XP_API_BASE_URL || "").trim();
  const collectorToken = String(process.env.XP_COLLECTOR_TOKEN || "").trim();
  if (!apiBaseUrl) {
    throw new Error("XP_API_BASE_URL is required (e.g. https://your-app.example.com)");
  }
  if (!collectorToken) {
    throw new Error("XP_COLLECTOR_TOKEN is required (issued from admin screen)");
  }

  const resultsDir = resolveResultsDir();
  const files = collectJsonFiles(resultsDir).sort();
  if (files.length === 0) {
    console.log(`[upload_s3s_results] no JSON files found: ${resultsDir}`);
    return;
  }

  const statePath =
    process.env.XP_UPLOAD_STATE_PATH?.trim() ||
    path.resolve(process.cwd(), ".xp-predictor-upload-state.json");
  const state = loadState(statePath);

  const pending = [];
  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const key = path.basename(filePath);
    const prev = state.uploaded[key];
    if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    pending.push({ key, filePath, raw, stat });
  }

  if (pending.length === 0) {
    console.log("[upload_s3s_results] nothing new to upload");
    return;
  }

  const chunkSize = 50;
  let inserted = 0;
  let skipped = 0;
  let invalid = 0;

  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const body = JSON.stringify({
      matches: chunk.map((c) => c.raw),
    });

    const resp = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/ingest/matches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Collector-Token": collectorToken,
      },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`upload failed (${resp.status}): ${text}`);
    }

    const json = await resp.json();
    inserted += Number(json.inserted ?? 0);
    skipped += Number(json.skipped ?? 0);
    invalid += Number(json.invalid ?? 0);

    // Mark chunk files as uploaded regardless of inserted/skipped; server dedupes by external_id.
    for (const c of chunk) {
      state.uploaded[c.key] = { mtimeMs: c.stat.mtimeMs, size: c.stat.size };
    }
    saveState(statePath, state);
  }

  console.log(
    `[upload_s3s_results] done files=${pending.length} inserted=${inserted} skipped=${skipped} invalid=${invalid}`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

