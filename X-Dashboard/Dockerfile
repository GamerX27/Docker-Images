# --- icons stage --------------------------------------------------------
# Fetches the full selfh.st/icons SVG set (CC BY 4.0) at build time rather
# than shipping a hand-picked subset in the repo. See backend/icons/ATTRIBUTION.md.
FROM python:3.12-slim AS icons

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /icons
RUN curl -fsSL https://github.com/selfhst/icons/archive/refs/heads/main.tar.gz -o icons.tar.gz \
    && tar -xzf icons.tar.gz --wildcards '*/svg/*.svg' --strip-components=2 \
    && rm icons.tar.gz \
    # Keep just the default full-color icon per service — drop the
    # separate outline variants meant for explicit dark/light theming.
    && find . -maxdepth 1 -name '*-dark.svg' -delete \
    && find . -maxdepth 1 -name '*-light.svg' -delete

COPY backend/icons/generate_manifest.py .
RUN python3 generate_manifest.py && rm generate_manifest.py

# --- app stage -----------------------------------------------------------
FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY frontend frontend
COPY VERSION VERSION
COPY --from=icons /icons backend/icons

ENV DATA_DIR=/data
RUN mkdir -p /data/wallpapers /data/favicon-cache /data/shortcut-icons

EXPOSE 8008

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8008/health', timeout=2).read()" || exit 1

CMD ["gunicorn", "--chdir", "backend", "-b", "0.0.0.0:8008", "--workers", "2", "app:app"]
