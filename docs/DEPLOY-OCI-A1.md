# JetScope 部署：oci-a1 主站（usa 热备）

本文记录 oci-a1 作为 JetScope 主站、usa-vps 作为热备的拓扑、首次上线顺序、回切、日常发布、备份与告警。所有远程变更都由人执行；脚本只在本机计算，然后通过 SSH 操作两台主机。

## 拓扑

```text
Cloudflare
  -> usa-vps nginx :443（TLS、Basic Auth、limit_req、real-ip，均不变）
     -> tailnet（明文 HTTP，WireGuard 加密）
        -> oci-a1 100.81.227.79:8000  API 容器
        -> oci-a1 100.81.227.79:3000  Next.js（systemd jetscope-web.service）
```

- DNS 不变，公网入口仍是 usa-vps 的 nginx；oci-a1 不开公网端口，也没有主机 nginx。
- oci-a1 的 API 容器通过 `/opt/jetscope/.env` 里的 `JETSCOPE_API_BIND=100.81.227.79` 只绑定 tailnet 地址；web 由 `jetscope-web.service` 以 `--hostname 100.81.227.79 --port 3000` 启动。
- 读请求：GET、HEAD、OPTIONS 走 `jetscope_api` / `jetscope_web`，oci-a1 是主 upstream，`127.0.0.1` 是 backup。oci-a1 不可用时 nginx 把读请求转到 usa 热备。
- 写请求：非 GET、HEAD、OPTIONS 的方法走 `jetscope_api_rw` / `jetscope_web_rw`，只有 oci-a1。oci-a1 不可用时返回 502。
- `/admin`（包括 `/en/admin`、`/de/admin` 及其子路径）一律走 `jetscope_web_rw`，只有 oci-a1；不可用时返回 502。Basic Auth 在 usa nginx 上执行。
- 响应头 `X-JetScope-Served-By` 只包含名字：`oci-a1` 表示由 tailnet 地址服务，`usa` 表示由 `127.0.0.1` 服务，`none` 表示响应由 nginx 自己生成（例如 Basic Auth 的 401、维护闸的 503），没有联系后端。

## 写入口契约

写请求的完整清单来自 RFC，已冻结：

| web 路由（`apps/web/app/api/…/route.ts`） | 方法 |
| --- | --- |
| `scenarios` | POST |
| `scenarios/[scenarioId]` | PUT、DELETE |
| `policies/refuel-eu` | PUT |
| `pathways` | PUT |
| `market/refresh` | POST |
| `research/refresh` | POST |

以后新增写路由，必须使用非 GET 方法。这是本拓扑的契约：GET、HEAD、OPTIONS 会在 oci-a1 不可用时回退到 usa，非 GET 方法不会回退，因此拿 GET 做写入会在 failover 时把数据写进 usa 的库。切换和回切期间的非 GET 请求由维护片段统一返回 503（带 `Retry-After: 120`）。

## 首次上线（按顺序）

以下命令都在本机 JetScope 仓库根目录执行。`--dry-run` 不打开 SSH、不访问网络，只打印计划。首次上线前先确认 `ssh oci-a1-ts` 和 `ssh usa-vps` 可用。

### 1. 准备 oci-a1

先看计划：

```bash
bash scripts/oci-a1/bootstrap.sh --dry-run
```

再去掉 `--dry-run` 执行：

```bash
bash scripts/oci-a1/bootstrap.sh
```

做什么：只读预检（免密 sudo、`tailscale serve status` 和 `funnel status` 必须是未配置、`/` 至少 5 GiB、docker daemon 可达）；创建 `/opt/jetscope` 和 `/opt/jetscope/data`（`ubuntu:ubuntu 750`）；从 Node 官方 linux-arm64 tarball 安装 v22.23.4 到 `/opt/node-22`，先用 nodejs/release-keys 的公钥校验 `SHASUMS256.txt.sig` 的签名者指纹，再校验 tarball 的 sha256；缺少 `sqlite3` 时安装。系统 apt 的 Node 不动。

