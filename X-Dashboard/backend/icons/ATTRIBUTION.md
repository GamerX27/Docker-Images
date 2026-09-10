# Icon attribution

The icons in this folder are fetched at **Docker build time** from
[selfh.st/icons](https://selfh.st/icons)
([github.com/selfhst/icons](https://github.com/selfhst/icons)), a collection of logos and
icons for self-hosted software, licensed under
[CC BY 4.0](https://github.com/selfhst/icons/blob/main/LICENSE). Only this file and
`generate_manifest.py` are committed to this repo — the `.svg` files and `manifest.json`
are downloaded/generated fresh by the `icons` build stage in the project `Dockerfile` and
won't exist here outside a built image.

These icons are the trademarks/logos of their respective projects and companies. They are
not affiliated with, endorsed by, or sponsored by those projects — they're included here
solely so shortcuts to those services can be identified at a glance on your own dashboard.
If a project or trademark holder objects to an icon's inclusion, exclude the corresponding
slug in the `icons` build stage (or delete the `.svg` from a running container's image and
rebuild).

`manifest.json`, once built, lists every bundled icon and the service names/aliases used
to auto-match them.
