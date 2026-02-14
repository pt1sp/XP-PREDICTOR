# Render Deployment Guide

This project can be deployed as a single service (API + frontend static files) using Render.

## 1. Prerequisites

- GitHub repository is up to date (`main` branch)
- `render.yaml` exists at repo root

## 2. Create Service From Blueprint

1. Open Render dashboard.
2. Click `New` -> `Blueprint`.
3. Connect the GitHub repo: `pt1sp/XP-PREDICTOR`.
4. Select branch: `main`.
5. Confirm service from `render.yaml`.

## 3. Set Environment Variables

Set these in Render service settings:

- `BUILTIN_ADMIN_PASSWORD` (required): initial admin password
- `CORS_ALLOWED_ORIGINS`:
  - For single-service deploy: your Render URL (e.g. `https://xp-predictor.onrender.com`)
  - For custom domain: comma-separated list

Already defined in `render.yaml`:

- `NODE_ENV=production`
- `DATABASE_URL=file:/data/dev.db`
- `BUILTIN_ADMIN_LOGIN_ID=administrator`

## 4. Persistent Disk

`render.yaml` mounts a persistent disk at `/data`.
SQLite file is stored at `/data/dev.db`.

## 5. Verify Deployment

After deploy completes:

1. Check health endpoint:
   - `GET https://<your-render-url>/api/health`
   - Expected: `{"ok":true}`
2. Open app root:
   - `https://<your-render-url>/`
3. Verify login/register and session save.

## 6. Release Flow

Recommended release flow:

1. Merge to `develop`
2. Promote `develop` -> `main`
3. Tag release (`vX.Y.Z`)
4. Publish GitHub Release
