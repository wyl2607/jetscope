# TK-003B — nginx-smoke.sh 容器化回归测试

## 改动文件

| 文件 | 说明 |
| --- | --- |
| `scripts/oci-a1/nginx-smoke.sh` | 新增。在任意有 docker 的 Linux 主机上起 nginx 1.24 + 两个假 upstream（oci/usa），按 TK-003 卡片逐项断言 a–g；支持 `--keep`、`--dry-run`、`--help`，`NGINX_IMAGE` 默认 `nginx:1.24`；不连接任何远程主机。 |
| `TK-RESULT.md` | 本报告。 |

没有修改模板、`.governance/**`、`apps/**`、`scripts/release.sh`、`scripts/auto-deploy.sh` 或其他文件；没有 commit / push / 建分支。

## 脚本要点

- `T=$(mktemp -d)`，`trap` 在退出时删容器、网络和临时目录；`--keep` 保留并打印目录/容器/网络名。
- 两个假后端各自独立 nginx 容器，在 8000/3000 返回 `backend=<oci|usa> method=$request_method uri=$request_uri`，与被测 nginx 同一 docker network。
- `conf.d/00-http.conf` 补 usa 的 `log_format main_host`、`saf_req`、`saf_conn` 全局定义。
- 自签 `saf.test` 证书；`openssl dhparam -dsaparam ... 2048`；`options-ssl-nginx.conf` 用空文件；`htpasswd` 用 `openssl passwd -apr1`。
- 模板渲染：`__OCI_IP_RE__` → 转义 IP、`__OCI_IP__` → oci 容器 IP、`127.0.0.1:{8000,3000}` → usa 容器 IP；site 渲染为 `server_name saf.test` 并替换证书/htpasswd/snippet 路径（access_log 改到 stdout，避免容器内日志目录权限问题）。
- 请求全部从同网络的 `curlimages/curl` 容器发出：`--resolve saf.test:443:<nginx IP> -k`；头部匹配大小写不敏感（HTTP/2 下 nginx 输出小写头）。
- 断言：a 路径/query、b web 到 oci + served-by、c POST 到 oci、d `/admin` 401/200、e oci 停机后读走 usa、写 502、f 恢复冷却最多 40s + 维护片段 503/Retry-After + 读 200、g 多点 `nginx -t`。
- oci 重启后若容器 IP 变化，会重新渲染 upstream 并 `nginx -t` + reload。
- 脚本不发任何 SSH/HTTP 请求到 oci-a1 / usa-vps，所以没有 `OCI` / `USA` / tailnet `OCI_IP` 远程主机变量；脚本里的 `OCI_IP` 是假后端容器的 docker IP，仅用于本次测试渲染。

## 验证命令与结果（本机 macOS，无 docker）

```text
$ bash -n scripts/oci-a1/nginx-smoke.sh
bash -n rc=0
（无输出）

$ shellcheck -S warning scripts/oci-a1/nginx-smoke.sh
shellcheck rc=0
（无输出）

$ shellcheck scripts/oci-a1/nginx-smoke.sh
shellcheck(default) rc=0
（无输出）

$ bash scripts/oci-a1/nginx-smoke.sh --dry-run
==> DRY-RUN: no docker, no network, no remote hosts
would: read templates from /Users/yumei/fleet/jr-oci-rev/TK-003B/infra/server/oci-a1/nginx
would: use nginx:1.24 for the edge and for the oci/usa fake backends
would: create a private docker network and pull/run curlimages/curl as the client
would: generate a self-signed cert for saf.test, a 2048-bit dhparam and an apr1 htpasswd
would: render jetscope-upstream.conf with the backend container IPs and
would: render jetscope-site.conf with saf.test, test cert/htpasswd/snippet paths
would: assert a-g over https://saf.test with --resolve inside the docker network
would: remove the containers, the network and the temp dir (kept with --keep)
rc=0

$ bash scripts/oci-a1/nginx-smoke.sh --help | sed -n '1,8p'
# Containerized regression test for the JetScope usa nginx templates.
#
# It runs nginx 1.24 in docker together with two fake upstreams (oci, usa) on
# one private docker network and asserts the behaviour the cutover relies on:
# path/query preservation, read failover, writes never failing over, Basic Auth
# on /admin, the maintenance gate and X-JetScope-Served-By. It never connects
# to oci-a1 or usa-vps; docker on the local host is the only requirement.
```

`--bogus` 返回 rc=1 并打印 `Unknown option: --bogus`。

**未在本机执行真实容器测试**：此 macOS 主机没有 docker（`command -v docker` 无输出），符合 Brief 的「本地只做静态检查」。真实运行由人类在 oci-a1（arm64，docker 组）执行：

```bash
bash scripts/oci-a1/nginx-smoke.sh
```

## 与 TK-003 Done criteria 逐条对照

| Done criteria | 状态 |
| --- | --- |
| `jetscope-upstream.conf`：4 个 upstream + `map $request_method` + `map $upstream_addr $jetscope_served_by` | 模板由 TK-003A 交付，本 lane 未改；smoke 渲染并实际使用 4 个 upstream 与 served-by 断言。 |
| `jetscope-site.conf`：`proxy_pass` 不带 URI、`/admin` 走 `_rw`、`add_header X-JetScope-Served-By` | 模板由 TK-003A 交付；smoke 断言 a 路径/query 保留、d/e `/admin` 走 `_rw`、b/e served-by 值。 |
| `jetscope-maintenance.conf`：非 GET/HEAD/OPTIONS 返回 503（带 `Retry-After`） | 模板由 TK-003A 交付；smoke f 断言 503 + `Retry-After`。 |
| `nginx-smoke.sh`：本地 docker 起 nginx（版本与 usa 一致），两个假 upstream，逐项断言 | 脚本已交付（nginx:1.24、oci/usa 假后端、a–g 全部覆盖）；`bash -n` / `shellcheck` 通过。**真实 docker 运行待人类在 oci-a1 执行**。 |
| `nginx -t` 通过 | 脚本在渲染后、edge 启动后、oci 停机期间、维护片段安装后、维护生效后共 5 处执行 `nginx -t` 并计入 PASS/FAIL；本机无法执行 nginx，待真实运行确认。 |

## 已知遗留风险

1. **未在本机跑过真实容器**：本机无 docker，只有静态检查和 `--dry-run`。首次在 oci-a1 运行可能暴露环境差异（镜像拉取、arm64、Docker entrypoint、容器 IP 分配）。
2. **停机后的状态码**：脚本按 Brief 断言 `502`。若某主机上停止容器的 IP 表现为连接超时而非拒绝，nginx 可能返回 `504`，此时 e 会 FAIL —— 这是需要人类关注的真实差异，不是脚本误报。
3. **`Retry-After` 于 server 级 503**：依赖 nginx 在 server 上下文 `return 503` 时应用 server 级 `add_header ... always`（现行维护片段写法）。若真实运行缺失该头，说明模板需要调整。
4. **重启后容器 IP**：已处理 IP 变化（重渲染 + reload）；若 Docker 在 `docker start` 返回后仍未分配 IP，极端情况下会继续用旧 IP，健康轮询会暴露为 f FAIL。
5. **`curlimages/curl` 未固定 tag**：使用 latest；上游变更可能影响测试，如需可后续改为固定 digest。
6. **权限/rootless**：已显式 `chmod 755 "$T"`、`chmod 644 htpasswd` 以适配 nginx worker；rootless/userns 或特殊 umask 环境未实测。
7. **测试耗时**：停机期间若 Docker 网络对旧容器 IP 走 ARP 超时，e/f 可能比预期慢（每请求数秒），不影响断言正确性。
