#!/bin/sh
set -eu

CONF_DIR="/etc/unbound"
CONF_FILE="$CONF_DIR/unbound.conf"
ANCHOR_FILE="$CONF_DIR/root.key"

# First run against a fresh (empty) ./config volume: seed it with the image's
# default config so the container comes up working out of the box. Never
# overwrites a config the user already has in the mounted volume.
if [ ! -f "$CONF_FILE" ]; then
    echo "[entrypoint] no unbound.conf in $CONF_DIR, seeding default"
    cp /etc/unbound.default/unbound.conf "$CONF_FILE"
fi

mkdir -p "$CONF_DIR/unbound.conf.d"

# Bootstrap (and thereafter let unbound RFC5011 auto-update) the DNSSEC trust
# anchor into the persistent volume, so it survives container recreation.
if [ ! -s "$ANCHOR_FILE" ]; then
    echo "[entrypoint] bootstrapping DNSSEC trust anchor at $ANCHOR_FILE"
    unbound-anchor -a "$ANCHOR_FILE" || true
fi

# The volume may be freshly created by Docker as root:root; unbound.conf sets
# "username: unbound" so the daemon drops privileges after binding port 53,
# and it needs write access here to persist trust-anchor updates.
chown -R unbound:unbound "$CONF_DIR"

echo "[entrypoint] checking configuration"
unbound-checkconf "$CONF_FILE"

echo "[entrypoint] starting unbound"
exec unbound -d -c "$CONF_FILE"