验证：输出里预检各项都是 `ok:`，最后 summary 打印 `/opt/node-22/bin/node` 的版本 v22.23.4、两个目录的 `ubuntu:ubuntu 750`，以及 serve/funnel 仍未配置。

失败怎么办：任何预检失败都会在改动前中止并打印 `ABORT:`。serve/funnel 已配置时先在 Tailscale 关闭再重跑。下载或签名校验失败时重跑即可；旧 Node 树会保留在 `/opt/node-22.prev`，脚本不会自动切回。

### 2. 写入配置和数据库快照

先看计划（包含令牌轮换）：

```bash
bash scripts/oci-a1/seed.sh --dry-run --rotate-admin-token
```

再执行：

```bash
bash scripts/oci-a1/seed.sh --rotate-admin-token
```

做什么：把 usa 的 `/opt/jetscope/.env` 和 `apps/api/.env.api-keys` 改成 600（属主不变）；把两个文件流式复制到 oci-a1 的同一路径（600），并在 oci 的 `.env` 里写入 `JETSCOPE_API_BIND=100.81.227.79`；在 oci-a1 用 `openssl rand -hex 32` 生成新的 `JETSCOPE_ADMIN_TOKEN`，原子替换两台机器 `.env` 里的同名变量，只比较长度和 sha256 前 8 位，不打印令牌值；对 usa 的 `market.db` 做在线 `.backup`，流到 oci-a1，跑 `PRAGMA integrity_check` 并逐表比较行数，通过后才安装为 `/opt/jetscope/data/market.db`；最后只列出第三方 key 的变量名。

usa 的 API 需要重启才会读到新令牌。脚本会打印这条命令：

```bash
ssh usa-vps 'cd /opt/jetscope && docker-compose -f docker-compose.prod.yml up -d api'
```

oci-a1 的 API 在第一次部署时读取新令牌。

验证：输出包含两台的 `token length` 和相同的 `sha256=` 前缀、`PRAGMA integrity_check: ok`、`row counts match`，以及 `ok: /opt/jetscope/data/market.db ... ubuntu:ubuntu 640`。

失败怎么办：预检失败时不会改动任何东西。行数或完整性不一致会中止，oci 上已有的库不会被替换。oci 上已有非空 `market.db` 时脚本会拒绝覆盖，确认要替换后加 `--force-db`；旧库会保留为 `market.db.pre-seed-<UTC 时间戳>`。令牌轮换一旦完成就不能恢复旧值，需要更新所有持有旧令牌的客户端；如果 oci 已经写入新令牌、但写 usa 时失败，两台令牌会不一致，重新执行一次带 `--rotate-admin-token` 的 `seed.sh` 让两台对齐。

### 3. 安装 systemd 单元和告警钩子

先看计划：

```bash
bash scripts/oci-a1/install-units.sh --dry-run
```

再执行：

```bash
bash scripts/oci-a1/install-units.sh
```

做什么：预检 `/opt/jetscope` 和 `/opt/node-22/bin/node`；`/usr/local/bin/oci-tg-alert` 缺失只警告。把 `infra/server/oci-a1/systemd/*.{service,timer}`（包括 `jetscope-alert@.service`）和告警钩子暂存到 oci-a1，`systemd-analyze verify` 后在内容不同时才安装，然后 `daemon-reload`；启用 `jetscope-sqlite-backup.timer`；只有 `jetscope-web.service` 已经 active 时才启用 `jetscope-health-check.timer`。

第一次运行有两条预期信息：`warn: jetscope-web.service not verified (next not deployed yet)`（`/opt/jetscope/node_modules/.bin/next` 还不存在，跳过 web 单元的 verify，但照样安装）和 `note: jetscope-health-check.timer not enabled yet`（web 还没部署，避免先发一次故障告警）。`jetscope-web.service` 只安装，不启用、不启动。

