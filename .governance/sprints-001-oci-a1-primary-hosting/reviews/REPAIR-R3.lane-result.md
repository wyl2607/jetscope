# TK-RESULT — Sprint 001 Round 3（Repairer）：CR-003 F1–F7

- created_at: 2026-10-22
- scope: CR-003 的 F1–F7；只改工作区，未 commit/push，未连接任何远程主机。

## 改动文件

| 文件 | 一句话说明 |
| --- | --- |
| `infra/server/oci-a1/nginx/jetscope-upstream.conf` | 4 个 upstream 加 `keepalive_timeout 4s;`；served-by map 改为 `default none` 并补 `127.0.0.1` → `usa`。 |
| `infra/server/oci-a1/nginx/jetscope-site.conf` | 4 个 proxy 到 upstream 的 location 统一 `proxy_connect_timeout 3s;`（`/_next/static/` 为新增）。 |
| `infra/server/oci-a1/nginx/README.md` | 新增 `X-JetScope-Served-By` 的说明（`oci-a1` / `usa` / `none`，只含名字不含 IP）。 |
| `scripts/oci-a1/nginx-smoke.sh` | 补 `/en/admin`、`/de/admin/x` 的 401；补 b/d/e/f 的 HSTS 断言；固定 curl 镜像；渲染 usa 的 served-by 正则；写明 token 鉴权由代码审查保证。 |
| `apps/web/next.config.mjs` | 加 `generateBuildId: async () => process.env.JETSCOPE_BUILD_SHA \|\| null` 及原因注释。 |
| `TK-RESULT.md` | 本报告（新增）。 |

## 逐条对照

### 1. F1 — upstream keepalive_timeout

`jetscope-upstream.conf` 的 4 个 upstream（`jetscope_api`、`jetscope_web`、`jetscope_api_rw`、`jetscope_web_rw`）都在 `keepalive 8;` 后加了 `keepalive_timeout 4s;`。文件头注明 4s 低于 uvicorn/Node 的 5s 空闲超时，且 upstream 块的该指令需要 nginx ≥ 1.15.3（usa 为 1.24）。

验证（要求必须为 4）：

```text
$ grep -c "keepalive_timeout 4s" infra/server/oci-a1/nginx/jetscope-upstream.conf
4
```

### 2. F2 — proxy_connect_timeout 3s

`jetscope-site.conf` 中 4 个 `proxy_pass` 到 upstream 的 location 全部为 3s；`proxy_send_timeout` / `proxy_read_timeout` 未动：

```text
$ grep -n "proxy_connect_timeout" infra/server/oci-a1/nginx/jetscope-site.conf
43:        proxy_connect_timeout 3s;   # /v1/
66:        proxy_connect_timeout 3s;   # ^/(en/|de/)?admin(/|$)
86:        proxy_connect_timeout 3s;   # /_next/static/（新增；此前是默认 60s）
106:        proxy_connect_timeout 3s;   # /
```

### 3. F3 — served-by map

`jetscope-upstream.conf` 现在是：

```nginx
map $upstream_addr $jetscope_served_by {
    default none;
    "~__OCI_IP_RE__:[0-9]+$" oci-a1;
    "~127\.0\.0\.1:[0-9]+$" usa;
}
```

README 新增「Response header」段：`X-JetScope-Served-By: oci-a1|usa|none`，只输出名字；`none` 表示响应由 nginx 自己生成、未接触后端。

```text
$ grep -n "map \$upstream_addr" -A4 infra/server/oci-a1/nginx/jetscope-upstream.conf
57:map $upstream_addr $jetscope_served_by {
58-    default none;
59-    "~__OCI_IP_RE__:[0-9]+$" oci-a1;
60-    "~127\.0\.0\.1:[0-9]+$" usa;
61-}
```

### 4. F4 — admin 路径与 token 说明

smoke 的 d 组新增：

```text
request "/en/admin"    -> 401
request "/de/admin/x"  -> 401
```

脚本头部新增说明：API 写端点的 token 鉴权（401/403）不由本测试验证（后端是假的），由代码审查保证 —— `apps/api` 的写路由都 `Depends(require_admin_token)`，见 RFC 写入口表。

### 5. F5 — HSTS 断言

按要求在以下位置加了 `Strict-Transport-Security` 断言：

- b：`GET /sources` 的 200；
- d：`GET /admin` 的 401；
- e：oci 停止后 usa 回退的 200，以及写请求的 502（`POST /v1/scenarios`、`PUT /api/pathways`）；
- f：维护片段打开的 503。

没有为了让断言通过而修改模板。静态判断依据：相关 location 的 `add_header ... always` 覆盖 401/502；维护 503 在 server 重写阶段返回，server 级 `add_header ... always` 生效（maintenance 片段本身也在 server 级）。

**未能本地实跑 docker 冒烟**（本机没有 docker），所以这一条的最终确认仍以有 docker 的主机执行 `bash scripts/oci-a1/nginx-smoke.sh` 为准。若实跑发现某种 nginx 自生成错误响应确实没有该头，应如实记录，不要改模板凑断言。

### 6. F6 — generateBuildId

`apps/web/next.config.mjs` 增加：

```js
// oci-a1 and usa build separately; the same commit must produce the same
// buildId so /_next/static assets still match after a failover. Returning
// null falls back to Next's default random id when the SHA is not set.
generateBuildId: async () => process.env.JETSCOPE_BUILD_SHA \|\| null,
```

`JETSCOPE_BUILD_SHA` 已在构建时由部署脚本注入；未设置时返回 `null`，Next 使用默认随机 id。

