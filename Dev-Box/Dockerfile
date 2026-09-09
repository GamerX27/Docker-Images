FROM debian:testing

# Bump when a new KasmVNC release ships; the "trixie" .deb is what's
# published today and installs cleanly on testing since its dependency
# bounds are all lower-bound (>=) version constraints.
ARG KASMVNC_VERSION=1.5.0
ARG VNC_UID=1000
ARG VNC_GID=1000

ENV DEBIAN_FRONTEND=noninteractive

# xfce4          - light DE, well supported by KasmVNC's desktop detection
# dbus-x11       - xfce4-session needs a session bus
# mesa-*/vainfo/vulkan-tools - open-source AMD (amdgpu/radeonsi) userspace
#                  stack; the kernel driver and firmware stay on the host,
#                  /dev/dri is bind-mounted in at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl wget sudo locales iptables iproute2 gnupg \
        xfce4 xfce4-terminal dbus-x11 arc-theme papirus-icon-theme \
        mesa-vulkan-drivers mesa-va-drivers libgl1-mesa-dri vainfo vulkan-tools \
        htop chromium git pulseaudio pulseaudio-utils fish \
    && sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI: not packaged in Debian, only available from its own apt repo.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Docker Engine, for Claude Code (and you) to build/run containers *inside*
# this box only - see entrypoint.sh for why this needs --privileged, and
# CLAUDE.md for why that's still a scoped trade-off, not a blank check:
# there's no bind-mounted host docker.sock, so this daemon can't see or
# touch anything running on the actual host.
RUN apt-get update && apt-get install -y --no-install-recommends \
        docker.io docker-cli docker-compose docker-buildx fuse-overlayfs \
    && rm -rf /var/lib/apt/lists/*

# Claude Code: no apt package, and the official installer targets $HOME
# too - same fixed-system-location treatment as Zed below.
RUN mkdir -p /opt/claude \
    && HOME=/opt/claude bash -c 'curl -fsSL https://claude.ai/install.sh | bash' \
    && ln -s "$(readlink -f /opt/claude/.local/bin/claude)" /usr/local/bin/claude

ENV LANG=en_US.UTF-8

# KasmVNC: browser-native VNC server built for low-latency adaptive
# streaming, dynamic resolution (resizes the desktop to the browser
# window), and bidirectional clipboard sync - no separate noVNC/websockify
# layer needed. ssl-cert (for its self-signed cert) comes in as a
# dependency of the package itself.
RUN curl -fsSL -o /tmp/kasmvncserver.deb \
        "https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/kasmvncserver_trixie_${KASMVNC_VERSION}_amd64.deb" \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/kasmvncserver.deb \
    && rm -f /tmp/kasmvncserver.deb \
    && rm -rf /var/lib/apt/lists/*

# Make Chromium the system default browser (x-www-browser alternative,
# used by `exo-open --launch WebBrowser` and most mailcap-aware tools).
RUN update-alternatives --set x-www-browser /usr/bin/chromium

# Locked-down Chromium policy: no saved passwords/autofill (this is a
# shared/throwaway desktop, not a personal profile), enhanced Safe
# Browsing, HTTPS-only, no prefetch/spellcheck/telemetry callouts to
# Google, sync disabled - plus force-installing uBlock Origin Lite and
# the Claude extension so they're present without a manual web store trip.
COPY chromium-policy.json /etc/chromium/policies/managed/dev-box-policy.json

# Chromium's setuid sandbox needs CAP_SYS_ADMIN to create namespaces,
# which this container doesn't grant (see chromium-default-flags for why).
RUN mkdir -p /etc/chromium.d
COPY chromium-default-flags /etc/chromium.d/00-devbox-flags

# Zed editor: no apt package exists, and the official installer targets
# $HOME/.local - install into a fixed system location instead so it isn't
# lost or duplicated by the bind-mounted, persistent /home/dev.
RUN HOME=/opt/zed SHELL=/bin/sh sh -c 'curl -fsSL https://zed.dev/install.sh | sh' \
    && ln -s /opt/zed/.local/zed.app/bin/zed /usr/local/bin/zed \
    && cp /opt/zed/.local/share/applications/dev.zed.Zed.desktop /usr/share/applications/ \
    && sed -i "s|Icon=zed|Icon=/opt/zed/.local/zed.app/share/icons/hicolor/512x512/apps/zed.png|;s|Exec=zed|Exec=/usr/local/bin/zed|" \
        /usr/share/applications/dev.zed.Zed.desktop

# KasmVNC's own docs recommend disabling the XFCE compositor: it fights
# the frame-grabbing KasmVNC does for encoding and costs framerate for no
# benefit in a remote session. Same file also sets the dark xfwm4 theme.
COPY xfwm4.xml /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml

# Dark GTK theme (Arc-Dark, from the arc-theme package above).
COPY xsettings.xml /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xsettings.xml

# Single top panel (no bottom dock) with chromium/zed/file-manager/terminal
# pinned next to the applications menu - see xfce4-panel.xml.
COPY xfce4-panel.xml /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml
COPY panel-launchers/ /etc/xdg/xfce4/panel/

RUN mkdir -p /usr/share/backgrounds/dev-box \
    && curl -fsSL -o /usr/share/backgrounds/dev-box/wallpaper.png \
        "https://svs.gsfc.nasa.gov/vis/a010000/a014800/a014866/NGC_1929_from_Spitzer_Chandra_ESO_desktop.png"
COPY xfce4-desktop.xml /etc/xdg/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml

RUN groupadd -g "$VNC_GID" dev \
    && useradd -m -u "$VNC_UID" -g "$VNC_GID" -s /usr/bin/fish dev \
    && usermod -aG sudo,ssl-cert,video,docker dev \
    && echo "dev ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/dev \
    && chmod 0440 /etc/sudoers.d/dev

# Templates copied into the user's persistent $HOME on first run only (see
# entrypoint.sh) - not baked directly into /home/dev, which a bind-mounted
# host directory would shadow anyway.
COPY CLAUDE.md zed-settings.json chromium-bookmarks.json /etc/devbox-defaults/

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8443/tcp

# KasmVNC answers with 401 until authenticated, so just check it answers
# at all rather than using curl -f (which treats 401 as a failure).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -sSko /dev/null -w '%{http_code}' https://127.0.0.1:8443/ | grep -q '^[0-9]' || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
