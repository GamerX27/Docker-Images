import io
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, send_file, abort
from werkzeug.utils import secure_filename

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
WALLPAPER_DIR = DATA_DIR / "wallpapers"
FAVICON_CACHE_DIR = DATA_DIR / "favicon-cache"
SHORTCUT_ICON_DIR = DATA_DIR / "shortcut-icons"
CONFIG_PATH = DATA_DIR / "config.json"
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
ICON_LIBRARY_DIR = Path(__file__).resolve().parent / "icons"
ICON_LIBRARY_MANIFEST = ICON_LIBRARY_DIR / "manifest.json"
VERSION_PATH = Path(__file__).resolve().parent.parent / "VERSION"

try:
    APP_VERSION = VERSION_PATH.read_text().strip()
except OSError:
    APP_VERSION = "0.0.0"

ALLOWED_WALLPAPER_EXT = {"png", "jpg", "jpeg", "webp", "gif"}
MAX_WALLPAPER_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_ICON_EXT = {"png", "jpg", "jpeg", "webp", "gif", "svg", "ico"}
MAX_ICON_BYTES = 2 * 1024 * 1024  # 2 MB

FAVICON_FETCH_TIMEOUT = 5
MAX_FAVICON_BYTES = 2 * 1024 * 1024  # 2 MB
FAVICON_USER_AGENT = "Mozilla/5.0 (compatible; HomelabDashboard/1.0; +favicon-fetch)"
FAVICON_CONTENT_TYPE_TO_EXT = {
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}
FAVICON_IMAGE_MAGIC = (b"\x00\x00\x01\x00", b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"<svg", b"RIFF", b"BM")
FAVICON_LINK_TAG_RE = re.compile(rb"<link\b[^>]*>", re.IGNORECASE)
FAVICON_REL_RE = re.compile(rb'rel\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
FAVICON_HREF_RE = re.compile(rb'href\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)

DEFAULT_CONFIG = {
    "settings": {
        "title": "Dashboard",
        "searxng_url": os.environ.get("SEARXNG_URL", "http://localhost:8888"),
        "wallpaper": None,
        "open_new_tab": True,
        "greeting_enabled": True,
        "clock_24h": True,
    },
    "shortcuts": [],
}

_lock = threading.Lock()

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_WALLPAPER_BYTES + (1 * 1024 * 1024)


def _ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WALLPAPER_DIR.mkdir(parents=True, exist_ok=True)
    FAVICON_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    SHORTCUT_ICON_DIR.mkdir(parents=True, exist_ok=True)


_icon_library_cache = None


def _load_icon_library():
    global _icon_library_cache
    if _icon_library_cache is None:
        try:
            with open(ICON_LIBRARY_MANIFEST, "r", encoding="utf-8") as f:
                _icon_library_cache = json.load(f)
        except (OSError, json.JSONDecodeError):
            _icon_library_cache = []
    return _icon_library_cache


def _load_config():
    _ensure_dirs()
    if not CONFIG_PATH.exists():
        _save_config(DEFAULT_CONFIG)
        return json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except (json.JSONDecodeError, OSError):
        return json.loads(json.dumps(DEFAULT_CONFIG))
    # backfill any missing keys from defaults (forward-compatible upgrades)
    for key, val in DEFAULT_CONFIG["settings"].items():
        cfg.setdefault("settings", {}).setdefault(key, val)
    cfg.setdefault("shortcuts", [])
    for shortcut in cfg["shortcuts"]:
        shortcut.setdefault("page", 1)
    return cfg


def _save_config(cfg):
    _ensure_dirs()
    tmp_path = CONFIG_PATH.with_suffix(".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    tmp_path.replace(CONFIG_PATH)


def _next_order(shortcuts):
    if not shortcuts:
        return 0
    return max(s.get("order", 0) for s in shortcuts) + 1


def _parse_page(value, default=1):
    try:
        page = int(value)
        return page if page >= 1 else default
    except (TypeError, ValueError):
        return default


def _validate_shortcut_payload(data, partial=False):
    errors = []
    name = data.get("name")
    url = data.get("url")
    if not partial or "name" in data:
        if not name or not isinstance(name, str) or not name.strip():
            errors.append("name is required")
    if not partial or "url" in data:
        if not url or not isinstance(url, str) or not url.strip():
            errors.append("url is required")
        elif not re.match(r"^https?://", url.strip(), re.IGNORECASE):
            errors.append("url must start with http:// or https://")
    return errors


# ---------- favicon resolution ----------
#
# Self-hosted apps rarely serve a conventional /favicon.ico (Jellyfin, for
# example, only declares one via a content-hashed <link rel="icon"> tag under
# /web/). Browsers can't read another origin's HTML to find that tag (CORS),
# so resolution happens here server-side, where CORS doesn't apply, and the
# result is cached to disk.

def _favicon_http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": FAVICON_USER_AGENT})
    with urllib.request.urlopen(req, timeout=FAVICON_FETCH_TIMEOUT) as resp:
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read(MAX_FAVICON_BYTES + 1)
        final_url = resp.geturl()
    if len(data) > MAX_FAVICON_BYTES:
        return None
    return data, content_type, final_url


def _looks_like_image(content_type, data):
    if content_type and content_type.split(";")[0].strip().lower().startswith("image/"):
        return True
    return bool(data) and data.startswith(FAVICON_IMAGE_MAGIC)


def _find_favicon_href(html_bytes):
    candidates = []
    for tag in FAVICON_LINK_TAG_RE.findall(html_bytes):
        rel_match = FAVICON_REL_RE.search(tag)
        href_match = FAVICON_HREF_RE.search(tag)
        if not rel_match or not href_match:
            continue
        rel = rel_match.group(1).decode("utf-8", "ignore").strip().lower()
        if "icon" not in rel:
            continue
        priority = 0 if rel in ("icon", "shortcut icon") else 1
        candidates.append((priority, href_match.group(1).decode("utf-8", "ignore")))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0])
    return candidates[0][1]


def _resolve_favicon(page_url):
    try:
        parsed = urllib.parse.urlparse(page_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return None
        origin = f"{parsed.scheme}://{parsed.netloc}"
    except ValueError:
        return None

    try:
        result = _favicon_http_get(f"{origin}/favicon.ico")
        if result:
            data, ctype, _ = result
            if _looks_like_image(ctype, data):
                return data, ctype or "image/x-icon"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass

    try:
        result = _favicon_http_get(page_url)
        if not result:
            return None
        html, ctype, final_url = result
        if "html" not in (ctype or "").lower():
            return None
        href = _find_favicon_href(html)
        if not href:
            return None
        icon_url = urllib.parse.urljoin(final_url, href)
        result2 = _favicon_http_get(icon_url)
        if not result2:
            return None
        data2, ctype2, _ = result2
        if _looks_like_image(ctype2, data2):
            return data2, ctype2 or "image/x-icon"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        pass
    return None


def _favicon_cache_clear(shortcut_id):
    for f in FAVICON_CACHE_DIR.glob(f"{shortcut_id}.*"):
        try:
            f.unlink()
        except OSError:
            pass


def _shortcut_icon_clear(shortcut_id):
    for f in SHORTCUT_ICON_DIR.glob(f"{shortcut_id}.*"):
        try:
            f.unlink()
        except OSError:
            pass


# ---------- static frontend ----------

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(FRONTEND_DIR, filename)


@app.get("/wallpapers/<path:filename>")
def wallpapers(filename):
    return send_from_directory(WALLPAPER_DIR, filename)


@app.get("/shortcut-icons/<path:filename>")
def shortcut_icons(filename):
    return send_from_directory(SHORTCUT_ICON_DIR, filename)


@app.get("/icon-library/<path:filename>")
def icon_library_file(filename):
    return send_from_directory(ICON_LIBRARY_DIR, filename, max_age=86400)


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


# ---------- icon library ----------
#
# A curated set of icons for popular self-hosted services, bundled with the
# app so shortcuts get a crisp, correct icon instead of a scraped favicon.
# Sourced from selfh.st/icons (CC BY 4.0) — see backend/icons/ATTRIBUTION.md.
# These are the trademarks of their respective projects; see that file for
# the full disclaimer.

def _normalize_icon_match_text(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _match_icon_library(name):
    normalized = _normalize_icon_match_text(name)
    if not normalized:
        return None
    best = None
    for entry in _load_icon_library():
        candidates = [entry["slug"], entry["name"]] + entry.get("aliases", [])
        for candidate in candidates:
            norm_candidate = _normalize_icon_match_text(candidate)
            if not norm_candidate:
                continue
            if norm_candidate == normalized:
                return entry["slug"]
            # Require a few characters for substring matches — with thousands
            # of slugs in the full library, very short ones (e.g. "n8n") would
            # otherwise false-positive against unrelated shortcut names.
            if len(norm_candidate) >= 4 and norm_candidate in normalized and (best is None or len(norm_candidate) > len(best[1])):
                best = (entry["slug"], norm_candidate)
    return best[0] if best else None


@app.get("/api/icon-library")
def api_icon_library():
    return jsonify(_load_icon_library())


@app.get("/icons/<shortcut_id>")
def shortcut_icon(shortcut_id):
    """Auto-resolved icon for a shortcut with no custom icon set.

    Priority: bundled icon-library match by name (best quality, no network
    call) > scraped-and-cached favicon > 404 (frontend falls back to a
    colored initial).
    """
    with _lock:
        cfg = _load_config()
    shortcut = next((s for s in cfg["shortcuts"] if s["id"] == shortcut_id), None)
    if not shortcut:
        abort(404)

    slug = _match_icon_library(shortcut["name"])
    if slug:
        return send_from_directory(ICON_LIBRARY_DIR, f"{slug}.svg", max_age=86400)

    _ensure_dirs()
    for cached in FAVICON_CACHE_DIR.glob(f"{shortcut_id}.*"):
        ctype = next((k for k, v in FAVICON_CONTENT_TYPE_TO_EXT.items() if v == cached.suffix), "image/x-icon")
        return send_file(cached, mimetype=ctype, max_age=86400)

    resolved = _resolve_favicon(shortcut["url"])
    if not resolved:
        abort(404)
    data, ctype = resolved
    ext = FAVICON_CONTENT_TYPE_TO_EXT.get(ctype.split(";")[0].strip().lower(), ".ico")
    cache_path = FAVICON_CACHE_DIR / f"{shortcut_id}{ext}"
    with open(cache_path, "wb") as fh:
        fh.write(data)
    return send_file(cache_path, mimetype=ctype, max_age=86400)


# ---------- config / settings ----------

@app.get("/api/config")
def get_config():
    with _lock:
        cfg = _load_config()
    cfg["version"] = APP_VERSION
    return jsonify(cfg)


@app.put("/api/settings")
def update_settings():
    payload = request.get_json(silent=True) or {}
    with _lock:
        cfg = _load_config()
        settings = cfg["settings"]
        if "title" in payload:
            title = str(payload["title"]).strip()
            settings["title"] = title[:80] if title else DEFAULT_CONFIG["settings"]["title"]
        if "searxng_url" in payload:
            url = str(payload["searxng_url"]).strip().rstrip("/")
            if url and not re.match(r"^https?://", url, re.IGNORECASE):
                return jsonify({"error": "searxng_url must start with http:// or https://"}), 400
            settings["searxng_url"] = url
        if "open_new_tab" in payload:
            settings["open_new_tab"] = bool(payload["open_new_tab"])
        if "greeting_enabled" in payload:
            settings["greeting_enabled"] = bool(payload["greeting_enabled"])
        if "clock_24h" in payload:
            settings["clock_24h"] = bool(payload["clock_24h"])
        _save_config(cfg)
    return jsonify(cfg)


# ---------- wallpaper ----------

@app.post("/api/wallpaper")
def upload_wallpaper():
    if "file" not in request.files:
        return jsonify({"error": "no file provided"}), 400
    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "no file selected"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_WALLPAPER_EXT:
        return jsonify({"error": f"unsupported file type .{ext}"}), 400

    with _lock:
        cfg = _load_config()
        _ensure_dirs()
        # remove previous wallpaper file if present
        old = cfg["settings"].get("wallpaper")
        if old:
            old_path = WALLPAPER_DIR / old
            if old_path.exists():
                try:
                    old_path.unlink()
                except OSError:
                    pass
        filename = f"{uuid.uuid4().hex}.{ext}"
        filename = secure_filename(filename)
        file.save(WALLPAPER_DIR / filename)
        cfg["settings"]["wallpaper"] = filename
        _save_config(cfg)
    return jsonify(cfg)


@app.delete("/api/wallpaper")
def delete_wallpaper():
    with _lock:
        cfg = _load_config()
        old = cfg["settings"].get("wallpaper")
        if old:
            old_path = WALLPAPER_DIR / old
            if old_path.exists():
                try:
                    old_path.unlink()
                except OSError:
                    pass
        cfg["settings"]["wallpaper"] = None
        _save_config(cfg)
    return jsonify(cfg)


# ---------- export / import ----------

@app.get("/api/export")
def export_config():
    with _lock:
        cfg = _load_config()
        _ensure_dirs()
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("config.json", json.dumps(cfg, indent=2))

            wallpaper = cfg["settings"].get("wallpaper")
            if wallpaper:
                wallpaper_path = WALLPAPER_DIR / wallpaper
                if wallpaper_path.exists():
                    zf.write(wallpaper_path, f"wallpapers/{wallpaper}")

            for shortcut in cfg["shortcuts"]:
                icon = shortcut.get("icon") or ""
                if icon.startswith("/shortcut-icons/"):
                    filename = icon.split("/shortcut-icons/", 1)[1]
                    icon_path = SHORTCUT_ICON_DIR / filename
                    if icon_path.exists():
                        zf.write(icon_path, f"shortcut-icons/{filename}")
        buf.seek(0)
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name="homelab-dashboard-export.zip",
    )


@app.post("/api/import")
def import_config():
    if "file" not in request.files:
        return jsonify({"error": "no file provided"}), 400
    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "no file selected"}), 400

    try:
        zf = zipfile.ZipFile(io.BytesIO(file.read()))
    except zipfile.BadZipFile:
        return jsonify({"error": "not a valid export file"}), 400

    try:
        imported = json.loads(zf.read("config.json"))
    except (KeyError, json.JSONDecodeError):
        return jsonify({"error": "export file is missing a valid config.json"}), 400

    if not isinstance(imported.get("settings"), dict) or not isinstance(imported.get("shortcuts"), list):
        return jsonify({"error": "config.json is missing settings/shortcuts"}), 400

    with _lock:
        _ensure_dirs()
        # secure_filename strips any path components, so this can't escape
        # WALLPAPER_DIR / SHORTCUT_ICON_DIR regardless of what the zip names say.
        for name in zf.namelist():
            if name.startswith("wallpapers/") and not name.endswith("/"):
                target = secure_filename(Path(name).name)
                if target:
                    (WALLPAPER_DIR / target).write_bytes(zf.read(name))
            elif name.startswith("shortcut-icons/") and not name.endswith("/"):
                target = secure_filename(Path(name).name)
                if target:
                    (SHORTCUT_ICON_DIR / target).write_bytes(zf.read(name))

        for key, val in DEFAULT_CONFIG["settings"].items():
            imported["settings"].setdefault(key, val)
        for shortcut in imported["shortcuts"]:
            shortcut.setdefault("page", 1)

        _save_config(imported)
        cfg = imported
    return jsonify(cfg)


