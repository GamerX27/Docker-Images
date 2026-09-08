# ytdlp-archiver

Self-hosted web downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp):
paste a URL, pick a quality, and a rule-based planner selects the format and
destination folder automatically. Optional Jellyfin integration for
library downloads and scheduled playlist monitoring.

Source lives on Codeberg, not here — this folder only holds the packaging
(this README + `compose.yml`):
[codeberg.org/X27/X-YT-DLP-Archiver](https://codeberg.org/X27/X-YT-DLP-Archiver).

Published to `ghcr.io/gamerx27/ytdlp-archiver:latest` via
[.github/workflows/ytdlp-archiver-image.yml](../.github/workflows/ytdlp-archiver-image.yml),
which builds directly from the Codeberg source and rebuilds daily to pick up
new source commits, yt-dlp releases, and base-image security patches.

## Usage

```bash
docker compose up -d
```

UI at `http://localhost:3050`. See the
[source repo's README](https://codeberg.org/X27/X-YT-DLP-Archiver) for the
full configuration reference (environment variables, Jellyfin setup, etc).
