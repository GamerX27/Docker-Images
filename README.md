# Docker-Images

Source code and Dockerfiles for the container images X27 builds and publishes to `ghcr.io/gamerx27/`. Each top-level folder is one image, usually its Dockerfile, build context, and a `compose.yml` for running the published image. Some images keep their source in a separate repo instead, in which case this folder only holds the packaging (workflow + `compose.yml`).

Compose files for images pulled from other maintainers live in [Docker-X27-Composes](https://github.com/GamerX27/Docker-X27-Composes).

## Images

- [unbound](unbound) — `ghcr.io/gamerx27/unbound`
- [ytdlp-archiver](ytdlp-archiver): `ghcr.io/gamerx27/ytdlp-archiver`, source is canonical on [Codeberg](https://codeberg.org/X27/X-YT-DLP-Archiver) and mirrored to [GitHub](https://github.com/GamerX27/X-YT-DLP-Archiver), built by CI from the GitHub mirror, not mirrored here