```text
$ node -e "import('./apps/web/next.config.mjs').then(m=>m.default.generateBuildId()).then(v=>console.log('buildId=',v))"
buildId= null

$ JETSCOPE_BUILD_SHA=abc123 node -e "import('./apps/web/next.config.mjs').then(m=>m.default.generateBuildId()).then(v=>console.log('buildId=',v))"
buildId= abc123
```

### 7. F7 — 固定 curl 镜像

```bash
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.11.1}"
```

脚本头部的 Environment 段同步登记。`8.11.1` 是 curlimages/curl 的正式发布 tag；因本机没有 docker，未实际 pull 验证。

### 8. F8 — 自生成响应的 served-by

核对了 smoke：原有断言只在 b（`/sources` 200）和 e（usa 回退 200）检查 `X-JetScope-Served-By`；401、502、503 没有 served-by 断言，因此无需把期望改成 `none`，本轮也没有新增这类断言。

需要记录的语义细节：401 和维护 503 没有接触后端，`$upstream_addr` 为空，新 map 下会是 `none`；而连接失败产生的 502，nginx 会记下尝试过的 upstream 地址，因此可能标成 `oci-a1`（或 `usa`），不一定是 `none`。README 已按此写明。若后续要对 502 断言 served-by，应先实测再定期望值。

## 验证命令与原始输出

```text
$ bash -n scripts/oci-a1/nginx-smoke.sh && shellcheck -S warning scripts/oci-a1/nginx-smoke.sh
(no output from bash -n / shellcheck; exit 0)

$ grep -c "keepalive_timeout 4s" infra/server/oci-a1/nginx/jetscope-upstream.conf
4

$ grep -n "proxy_connect_timeout" infra/server/oci-a1/nginx/jetscope-site.conf
43:        proxy_connect_timeout 3s;
66:        proxy_connect_timeout 3s;
86:        proxy_connect_timeout 3s;
106:        proxy_connect_timeout 3s;

$ node -e "import('./apps/web/next.config.mjs').then(m=>m.default.generateBuildId()).then(v=>console.log('buildId=',v))"
buildId= null

$ JETSCOPE_BUILD_SHA=abc123 node -e "import('./apps/web/next.config.mjs').then(m=>m.default.generateBuildId()).then(v=>console.log('buildId=',v))"
buildId= abc123

$ grep -nE "(^|[^a-z])(ssh|scp|rsync)([^a-z]|$)" scripts/oci-a1/nginx-smoke.sh
(no ssh/scp/rsync)
```

额外做了 `--dry-run`（不启动 docker、不联网）：

```text
$ bash scripts/oci-a1/nginx-smoke.sh --dry-run
==> DRY-RUN: no docker, no network, no remote hosts
would: read templates from /Users/yumei/fleet/jr-oci-rev/REPAIR-R3/infra/server/oci-a1/nginx
would: use nginx:1.24 for the edge and for the oci/usa fake backends
would: create a private docker network and pull/run curlimages/curl:8.11.1 as the client
would: generate a self-signed cert for saf.test, a 2048-bit dhparam and an apr1 htpasswd
would: render jetscope-upstream.conf with the backend container IPs and
would: render jetscope-site.conf with saf.test, test cert/htpasswd/snippet paths
would: assert a-g over https://saf.test with --resolve inside the docker network
would: remove the containers, the network and the temp dir (kept with --keep)
```

模板渲染的静态检查（把假 upstream IP 代入后，map 中的 usa 正则也一起替换）：

```text
map $upstream_addr $jetscope_served_by {
    default none;
    "~172\.18\.0\.4:[0-9]+$" oci-a1;
    "~172\.18\.0\.5:[0-9]+$" usa;
}
```

## 与 TK Done criteria 的逐条对照

| CR-003 编号 | 状态 | 证据 |
| --- | --- | --- |
| F1 | done | 4 处 `keepalive_timeout 4s;`，`grep -c` = 4 |
| F2 | done | 4 个 location 的 `proxy_connect_timeout 3s;` |
| F3 | done | map `default none` + `127\.0\.0\.1` → `usa`；README 已说明 |
| F4 | done | `/en/admin`、`/de/admin/x` 401 断言；头部 token 说明 |
| F5 | done（待实跑） | b/d/e/f 加 HSTS 断言；本地无 docker，静态检查通过 |
| F6 | done | `generateBuildId` 存在；null / abc123 两项输出正确 |
| F7 | done | `CURL_IMAGE` 默认 `curlimages/curl:8.11.1` |
| F8 | done | 核对后 401/502/503 无既有 served-by 断言；语义已写入 README |

## 已知遗留风险

1. **未实跑容器冒烟**：本机没有 docker，只做了 `bash -n`、`shellcheck`、`--dry-run` 和渲染静态检查。HSTS 对 401/502/503 的实际表现、以及 usa 回退时 `Served-By: usa`，需要在有 docker 的机器上跑一次 `bash scripts/oci-a1/nginx-smoke.sh` 最终确认。
2. **502 的 served-by 语义**：如上所述，连接失败的 502 可能带上尝试过的 upstream 标签，而非 `none`。本轮没有对 502 断言 served-by，避免写死不确定的期望。
3. **curl tag**：`curlimages/curl:8.11.1` 是正式 tag，但未在本机 pull 验证；首次实跑会拉取该镜像。
4. **nginx -t**：本机无 nginx/docker，未重新执行 `nginx -t`；新增指令在 usa 的 nginx 1.24 上语法有效（`keepalive_timeout` upstream 版要求 ≥ 1.15.3）。
