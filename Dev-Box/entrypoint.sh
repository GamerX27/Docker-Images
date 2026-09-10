#!/bin/bash
set -euo pipefail

VNC_USER="dev"
VNC_HOME="/home/$VNC_USER"
DRI_NODE="${DRI_NODE:-/dev/dri/renderD128}"

: "${VNC_PW:?Set VNC_PW to the password you want for the dev box}"

export HOME="$VNC_HOME"
export USER="$VNC_USER"

# TZ is read from the environment (not baked in at build time) so changing
# it is just a compose.yml edit + restart, no rebuild needed.
TZ="${TZ:-UTC}"
if [ -f "/usr/share/zoneinfo/$TZ" ]; then
    ln -sf "/usr/share/zoneinfo/$TZ" /etc/localtime
    echo "$TZ" > /etc/timezone
else
    echo "Unknown TZ '$TZ', leaving clock as UTC" >&2
fi

# Network lockdown: real internet access, but no reaching into the user's
# LAN. iptables state doesn't survive a restart (fresh netns each time),
# so this runs unconditionally on every start, unlike the first-run-only
# blocks below. ESTABLISHED,RELATED is accepted before the private-range
# DROPs so replies on connections opened *into* this container (someone
# on the LAN hitting the published VNC port) still work - only NEW
# connections this container itself initiates toward RFC1918/link-local
# ranges are blocked.
LOCAL_NET=$(ip -4 route list scope link | awk '{print $1; exit}')
iptables -F OUTPUT
iptables -P OUTPUT ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
if [ -n "$LOCAL_NET" ]; then
    iptables -A OUTPUT -d "$LOCAL_NET" -j ACCEPT
fi
iptables -A OUTPUT -m state --state NEW -d 10.0.0.0/8 -j DROP
iptables -A OUTPUT -m state --state NEW -d 172.16.0.0/12 -j DROP
iptables -A OUTPUT -m state --state NEW -d 192.168.0.0/16 -j DROP
iptables -A OUTPUT -m state --state NEW -d 169.254.0.0/16 -j DROP
iptables -A OUTPUT -j ACCEPT

# Same again for IPv6, in case the host's Docker daemon has it enabled -
# skipped harmlessly if not (no ip6 route means nothing to protect).
LOCAL_NET6=$(ip -6 route list scope link 2>/dev/null | awk '{print $1; exit}')
if [ -n "$LOCAL_NET6" ]; then
    ip6tables -F OUTPUT
    ip6tables -P OUTPUT ACCEPT
    ip6tables -A OUTPUT -o lo -j ACCEPT
    ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    ip6tables -A OUTPUT -d "$LOCAL_NET6" -j ACCEPT
    ip6tables -A OUTPUT -m state --state NEW -d fc00::/7 -j DROP
    ip6tables -A OUTPUT -m state --state NEW -d fe80::/10 -j DROP
    ip6tables -A OUTPUT -j ACCEPT
fi

# A bind-mounted home directory usually comes in owned by root on its
# very first run; fix that once rather than clobbering it on every start.
if [ "$(stat -c %u "$VNC_HOME")" != "$(id -u "$VNC_USER")" ]; then
    chown "$VNC_USER:$VNC_USER" "$VNC_HOME"
fi

# Only set the password on first run so a restart doesn't reset it.
if [ ! -f "$VNC_HOME/.kasmpasswd" ]; then
    printf '%s\n%s\n' "$VNC_PW" "$VNC_PW" \
        | setpriv --reuid="$VNC_USER" --regid="$VNC_USER" --init-groups \
            kasmvncpasswd -u "$VNC_USER" -w -r -o
fi

# The pinned top-bar launchers (chromium/zed/files/terminal) are looked up
# per-user - both the ~/.config/xfce4/panel/launcher-<id>/ item files and
# an xfconf "items" list - neither of which a plain system-wide xfconf
# default populates the way scalar panel settings do. Seed both into the
# user's own config on first run only.
if [ ! -d "$VNC_HOME/.config/xfce4/panel" ]; then
    install -d -o "$VNC_USER" -g "$VNC_USER" "$VNC_HOME/.config/xfce4/panel"
    cp -r /etc/xdg/xfce4/panel/launcher-11 /etc/xdg/xfce4/panel/launcher-12 \
          /etc/xdg/xfce4/panel/launcher-13 /etc/xdg/xfce4/panel/launcher-14 \
          "$VNC_HOME/.config/xfce4/panel/"
    chown -R "$VNC_USER:$VNC_USER" "$VNC_HOME/.config"

    # xfconfd only flushes its per-user XML store to disk a few seconds
    # after the last write, so the session has to stay alive past that or
    # the "set" calls below are silently lost.
    setpriv --reuid="$VNC_USER" --regid="$VNC_USER" --init-groups \
        dbus-run-session -- bash -c '
            xfconf-query -c xfce4-panel -p /plugins/plugin-11/items -n -t string -s chromium.desktop -a
            xfconf-query -c xfce4-panel -p /plugins/plugin-12/items -n -t string -s zed.desktop -a
            xfconf-query -c xfce4-panel -p /plugins/plugin-13/items -n -t string -s filemanager.desktop -a
            xfconf-query -c xfce4-panel -p /plugins/plugin-14/items -n -t string -s terminal.desktop -a
            sleep 8
        ' >/dev/null 2>&1
