# usa nginx templates for the oci-a1 cutover

These files are installed by hand on **usa-vps** (nginx 1.24.0). They keep
Cloudflare, TLS, Basic Auth, `limit_req` and real-ip on usa and only move the
upstreams to oci-a1 over the tailnet.

| File | Installed as | Level |
| --- | --- | --- |
| `jetscope-upstream.conf` | `/etc/nginx/conf.d/jetscope-upstream.conf` | `http` |
| `jetscope-site.conf` | `/etc/nginx/sites-enabled/jetscope` (replace) | `server` |
| `jetscope-maintenance.conf` | `/etc/nginx/snippets/jetscope-maintenance.conf` (only during cutover) | `server` (included) |

`jetscope-site.conf` assumes the existing http block still provides
`limit_req_zone ... zone=saf_req`, `limit_conn_zone ... saf_conn`,
`conf.d/cloudflare-realip.conf`, `log_format main_host` and
`include /etc/nginx/conf.d/*.conf;` before `sites-enabled` (the Ubuntu
default). The maps and upstreams must be parsed before the site file that uses
them. It also references
`/etc/nginx/.htpasswd_jetscope_admin` and the Let's Encrypt live certificates,
unchanged from the current site file.

## Install

```bash
sudo cp /etc/nginx/sites-enabled/jetscope /root/jetscope-site.conf.bak
sudo cp jetscope-upstream.conf /etc/nginx/conf.d/jetscope-upstream.conf
sudo sed -i \
  -e 's/__OCI_IP_RE__/100\\.81\\.227\\.79/' \
  -e 's/__OCI_IP__/100.81.227.79/' \
  /etc/nginx/conf.d/jetscope-upstream.conf
sudo cp jetscope-site.conf /etc/nginx/sites-enabled/jetscope
sudo nginx -t && sudo systemctl reload nginx
```

`__OCI_IP_RE__` is replaced first because it shares no substring with
`__OCI_IP__`; the result is `100\.81\.227\.79`, the dot-escaped form used by
the `map $upstream_addr $jetscope_served_by` regex. Do not leave either
placeholder in the installed file.

## Response header

Every location adds `X-JetScope-Served-By: oci-a1|usa|none`. The value is the
name only, never an IP. `oci-a1` means the request was served by the tailnet
address, `usa` by `127.0.0.1`, and `none` means nginx generated the response
itself (for example the Basic Auth `401` or the maintenance `503`) without
contacting a backend. A `502` after a failed connect records the address nginx
tried, so it can be labelled with that upstream.

During a cutover, copy `jetscope-maintenance.conf` into
`/etc/nginx/snippets/` so non-GET/HEAD/OPTIONS requests get `503` with
`Retry-After: 120`; delete that file to lift the gate. Leaving the snippet
absent is safe because the include is a glob that silently matches nothing.
Adding or removing it takes effect on the next `nginx -t && systemctl reload
nginx`; the site file itself does not change.

## Rollback

```bash
sudo cp /root/jetscope-site.conf.bak /etc/nginx/sites-enabled/jetscope
sudo rm -f /etc/nginx/conf.d/jetscope-upstream.conf \
           /etc/nginx/snippets/jetscope-maintenance.conf
sudo nginx -t && sudo systemctl reload nginx
```

This returns usa to proxying `127.0.0.1:8000` / `127.0.0.1:3000` exactly as the
baseline site file did.
