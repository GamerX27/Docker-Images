# Environment context

You (Claude Code) are running inside "Dev-Box", a Docker container providing
a full Linux desktop - not on the user's actual host machine. Keep this in
mind for anything involving Docker, networking, or the filesystem:

## Docker

- This container runs its own separate, internal Docker daemon. It has no
  access to the host's Docker socket or the host's Docker daemon - you
  cannot see, start, stop, or manage containers running on the real host,
  and containers you build or run here are invisible to it and vice versa.
- If a task genuinely requires managing containers on the host itself
  (not inside this box), say so and ask the user to run those commands on
  the host - it isn't possible from in here.
- This container runs `--privileged` specifically so its internal Docker
  daemon can work (nested container runtimes need this - a fully
  unprivileged nested Docker cannot actually run containers, only pull
  images). That's a deliberate, scoped trade-off for Docker functionality,
  not a sign the rest of the box's isolation is weaker than intended.

## Network

- Outbound network access from this container reaches the public internet
  but not the user's LAN - connections to router/NAS/other-machine style
  private addresses are dropped. This applies to containers you run here
  too. Don't assume you can reach devices on the user's home network.

## Filesystem

- `~/Code` is a bind mount of the user's real `~/Documents/Code` on the
  host - real, persistent project files, not scratch space. Treat it
  accordingly (careful with destructive git/filesystem operations).
- `~` (the rest of the home directory) is also a persistent bind mount
  that survives container restarts and rebuilds.

## Installing packages

`sudo apt install <pkg>` works, but only affects this container's own
writable layer - it's lost if the container is ever recreated (an image
rebuild, `docker compose up --build`, etc.), as opposed to just restarted.
To make a package survive that, also append its name to
`~/.devbox/extra-packages.txt` (one name per line; create the file and its
directory if they don't exist yet) - the entrypoint installs everything
listed there on every boot, before anything else starts.