注意：backup timer 在这里已经启用，但它的 `ExecStart` 指向 `/opt/jetscope/scripts/backup-sqlite.sh`，该文件要等第 4 步 rsync 之后才存在。第一次安装后应尽快完成第 4 步；不要在 01:10 UTC 之前停在这一步过夜，否则备份单元会失败并触发告警。

验证：结尾的 status 列表里 backup timer 是 `enabled=... active=...`，health-check timer 尚未启用，web 单元已安装但未启动。

失败怎么办：`systemd-analyze verify` 失败时不会安装任何单元，修好单元文件后重跑。脚本没有远程回退动作；需要撤销时手动删除 `/etc/systemd/system` 下对应的 JetScope 单元和 `/usr/local/bin/jetscope-health-alert-on-change`，再 `systemctl daemon-reload`。

### 4. 首次部署到 oci-a1

分支还没合并到 `main` 时：

```bash
bash scripts/deploy-oci-a1.sh --rebuild --allow-unmerged
```

分支已经合并到 `main` 后不要加 `--allow-unmerged`：

```bash
bash scripts/deploy-oci-a1.sh --rebuild
```

做什么：`deploy-oci-a1.sh` 是薄封装，把目标设为 `oci-a1-ts`、Node 路径 `/opt/node-22/bin`、冒烟地址 `100.81.227.79`，并关闭 usa 的主机 nginx 探测，然后调用 `deploy-usa-vps.sh`。部署要求工作树干净，提交在 `origin/main` 上（`--allow-unmerged` 才跳过这一检查）；rsync 排除 `.env` 和数据库文件；记录 `.deploy-commit`；先构建 API 镜像再替换容器；宿主目录已有非空 `market.db` 时绝不覆盖；因为冒烟地址不是 `127.0.0.1`，会先确认 `.env` 里有 `JETSCOPE_API_BIND=100.81.227.79`；然后 `npm run web:build`（带 `JETSCOPE_BUILD_SHA`）并 `systemctl restart jetscope-web.service`；最后对 `100.81.227.79:8000` 和 `:3000` 做冒烟。

部署脚本的 web 重建段只要求 `jetscope-web.service` 已经安装，不要求已经 enable；`systemctl restart` 会启动这个单元。部署末尾的冒烟要求 `:3000` 可响应，所以第 4 步结束时 web 已经在运行。

验证：输出有 `jetscope-web.service active`、`OK /sources direct :3000 — renders a real as-of stamp, server-side API reachable`，API 健康检查通过，`/opt/jetscope/.deploy-commit` 等于本次提交。

失败怎么办：构建失败时旧容器继续服务，web 重启只发生在构建成功之后。冒烟失败时按输出检查 API 健康、`JETSCOPE_API_BASE_URL` 和 `jetscope-web.service` 日志；修好后重跑。部署脚本没有自动回退，需要回到上一个已合并提交重新部署。

### 5. 让 web 开机自启

```bash
ssh oci-a1-ts 'sudo systemctl enable --now jetscope-web.service'
```

这一步只是设为开机自启；web 进程在第 4 步已经被部署脚本启动。在已加入 tailnet 的机器上确认页面有真实的 as-of 时间戳：

```bash
curl -fsS http://100.81.227.79:3000/sources | grep -c 'data-testid="page-as-of"'
```

验证：输出 `1` 表示标记存在，说明服务端取数到了 API；输出 `0` 或 curl 失败说明 web 或 API 不可达。

失败怎么办：看 `ssh oci-a1-ts 'sudo journalctl -u jetscope-web.service -n 50 --no-pager'` 的报错；确认 `/opt/node-22/bin/node` 存在、`/opt/jetscope/node_modules/.bin/next` 存在、`.env` 里 `JETSCOPE_API_BIND` 正确。

### 6. 再运行一次 install-units

```bash
bash scripts/oci-a1/install-units.sh
```

做什么：这次 `next` 已经存在，会正常 verify `jetscope-web.service`；因为 web 已经 active，会启用 `jetscope-health-check.timer`。backup timer 保持启用。