# ---------- shortcuts ----------

@app.get("/api/shortcuts")
def list_shortcuts():
    with _lock:
        cfg = _load_config()
    return jsonify(cfg["shortcuts"])


@app.post("/api/shortcuts")
def create_shortcut():
    data = request.get_json(silent=True) or {}
    errors = _validate_shortcut_payload(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    with _lock:
        cfg = _load_config()
        shortcut = {
            "id": uuid.uuid4().hex[:12],
            "name": data["name"].strip()[:60],
            "url": data["url"].strip(),
            "icon": (data.get("icon") or "").strip()[:200],
            "color": (data.get("color") or "#4f7cff").strip()[:20],
            "page": _parse_page(data.get("page")),
            "order": _next_order(cfg["shortcuts"]),
        }
        cfg["shortcuts"].append(shortcut)
        _save_config(cfg)
    return jsonify(shortcut), 201


@app.put("/api/shortcuts/<shortcut_id>")
def update_shortcut(shortcut_id):
    data = request.get_json(silent=True) or {}
    errors = _validate_shortcut_payload(data, partial=True)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    with _lock:
        cfg = _load_config()
        match = next((s for s in cfg["shortcuts"] if s["id"] == shortcut_id), None)
        if not match:
            return jsonify({"error": "shortcut not found"}), 404
        if "name" in data:
            match["name"] = data["name"].strip()[:60]
        if "url" in data and data["url"].strip() != match["url"]:
            match["url"] = data["url"].strip()
            _favicon_cache_clear(shortcut_id)
        if "icon" in data:
            match["icon"] = (data.get("icon") or "").strip()[:200]
        if "color" in data:
            match["color"] = (data.get("color") or "#4f7cff").strip()[:20]
        if "page" in data:
            match["page"] = _parse_page(data.get("page"), default=match.get("page", 1))
        _save_config(cfg)
    return jsonify(match)


@app.delete("/api/shortcuts/<shortcut_id>")
def delete_shortcut(shortcut_id):
    with _lock:
        cfg = _load_config()
        before = len(cfg["shortcuts"])
        cfg["shortcuts"] = [s for s in cfg["shortcuts"] if s["id"] != shortcut_id]
        if len(cfg["shortcuts"]) == before:
            return jsonify({"error": "shortcut not found"}), 404
        _save_config(cfg)
    _favicon_cache_clear(shortcut_id)
    _shortcut_icon_clear(shortcut_id)
    return jsonify({"status": "deleted"})


@app.post("/api/shortcuts/<shortcut_id>/icon")
def upload_shortcut_icon(shortcut_id):
    if "file" not in request.files:
        return jsonify({"error": "no file provided"}), 400
    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "no file selected"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_ICON_EXT:
        return jsonify({"error": f"unsupported file type .{ext}"}), 400

    file.seek(0, os.SEEK_END)
    if file.tell() > MAX_ICON_BYTES:
        return jsonify({"error": "icon must be 2 MB or smaller"}), 400
    file.seek(0)

    with _lock:
        cfg = _load_config()
        match = next((s for s in cfg["shortcuts"] if s["id"] == shortcut_id), None)
        if not match:
            return jsonify({"error": "shortcut not found"}), 404
        _ensure_dirs()
        _shortcut_icon_clear(shortcut_id)
        filename = secure_filename(f"{shortcut_id}.{ext}")
        file.save(SHORTCUT_ICON_DIR / filename)
        match["icon"] = f"/shortcut-icons/{filename}"
        _save_config(cfg)
    return jsonify(match)


@app.delete("/api/shortcuts/<shortcut_id>/icon")
def delete_shortcut_icon(shortcut_id):
    with _lock:
        cfg = _load_config()
        match = next((s for s in cfg["shortcuts"] if s["id"] == shortcut_id), None)
        if not match:
            return jsonify({"error": "shortcut not found"}), 404
        _shortcut_icon_clear(shortcut_id)
        match["icon"] = ""
        _save_config(cfg)
    return jsonify(match)


@app.post("/api/shortcuts/reorder")
def reorder_shortcuts():
    data = request.get_json(silent=True) or {}
    order = data.get("order")
    if not isinstance(order, list):
        return jsonify({"error": "order must be a list of shortcut ids"}), 400
    with _lock:
        cfg = _load_config()
        by_id = {s["id"]: s for s in cfg["shortcuts"]}
        if set(order) != set(by_id.keys()):
            return jsonify({"error": "order must contain exactly the existing shortcut ids"}), 400
        for idx, sid in enumerate(order):
            by_id[sid]["order"] = idx
        _save_config(cfg)
    return jsonify(cfg["shortcuts"])


if __name__ == "__main__":
    _ensure_dirs()
    app.run(host="0.0.0.0", port=8008)
