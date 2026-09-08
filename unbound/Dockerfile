FROM alpine:3.22

# unbound   - the resolver itself (Alpine tracks upstream NLnetLabs releases closely)
# drill     - tiny DNS query tool, used for the HEALTHCHECK
# tzdata    - correct local time in logs
RUN apk add --no-cache unbound drill tzdata

# Ship the default config outside /etc/unbound (which gets bind-mounted from
# the host at runtime, shadowing anything placed inside it at build time) so
# entrypoint.sh can seed it on first run without ever clobbering a config the
# user has already edited on the host.
COPY unbound.conf /etc/unbound.default/unbound.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 53/udp 53/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD drill -p 53 @127.0.0.1 cloudflare.com >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