验证：status 列表里两个 timer 都是 enabled/active，`jetscope-web.service` 是 enabled/active。

失败怎么办：web 不是 active 时 health-check timer 仍然不会启用；先修好 web 再重跑。要撤销 health-check timer 用 `sudo systemctl disable --now jetscope-health-check.timer`。

### 7. 切换到 oci-a1

先看切换计划：

```bash
bash scripts/oci-a1/cutover.sh --dry-run
```

再执行：

```bash
bash scripts/oci-a1/cutover.sh
```

做什么：预检两台主机、oci 的 `/v1/health`、`/sources` 的 `data-testid="page-as-of"` 标记、serve/funnel 为空、`.env` 有 `JETSCOPE_API_BIND`、usa 的 `nginx -t`、usa 能到 oci，以及 usa 还没有切过；备份 usa nginx 到 `/root/nginx-backup-jetscope-<UTC 时间戳>` 并写 sha256 manifest；打开维护闸（非 GET/HEAD/OPTIONS 返回 503，读请求继续）；做最后一次 usa 到 oci 的数据库同步（在线 `.backup`、完整性检查、逐表行数、停 oci API、旧库保留为 `market.db.pre-cutover-<时间戳>`、换库、启动、最多等 60 秒健康检查）；安装 upstream 和站点模板，原子切换 sites-enabled 符号链接，`nginx -t` 失败时立刻恢复维护站点；移除维护片段；从本机做公网冒烟。每个阶段写在 usa 的 `/var/lib/jetscope-cutover/<UTC 时间戳>/{phases.log,manifest}`。

验证：输出 `cutover complete`；公网 `/v1/health` 返回 200 且 `X-JetScope-Served-By` 含 `oci-a1`；`/sources` 有 `data-testid="page-as-of"`；`/admin` 无凭据返回 401。

失败怎么办：脚本在任何阶段失败都会停下，打印当前状态、恢复命令和日志路径，不会自动回退（`nginx -t` 失败是唯一的就地恢复）。当前版本不接受 `--resume-smoke`；如果已经切到 oci-a1 后公网冒烟失败，重跑 `cutover.sh` 会被预检拒绝，需要先按失败输出的 recovery 处理，或者执行回切后重来。

## 回切到 usa

先看回切计划：

```bash
bash scripts/oci-a1/cutover.sh --rollback --dry-run
```

再执行：

```bash
bash scripts/oci-a1/cutover.sh --rollback
```

做什么：预检 usa 的原始站点文件存在、`nginx -t` 通过、sites-enabled 当前指向 `jetscope.oci-a1`；打开维护闸（写请求 503，读请求继续从 oci 服务）；用 `docker-compose` 停止 usa 的 API（它此时只是热备）；在 oci 上对 `market.db` 做在线 `.backup`，流回 usa，做完整性检查和逐表行数比较，把 usa 旧库保留为 `market.db.pre-rollback-<时间戳>`，换库后启动 usa API 并最多等 60 秒健康检查；把 sites-enabled 符号链接切回原始站点；只有在 `nginx -t` 仍然通过后才删除 `conf.d/jetscope-upstream.conf`；移除维护片段；最后公网冒烟要求 `/v1/health` 200，且 `X-JetScope-Served-By` 缺失或为 `usa`（绝不能是 `oci-a1`）。

数据同步方向是 oci-a1 到 usa：回切会把切换后写入 oci 的用户数据（scenarios 等）完整带回 usa，旧 usa 库另存不删。失败时脚本同样停下并打印恢复命令，usa 和 oci 的旧库都保留。

## 日常发布

主站先发，热备后发：

```bash
bash scripts/deploy-oci-a1.sh --rebuild
```

等 oci-a1 的部署和冒烟通过后，再更新 usa 热备：

```bash
bash scripts/deploy-usa-vps.sh --rebuild
```

