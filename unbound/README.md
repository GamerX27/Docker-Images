# unbound

Alpine-based build of [unbound](https://nlnetlabs.nl/projects/unbound/about/), a validating, recursive, caching DNS resolver.

Published to `ghcr.io/gamerx27/unbound:latest` via [.github/workflows/unbound-image.yml](../.github/workflows/unbound-image.yml), rebuilt weekly to pick up Alpine security patches.

## Usage

```bash
docker compose up -d
```

`unbound.conf` is seeded into `./config` on first run (see `entrypoint.sh`) without clobbering an existing host config on later runs.
