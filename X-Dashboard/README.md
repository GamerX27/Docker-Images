# X-Dashboard

Self-hosted start page (Heimdall-style): app/site shortcuts on swipeable
pages, a wallpaper that drives the UI's accent color and light/dark theme,
and a search bar wired to a self-hosted SearXNG instance. Flask backend +
static vanilla JS/CSS frontend, no build step.

Published to `ghcr.io/gamerx27/x-dashboard:latest` via
[.github/workflows/x-dashboard-image.yml](../.github/workflows/x-dashboard-image.yml),
rebuilt weekly to pick up the selfh.st/icons set and base-image security
patches.

## Usage

```bash
docker compose up -d
```

Open http://localhost:8008. Shortcuts, settings, and the uploaded
wallpaper persist in `./data`.