两边都要求工作树干净、提交在 `origin/main` 上；分支还没合并时两边都要加 `--allow-unmerged`。两台机器必须部署同一个提交：部署脚本把提交号作为 `JETSCOPE_BUILD_SHA` 传给 `next build`，`apps/web/next.config.mjs` 的 `generateBuildId` 读取它，因此相同提交生成相同 buildId，failover 时 `/_next/static` 的资源仍然匹配。

## 备份与告警

- `jetscope-sqlite-backup.timer` 每天 01:10 UTC 触发（`RandomizedDelaySec=5min`，最晚约 01:15 UTC），运行 `scripts/backup-sqlite.sh`，默认保留 14 份，文件在 `/opt/jetscope/data/backups`。单元失败时通过 `OnFailure=jetscope-alert@%n.service` 调用 `/usr/local/bin/oci-tg-alert` 发 Telegram。
- 仓库外的 `~/oci-a1-deploy/oci-backup.sh`（oci-a1 上安装为 `/usr/local/bin/oci-backup.sh`）在 01:41 UTC 取 `/opt/jetscope/data/backups` 下最新的 `market-*.db.gz`，用 `gzip -t` 校验后以 600 放进每日快照，不复制 `.env`；快照由 coco 拉取。
- `jetscope-health-check.timer` 每分钟运行一次 `infra/server/health-check.sh`（`JETSCOPE_HEALTH_ALLOW_RESTART=0`），通过 `jetscope-health-alert-on-change` 只在状态变化时调用 `oci-tg-alert`，不会每分钟重复告警。

查看两个 timer 的下次运行时间：

```bash
ssh oci-a1-ts 'systemctl list-timers --all --no-pager | grep jetscope'
```

查看最近的本地备份：

```bash
ssh oci-a1-ts 'ls -lt /opt/jetscope/data/backups | head'
```

## 建议（需要用户手动完成）

- 在 Tailscale ACL 里只允许 usa 节点访问 oci-a1 的 3000 和 8000 端口；其他 tailnet 节点不需要访问这两个端口。
- oci-a1 不要开启 `tailscale serve` 或 `tailscale funnel`；`bootstrap.sh` 和 `cutover.sh` 的预检会在发现它们已配置时中止。
- `OPENAQ`、`ECMWF`、`QUANDL` 等第三方 key 建议到服务商处轮换。`seed.sh` 只列出变量名，不读值，也不阻塞切换。

## 停 usa 热备的判定指标

观察期结束后，只有同时满足以下条件才考虑停掉 usa 热备（不在本 Sprint 执行）：

1. 连续 7 天 failover 事件为 0。
2. oci-a1 的每日备份 7/7 成功，且 coco 拉取成功。
3. 公网 5xx 比例不高于切换前。
4. `deploy-oci-a1.sh` 至少完成过一次正常发布。

## nginx 回归测试

在有 docker 的主机上运行（不需要也不连接 oci-a1 或 usa-vps）：

```bash
bash scripts/oci-a1/nginx-smoke.sh
```

脚本用 `nginx:1.24` 和两个假 upstream 在私有 docker 网络里启动边缘，覆盖这些断言：

- a：GET `/v1/health?x=1` 保留路径和 query，并到达 oci。
- b：GET `/sources` 到达 oci web，响应头 `X-JetScope-Served-By: oci-a1`，带 HSTS。
- c：POST `/v1/scenarios` 到达 oci API。
- d：`/admin`、`/en/admin`、`/de/admin/x` 无凭据都是 401，带 HSTS；带正确 Basic Auth 后到达 oci。
- e：停掉 oci 后读请求回退到 usa（`X-JetScope-Served-By: usa`），POST/PUT 和 `/admin` 返回 502，且仍有 HSTS。
- f：oci 恢复后读请求回到 oci；安装维护片段后写请求返回 503 且带 `Retry-After`，读请求仍为 200。
- g：渲染后的配置和运行中的边缘都通过 `nginx -t`。

API 写端点不带 token 时的 401/403 不在这个测试里验证，因为后端是假的；该保护由 API 代码保证（所有写端点都 `Depends(require_admin_token)`）。`--keep` 可以保留容器和临时目录用于排障。
