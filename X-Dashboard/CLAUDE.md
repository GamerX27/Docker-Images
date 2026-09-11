# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

X-Dashboard is a self-hosted start page (Heimdall-style): app/site shortcuts
on swipeable pages, a wallpaper that drives the UI's accent color and
light/dark theme, and a search bar wired to a self-hosted SearXNG instance.
Flask backend + static vanilla JS/CSS frontend, **no build step, no
frontend package.json**.

This directory is one project inside the `Docker-Images` monorepo (sibling
projects: `unbound`, `Dev-Box`). The git repo root is one level up.

## Running it

```bash
docker compose up -d
```

Open http://localhost:8008. Shortcuts, settings, and the uploaded wallpaper
persist in `./data` (bind-mounted to `/data` in the container).

There is no local dev server script — `compose.yml` always pulls
`ghcr.io/gamerx27/x-dashboard:latest`. To test local changes, build the
image from this directory and run it directly, e.g.:

```bash
docker build -t x-dashboard:dev -f Dockerfile ..   # build context is the repo root
docker run --rm -p 8008:8008 -v "$(pwd)/data:/data" x-dashboard:dev
```

There are no automated tests or linters configured in this project.

## Architecture

**Backend (`backend/app.py`)** is a single-file Flask app, no ORM/DB — all
state lives in one JSON document (`DATA_DIR/config.json`, shape
`{settings, shortcuts}`) read/written under a single `threading.Lock`
(`_load_config`/`_save_config`, atomic write via temp-file + `.replace()`).
Every request handler follows the same pattern: acquire `_lock`, load
config, mutate, save. Routes are grouped by comment banners
(`# ---------- favicon resolution ----------`, etc.) — check the banner for
a section before adding a new route so it lands in the right place:
- static frontend serving (`/`, `/assets/`, `/wallpapers/`, `/shortcut-icons/`, `/icon-library/`)
- icon library (bundled selfh.st SVGs, name-matched to shortcuts)
- favicon resolution/caching (`/icons/<id>`) and online-status checks (`/api/status`)
- config/settings, wallpaper upload, export/import (zip of config + assets)
- shortcuts CRUD + custom icon upload + drag-reorder

Two things are resolved **server-side** specifically to dodge browser CORS,
since shortcuts point at arbitrary (often LAN-only) origins:
- **Favicon resolution** (`_resolve_favicon`): tries `/favicon.ico` first,
  then fetches the page HTML and parses `<link rel="icon">` tags — some
  self-hosted apps (e.g. Jellyfin) only expose a favicon that way. Results
  are cached to disk under `FAVICON_CACHE_DIR`, keyed by shortcut id, and
  invalidated when a shortcut's URL changes.
- **Online/offline status** (`/api/status`): does a threaded HTTP HEAD/GET
  sweep of every shortcut URL server-side.

Icon resolution priority for a shortcut with no custom icon (`/icons/<id>`):
bundled icon-library SVG match by name > cached/scraped favicon > 404
(frontend falls back to a colored initial).

The icon library itself (`backend/icons/*.svg` + `manifest.json`) is **not
checked into the repo** — it's fetched from `github.com/selfhst/icons` and
built by `backend/icons/generate_manifest.py` in the Docker build's `icons`
stage (see `Dockerfile`). If you need the icon set locally outside Docker,
run that script yourself against a checkout of that icons repo.

**Frontend (`frontend/`)** is a single IIFE in `app.js` (~1300 lines, no
modules/bundler) driving a single `index.html` via a hand-rolled `state`
object and direct DOM manipulation (`el(id)` helper). Notable pieces:
- Two inline `<script>` blocks at the top of `index.html` prime the
  theme/accent-color/wallpaper from `localStorage` *before* the stylesheet
  paints, so a reload doesn't flash the default light theme while
  `/api/config` and wallpaper color extraction (both async) are in flight.
  `app.js` keeps that cache in sync (`cacheThemeLocally`).
- Accent color is derived from the wallpaper image client-side
  (`extractAccentFromImage`, canvas pixel sampling → HSL) — there is no
  server-side image processing.
- Shortcuts are laid out into "pages" (phone-home-screen style, swipeable),
  computed client-side from a per-shortcut `page` field; dragging a tile to
  a screen edge auto-flips pages or creates a new one. This logic
  (`computeTotalPages`, `handleTileDrop`, edge-flip handlers) is the most
  intricate part of the frontend — read the surrounding comments before
  changing drag/page behavior, they explain several non-obvious UX
  decisions.
- `fitUiToViewport` auto-shrinks a `--ui-scale`-layered multiplier so the
  tallest page fits without scrolling (pages are swiped between, not
  scrolled within).

Both frontend files are served directly by Flask from `FRONTEND_DIR`
(`../frontend` relative to `app.py`) — editing `frontend/app.js` or
`style.css` takes effect on next page load, no build/restart needed as
long as the Flask process itself is already running against a live mount.

## Docker image

`Dockerfile` is a two-stage build:
1. `icons` stage: downloads `selfhst/icons` at build time, strips
   dark/light variants (keeps one default full-color SVG per service), and
   runs `generate_manifest.py` to produce `manifest.json`.
2. Final stage: Python 3.12-slim + Flask app, run via
   `gunicorn --workers 2`.

Published to `ghcr.io/gamerx27/x-dashboard:latest` via
`../.github/workflows/x-dashboard-image.yml` (in the monorepo root),
rebuilt weekly to pick up icon-set and base-image updates. `VERSION` is a
plain text file read by `app.py` at startup and surfaced via `/api/config`.

**Bump `VERSION` (patch/minor as appropriate) whenever you make a major
change** — a new feature, a behavior change, a notable fix. This has been
missed in the past (several feature commits landed without a bump), so
don't skip it.
