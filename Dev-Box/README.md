# Dev-Box

A full Linux desktop in a container, reachable from a plain browser tab: Debian
testing, XFCE, and [KasmVNC](https://github.com/kasmtech/KasmVNC) for the
remote display. KasmVNC (rather than TigerVNC/noVNC) is what makes the
low-latency framerate, resizing-to-fit-the-browser-window, and working
clipboard all work out of the box.

Step one was the desktop shell itself, with AMD GPU acceleration wired up.
Step two added dev tooling and locked the box down: a hardened, sandboxed
Chromium as the default browser, and a network that can reach the
internet but not the rest of your LAN. This step adds Claude Code, git,
GitHub CLI, a sandboxed Docker daemon, and access to your real project
files, plus a round of desktop polish (bigger panel, Papirus icons,
pinned launchers).

Not published yet - `compose.yml` builds it locally
(`build: .`) until [.github/workflows/dev-box-image.yml](../.github/workflows/dev-box-image.yml)
starts pushing it to `ghcr.io/gamerx27/dev-box:latest`.

## Usage

```bash
docker compose up -d --build
```

Then open `https://<host>:8443` and log in as `dev` with the password you
set below. The certificate is self-signed, so the browser will warn once.

- **`VNC_PW`** (required) - password for the `dev` user, set in
  `compose.yml`. Only applied on first run; change it later with
  `docker compose exec dev-box kasmvncpasswd -u dev -w -r -o`.
- **`./home`** - bind-mounted as `/home/dev`, so your files survive
  container recreation.
- **`~/Documents/Code`** (yours, on the host) is bind-mounted read-write as
  `~/Code` in the box - your real, persistent projects, not scratch space.
- **AMD GPU** - `/dev/dri` is passed through, and the entrypoint enables
  `-hw3d` automatically when it's present, so Mesa (amdgpu/radeonsi)
  renders using the host's GPU instead of software (llvmpipe). Falls back
  to software rendering if the device isn't there. Requires the
  open-source `amdgpu` driver on the host. Find the host's render-node
  group ID with `getent group render | cut -d: -f3` and set it as
  `RENDER_GID` (in `compose.yml` or a `.env` file) if it's not `108`.

## Notes

- Window resizing to match the browser, and clipboard sync in both
  directions, are on by default in KasmVNC.
- The XFCE compositor is disabled by default (`xfwm4.xml`): compositing
  fights KasmVNC's frame capture and costs framerate for no benefit in a
  remote session.
- Dark theme (Arc-Dark GTK/window manager + Papirus-Dark icons) via
  `xsettings.xml` / `xfwm4.xml`. There's a single top panel (no bottom
  dock) with Chromium, Zed, the file manager, and a terminal pinned right
  after the applications menu - see `xfce4-panel.xml` and
  `panel-launchers/`.
- Desktop wallpaper is set in `xfce4-desktop.xml`, keyed to `VNC-0` -
  the fixed output name KasmVNC's Xvnc always reports for its virtual
  screen.
- **Chromium** is the default browser (`x-www-browser` alternative) and is
  locked down via a managed policy (`chromium-policy.json`, installed to
  `/etc/chromium/policies/managed/`): no saved passwords or autofill,
  enhanced Safe Browsing, HTTPS-only, no search suggestions/spellcheck/
  prediction callouts to Google, sync and metrics disabled. Two extensions
  are force-installed - [uBlock Origin Lite](https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh)
  and the [Claude extension](https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn) -
  and all of this is enforced (grayed out in `chrome://settings`), not just
  defaulted. Chromium runs with `--no-sandbox` (`chromium-default-flags`,
  installed to `/etc/chromium.d/`): its own process sandbox needs
  `CAP_SYS_ADMIN`, which is a much bigger capability to hand the container
  than what it buys back here - the container boundary, the non-root
  `dev` user, and the network lockdown below are the security boundary
  instead. Default search is DuckDuckGo with AI features off
  (`noai.duckduckgo.com`), and the bookmark bar starts with just GitHub
  and Codeberg (`chromium-bookmarks.json`, seeded into the profile on
  first run only - edit freely afterwards, unlike the policy above).
- **Zed** has no apt package; it's installed at build time from the
  official installer into a fixed system location (not `$HOME`, which is
  a bind mount that would shadow anything baked in there) - `zed` is on
  `PATH` and it has a normal menu entry. Auto-update and the title bar's
  sign-in button are both off by default (`zed-settings.json`, also a
  first-run seed) - a shared box isn't the place for updates changing
  under you or a sign-in prompt greeting you on launch.
- **fish** is the default shell for `dev` (opening a terminal drops you
  into it directly); bash is still there if you want it.
- **Claude Code, git, GitHub CLI (`gh`)** are installed; Claude Code from
  the official installer (same fixed-location treatment as Zed), `gh`
  from its own apt repo (not in Debian). `~/.claude/CLAUDE.md` is seeded
  on first run with context reminding Claude it's running inside this
  container, not on your host - see that file for the details.
- **Docker**, for building/running containers *inside* the box only -
  there's no bind-mounted host `docker.sock`, so it can't see or touch
  anything on your actual host. This needs the whole container to run
  `privileged: true` in `compose.yml`: a fully unprivileged nested Docker
  can pull images but hits a kernel-level wall trying to actually run a
  container (confirmed against upstream Docker/Podman/BuildKit issues,
  not just a missing flag), and there's no fix short of `--privileged` or
  a specialized runtime like Sysbox that has to be installed on the host.
  `dev` can use `docker`/`docker compose` without `sudo` via the `docker`
  group. See `CLAUDE.md` for why this is a scoped trade-off rather than a
  hole to the host.
- **Network lockdown**: the container has its own Docker network
  (`dev-box-net`) and sets its own outbound `iptables`/`ip6tables` rules
  (see `entrypoint.sh`) to reach the public internet but not the rest of
  your LAN - new outbound connections to RFC1918 and link-local ranges
  are dropped. Inbound connections (e.g. another device on your LAN
  opening `https://<host>:8443`) are unaffected - only connections *this
  container* initiates toward local addresses are blocked. This is
  unrelated to the `privileged: true` above (that's about capabilities
  and devices, not network topology) and unaffected by it. Rules are
  reapplied on every start since a fresh container start gets a fresh
  network namespace.
- **Installing packages**: `sudo apt install` only affects the
  container's own writable layer, so it's lost if the container is ever
  *recreated* (an image rebuild, `docker compose up --build`) rather than
  just restarted. Add the package name to `~/.devbox/extra-packages.txt`
  (one per line) to have the entrypoint reinstall it on every boot - see
  `CLAUDE.md`, which tells Claude to do this automatically.
- Audio isn't delivered to the browser tab - the open-source KasmVNC this
  image uses doesn't include Kasm's commercial audio relay. PulseAudio is
  installed so apps don't error trying to play sound, but you won't hear
  anything.