fi

# First-run-only seeds: personal starting points the user (or Claude) can
# freely edit afterwards, unlike the security policies above.
if [ ! -f "$VNC_HOME/.claude/CLAUDE.md" ]; then
    install -d -o "$VNC_USER" -g "$VNC_USER" -m 700 "$VNC_HOME/.claude"
    install -o "$VNC_USER" -g "$VNC_USER" -m 600 \
        /etc/devbox-defaults/CLAUDE.md "$VNC_HOME/.claude/CLAUDE.md"
fi
if [ ! -f "$VNC_HOME/.config/zed/settings.json" ]; then
    install -d -o "$VNC_USER" -g "$VNC_USER" "$VNC_HOME/.config/zed"
    install -o "$VNC_USER" -g "$VNC_USER" \
        /etc/devbox-defaults/zed-settings.json "$VNC_HOME/.config/zed/settings.json"
fi
if [ ! -f "$VNC_HOME/.config/chromium/Default/Bookmarks" ]; then
    install -d -o "$VNC_USER" -g "$VNC_USER" "$VNC_HOME/.config/chromium/Default"
    install -o "$VNC_USER" -g "$VNC_USER" \
        /etc/devbox-defaults/chromium-bookmarks.json "$VNC_HOME/.config/chromium/Default/Bookmarks"
fi

# `install -d -o/-g` only chowns the leaf directory it creates, not any new
# intermediate parents (e.g. ".config/chromium" above, since only
# ".../Default" was the actual target) - sweep the whole tree once to be
# sure none of the seeding above left a root-owned directory behind.
chown -R "$VNC_USER:$VNC_USER" "$VNC_HOME/.config" "$VNC_HOME/.claude"

# Packages you (or Claude) installed with `sudo apt install` during a
# previous run live in this container's own writable layer, which is lost
# if the container is ever recreated (an image rebuild, `docker compose up
# --build`, etc.) rather than just restarted. Re-declaring a package here
# instead - see CLAUDE.md - makes it survive that. A no-op, and skipped
# entirely, if the file's empty or missing.
EXTRA_PACKAGES_FILE="$VNC_HOME/.devbox/extra-packages.txt"
if [ -s "$EXTRA_PACKAGES_FILE" ]; then
    apt-get update -qq \
        && xargs -a "$EXTRA_PACKAGES_FILE" apt-get install -y --no-install-recommends \
        && rm -rf /var/lib/apt/lists/*
fi

# Docker's own internal daemon (see the Dockerfile for why this container
# runs --privileged). /var/run isn't cleared between `docker restart`s the
# way a real reboot would clear tmpfs /run, so a stale containerd.pid/
# socket from the previous run makes the new containerd think one is
# already up and time out - same class of issue as the X11 lock above.
# Backgrounded here, before dropping to the dev user below, since dockerd
# needs root; `dev` can still use the `docker` CLI without sudo via its
# membership in the `docker` group.
rm -rf /var/run/docker.pid /var/run/docker.sock /var/run/docker
dockerd >/var/log/dockerd.log 2>&1 &

# `docker compose`'s group_add (used to grant access to the host's /dev/dri
# render node) lands on this root process's supplementary groups, not on
# dev's. setpriv's --init-groups would recompute groups from /etc/group
# alone and drop that GID again, so merge it in by hand instead.
ALL_GIDS=$(printf '%s\n%s\n' "$(id -G "$VNC_USER")" "$(id -G)" \
    | tr ' ' '\n' | sort -un | paste -sd, -)

# -hw3d makes Xvnc hard-fail (and the whole desktop with it) if the render
# node isn't there, so only ask for it when /dev/dri was actually passed
# through - falls back to software rendering (llvmpipe) otherwise.
GPU_ARGS=()
if [ -e "$DRI_NODE" ]; then
    GPU_ARGS=(-hw3d -drinode "$DRI_NODE")
fi

# /tmp is part of the container's own writable layer, so a `docker restart`
# (same container, same /tmp) leaves last run's X11 lock/socket behind even
# though the process behind them is long gone - clean up before relaunching.
rm -f "/tmp/.X0-lock" "/tmp/.X11-unix/X0"

# Same idea for Chromium: SingletonLock stores hostname-pid, but the
# hostname is this container's ID, which changes on recreate even though
# the profile (bind-mounted) survives it - clear the stale lock.
rm -f "$VNC_HOME/.config/chromium/SingletonLock" \
      "$VNC_HOME/.config/chromium/SingletonSocket" \
      "$VNC_HOME/.config/chromium/SingletonCookie"

# KasmVNC's websocket port is 8443 + display number, so use :0 to land on
# the plain, expected 8443.
exec setpriv --reuid="$VNC_USER" --regid="$VNC_USER" --groups="$ALL_GIDS" \
    vncserver :0 -select-de xfce -fg "${GPU_ARGS[@]}"
