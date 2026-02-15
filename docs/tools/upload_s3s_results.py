#!/usr/bin/env python3
"""
Upload s3s exports/results/*.json to XP Predictor production API.

Required env vars:
  XP_API_BASE_URL      e.g. https://your-app.example.com
  XP_COLLECTOR_TOKEN   issued from Settings screen (one-time shown)

Optional env vars:
  S3S_RESULTS_DIR      default: ../s3s/exports/results (relative to cwd)
  XP_UPLOAD_STATE_PATH default: ./.xp-predictor-upload-state.json (relative to cwd)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import requests


def resolve_results_dir() -> Path:
    configured = (os.environ.get("S3S_RESULTS_DIR") or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.cwd() / ".." / "s3s" / "exports" / "results").resolve()


def state_path() -> Path:
    configured = (os.environ.get("XP_UPLOAD_STATE_PATH") or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.cwd() / ".xp-predictor-upload-state.json").resolve()


def load_state(p: Path) -> dict[str, Any]:
    try:
        raw = p.read_text(encoding="utf-8")
        obj = json.loads(raw)
        if not isinstance(obj, dict):
            return {"uploaded": {}}
        uploaded = obj.get("uploaded")
        if not isinstance(uploaded, dict):
            return {"uploaded": {}}
        return {"uploaded": uploaded}
    except Exception:
        return {"uploaded": {}}


def save_state(p: Path, state: dict[str, Any]) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    api_base = (os.environ.get("XP_API_BASE_URL") or "").strip().rstrip("/")
    token = (os.environ.get("XP_COLLECTOR_TOKEN") or "").strip()
    if not api_base:
        print("XP_API_BASE_URL is required", file=sys.stderr)
        return 2
    if not token:
        print("XP_COLLECTOR_TOKEN is required", file=sys.stderr)
        return 2

    results_dir = resolve_results_dir()
    if not results_dir.exists():
        print(f"[upload_s3s_results] results dir not found: {results_dir}")
        return 0

    files = sorted([p for p in results_dir.rglob("*.json") if p.is_file()])
    if not files:
        print(f"[upload_s3s_results] no JSON files found: {results_dir}")
        return 0

    sp = state_path()
    state = load_state(sp)
    uploaded: dict[str, Any] = state.get("uploaded", {})

    pending: list[tuple[Path, str]] = []
    for p in files:
        stat = p.stat()
        key = p.name
        prev = uploaded.get(key)
        if (
            isinstance(prev, dict)
            and prev.get("mtime_ns") == stat.st_mtime_ns
            and prev.get("size") == stat.st_size
        ):
            continue
        raw = p.read_text(encoding="utf-8")
        pending.append((p, raw))

    if not pending:
        print("[upload_s3s_results] nothing new to upload")
        return 0

    inserted = 0
    skipped = 0
    invalid = 0

    chunk_size = 50
    url = f"{api_base}/api/ingest/matches"
    headers = {"X-Collector-Token": token, "Content-Type": "application/json"}

    for i in range(0, len(pending), chunk_size):
        chunk = pending[i : i + chunk_size]
        body = {"matches": [raw for (_p, raw) in chunk]}
        resp = requests.post(url, headers=headers, data=json.dumps(body))
        if resp.status_code < 200 or resp.status_code >= 300:
            raise RuntimeError(f"upload failed ({resp.status_code}): {resp.text}")
        out = resp.json()
        inserted += int(out.get("inserted", 0))
        skipped += int(out.get("skipped", 0))
        invalid += int(out.get("invalid", 0))

        for (p, _raw) in chunk:
            stat = p.stat()
            uploaded[p.name] = {"mtime_ns": stat.st_mtime_ns, "size": stat.st_size}
        save_state(sp, {"uploaded": uploaded})

    print(
        f"[upload_s3s_results] done files={len(pending)} inserted={inserted} skipped={skipped} invalid={invalid}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)

