#!/usr/bin/env python3
"""Build manifest.json from the .svg files present in this directory.

Run at Docker build time, after the icon set has been fetched from
https://github.com/selfhst/icons (CC BY 4.0) — see ATTRIBUTION.md. Each
filename (its slug) is turned into a display name via a small set of
manual overrides for names generic title-casing gets wrong (acronyms,
stylized capitalization), falling back to title-casing every other slug.
"""
import json
import re
import sys
from pathlib import Path

ICON_DIR = Path(__file__).resolve().parent

# Manual overrides for the display name — generic title-casing of the slug
# gets these wrong (acronyms, stylized capitalization, ambiguous words).
NAME_OVERRIDES = {
    "adguard-home": "AdGuard Home",
    "audiobookshelf": "Audiobookshelf",
    "authelia": "Authelia",
    "bazarr": "Bazarr",
    "bitwarden": "Bitwarden",
    "bookstack": "BookStack",
    "caddy": "Caddy",
    "calibre-web": "Calibre-Web",
    "changedetection": "Changedetection.io",
    "deluge": "Deluge",
    "docker": "Docker",
    "duplicati": "Duplicati",
    "emby": "Emby",
    "esphome": "ESPHome",
    "flood": "Flood",
    "forgejo": "Forgejo",
    "freshrss": "FreshRSS",
    "gitea": "Gitea",
    "gitlab": "GitLab",
    "grafana": "Grafana",
    "headscale": "Headscale",
    "healthchecks": "Healthchecks",
    "heimdall": "Heimdall",
    "homarr": "Homarr",
    "home-assistant": "Home Assistant",
    "homepage": "Homepage",
    "immich": "Immich",
    "influxdb": "InfluxDB",
    "jackett": "Jackett",
    "jellyfin": "Jellyfin",
    "jenkins": "Jenkins",
    "joplin": "Joplin",
    "kavita": "Kavita",
    "komga": "Komga",
    "lidarr": "Lidarr",
    "loki": "Loki",
    "matrix": "Matrix",
    "mealie": "Mealie",
    "minecraft": "Minecraft",
    "miniflux": "Miniflux",
    "minio": "MinIO",
    "mosquitto": "Mosquitto",
    "n8n": "n8n",
    "navidrome": "Navidrome",
    "netdata": "Netdata",
    "nextcloud": "Nextcloud",
    "nginx-proxy-manager": "Nginx Proxy Manager",
    "ntfy": "ntfy",
    "nzbget": "NZBGet",
    "ombi": "Ombi",
    "openmediavault": "OpenMediaVault",
    "opnsense": "OPNsense",
    "overseerr": "Overseerr",
    "paperless-ngx": "Paperless-ngx",
    "pfsense": "pfSense",
    "photoprism": "PhotoPrism",
    "pi-hole": "Pi-hole",
    "plex": "Plex",
    "portainer": "Portainer",
    "prometheus": "Prometheus",
    "prowlarr": "Prowlarr",
    "proxmox": "Proxmox VE",
    "pterodactyl": "Pterodactyl",
    "qbittorrent": "qBittorrent",
    "radarr": "Radarr",
    "rclone": "Rclone",
    "requestrr": "Requestrr",
    "sabnzbd": "SABnzbd",
    "searxng": "SearXNG",
    "sonarr": "Sonarr",
    "speedtest-tracker": "Speedtest Tracker",
    "standard-notes": "Standard Notes",
    "stash": "Stash",
    "synapse": "Matrix Synapse",
    "syncthing": "Syncthing",
    "synology": "Synology",
    "tailscale": "Tailscale",
    "tautulli": "Tautulli",
    "traefik": "Traefik",
    "transmission": "Transmission",
    "truenas-scale": "TrueNAS Scale",
    "uptime-kuma": "Uptime Kuma",
    "uptimerobot": "UptimeRobot",
    "vaultwarden": "Vaultwarden",
    "vikunja": "Vikunja",
    "wallabag": "Wallabag",
    "watchtower": "Watchtower",
    "wiki-js": "Wiki.js",
    "wireguard": "WireGuard",
    "zigbee2mqtt": "Zigbee2MQTT",
}

# Extra name/alias hints for name-based auto-matching, on top of the slug
# and display name themselves (which are always checked).
ALIAS_OVERRIDES = {
    "adguard-home": ["adguard", "adguardhome"],
    "calibre-web": ["calibreweb"],
    "changedetection": ["changedetection.io", "changedetectionio"],
    "home-assistant": ["homeassistant", "hass"],
    "nginx-proxy-manager": ["npm", "nginxproxymanager"],
    "paperless-ngx": ["paperless", "paperlessngx"],
    "pi-hole": ["pihole"],
    "proxmox": ["proxmox ve", "pve", "proxmoxve"],
    "qbittorrent": ["qbit"],
    "speedtest-tracker": ["speedtest"],
    "standard-notes": ["standardnotes"],
    "synapse": ["matrix-synapse", "matrixsynapse"],
    "truenas-scale": ["truenas"],
    "uptime-kuma": ["uptimekuma"],
    "uptimerobot": ["uptime-robot", "uptime robot"],
    "vaultwarden": ["bitwarden-rs", "bitwardenrs"],
    "wiki-js": ["wikijs"],
    "zigbee2mqtt": ["z2m"],
}


def humanize(slug):
    if slug in NAME_OVERRIDES:
        return NAME_OVERRIDES[slug]
    words = re.split(r"[-_]+", slug)
    return " ".join(w[:1].upper() + w[1:] if w else w for w in words)


def main():
    svgs = sorted(ICON_DIR.glob("*.svg"))
    if not svgs:
        print("no .svg files found next to generate_manifest.py", file=sys.stderr)
        sys.exit(1)

    entries = []
    for svg in svgs:
        slug = svg.stem
        entries.append({
            "slug": slug,
            "name": humanize(slug),
            "aliases": ALIAS_OVERRIDES.get(slug, []),
        })

    with open(ICON_DIR / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)

    print(f"wrote manifest.json with {len(entries)} entries")


if __name__ == "__main__":
    main()
