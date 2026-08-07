# TLS server blocks (operator state)

This directory is mounted read-only into the production nginx container at
`/etc/nginx/tls/`, and `infra/nginx.prod.conf` ends with:

```nginx
include /etc/nginx/tls/*.conf;
```

An empty directory is a working configuration — the site serves over HTTP on
port 80 and nginx starts cleanly. That is deliberate: hard-coding an
`ssl_certificate` path into the repository means nginx refuses to start on any
host that does not have that exact file, which takes the whole site down rather
than serving it.

**Nothing in here is committed except this file.** Certificates and private keys
are host state. Do not add them to the repository.

To enable TLS, put a file such as `jetscope.conf` here on the host:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name your-host.example;

    ssl_certificate     /etc/letsencrypt/live/your-host.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-host.example/privkey.pem;

    # Reuse the proxy rules by duplicating the three locations from
    # infra/nginx.prod.conf: /v1/ first, then /_next/static/, then /.
}

server {
    listen 80;
    server_name your-host.example;
    return 301 https://$host$request_uri;
}
```

The certificate paths also have to be visible inside the container, so mount
whatever directory holds them into the `nginx` service in
`docker-compose.prod.yml` alongside this one.

Order still matters in the 443 block: `/v1/` must be declared before `/`, or the
catch-all swallows API traffic and the browser gets HTML where it expected JSON.
