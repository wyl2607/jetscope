# 001 — draft：JetScope 主托管迁到 oci-a1（usa-vps 热备）

- 状态：draft（待 `/sdd-review`）
- 依据：[requirement.md](requirement.md)（2026-10-22 已确认）
- 日期：2026-10-22

## 1. 技术方案

### 1.1 拓扑

```text
Cloudflare ──► usa-vps nginx（TLS、Basic Auth、limit_req、real-ip 不变）
                 │  GET/HEAD/OPTIONS ─► upstream jetscope_{api,web}     = oci-a1 主 ＋ usa 本机 backup
                 │  其余方法、/admin ─► upstream jetscope_{api,web}_rw  = 只有 oci-a1（无 backup）
                 ▼ tailnet
oci-a1 100.81.227.79:8000  jetscope-api（docker compose，只绑 tailnet IP）
oci-a1 100.81.227.79:3000  jetscope-web（systemd，Node 22，next start）
```

做法和 esg（`/etc/nginx/conf.d/esg-upstream.conf`）一致：`max_fails=2 fail_timeout=30s`，usa 本机作 `backup`。

**写入只走主库（对应 requirement 开放问题 2）**：nginx 用 `map $request_method` 选 upstream，写方法和 `/admin` 只能到 oci-a1；oci-a1 宕机时写请求直接 502，读请求自动落到 usa 热备。这样两边的库**不会因为 failover 而分叉**，回切前也不需要人工合并。

**区分实际服务的是哪台**：nginx 用 `map $upstream_addr $jetscope_served_by` 输出 `X-JetScope-Served-By: oci-a1|usa`。只输出名字，不暴露 IP，不改业务代码。

### 1.2 oci-a1 运行时

| 项 | 方案 |
|---|---|
| 目录 | `/opt/jetscope`，属主 `ubuntu`；数据 `/opt/jetscope/data`（宿主卷） |
| API | 复用 `infra/server/docker-compose.prod.yml`。端口改为 `${JETSCOPE_API_BIND:-127.0.0.1}:8000:8000`，usa 不设变量，行为不变；oci-a1 的 `.env` 设 `JETSCOPE_API_BIND=100.81.227.79`。`mem_limit 512m` 保持不变 |
| Web | 新增 `infra/server/oci-a1/jetscope-web.service`：`User=ubuntu`，`Environment=PATH=/opt/node-22/bin:…`，`next start --hostname 100.81.227.79`，`JETSCOPE_API_BASE_URL=http://100.81.227.79:8000`；内存上限放宽到 `MemoryMax=1G`、`--max-old-space-size=768`（12G 机器） |
| Node | 官方 linux-arm64 tarball 装到 `/opt/node-22`，**不替换系统 apt 的 node 18**（oci-a1 上没有别的服务依赖它，但保持最小影响面） |
| 密钥 | `.env`、`apps/api/.env.api-keys` 由迁移脚本从 usa 经管道直接写到 oci-a1（权限 600，不打印内容），做法同 health-talkie cutover |
| 备份 | 新增 `infra/server/oci-a1/jetscope-sqlite-backup.{service,timer}`（`User=ubuntu`，复用 `scripts/backup-sqlite.sh`）；oci-a1 的 `/usr/local/bin/oci-backup.sh` 把最新一份 `market.db` 备份纳入每日快照，由 coco 拉取（仓库外，`~/oci-a1-deploy`） |
| 健康检查 | 复用 `infra/server/health-check.sh`，通过已有的环境变量指向 tailnet 地址，用 systemd timer（oci-a1 惯例）每分钟跑一次，`ALLOW_RESTART=0`；usa 的 cron 改为只检查本机热备（`JETSCOPE_PUBLIC_URL=http://127.0.0.1:3000/`），不再检查公网 |

### 1.3 部署脚本（对应开放问题 4）

`scripts/deploy-usa-vps.sh` 已经把主机、目录、数据目录、公网域名做成了环境变量，只需补齐让它能以非 root、无本机 nginx 的方式部署：

1. 远程命令中 `systemctl` 前加 `$SUDO`（`id -u` 不是 0 时为 `sudo`）。
2. 新增 `JETSCOPE_NODE_BIN`：设了就在远程 `PATH` 前面加上它，供 `npm ci` 和 `npm run web:build` 使用。
3. 新增 `JETSCOPE_SMOKE_BASE`（默认 `127.0.0.1`）：冒烟时 API 和 Web 的地址可以指向 tailnet IP。
4. 新增 `JETSCOPE_EDGE_SMOKE`（默认 `1`）：设为 `0` 时跳过「本机 nginx 带 Host 头」的那两项探测（oci-a1 上没有 nginx）；边缘冒烟改由 usa 侧单独执行。
5. 新增薄封装 `scripts/deploy-oci-a1.sh`：设好上述变量（`JETSCOPE_DEPLOY_HOST=oci-a1-ts` 等）后 `exec` 主脚本，参数原样透传（`--rebuild`、`--api-only`、`--dry-run`）。

usa 热备照旧用 `deploy-usa-vps.sh`。`release.sh` 和 `auto-deploy.sh` 这条审批令牌链路**本期不改**（当前惯例是用户手动跑部署脚本）；文档中写明「主站发布 = 先 oci-a1，再 usa 热备」。

### 1.4 迁移与切换（全部由用户执行；AI 写脚本 + dry-run）

脚本放在 `scripts/oci-a1/`（随仓库评审），每个都支持 `--dry-run`：

| 步骤 | 脚本 | 内容 |
|---|---|---|
| 0 准备 | `oci-a1/bootstrap.sh` | oci-a1：建 `/opt/jetscope`（ubuntu），装 Node 22 tarball（校验 SHASUMS256），装 `sqlite3`（如缺）；只读预检 |
| 1 影子部署 | `oci-a1/seed.sh` + `deploy-oci-a1.sh --rebuild` | 从 usa 拷 `.env`/api-keys（600）＋ `market.db` 的 `.backup` 快照（核对 integrity 和行数）→ 部署 → 在 tailnet 上冒烟。此时 oci-a1 的刷新循环也在写**它自己的副本**，公网不受影响 |
| 2 装单元 | `oci-a1/install-units.sh` | web、backup timer、health-check timer |
| 3 切换 | `oci-a1/cutover.sh` | ①usa nginx 先上「写方法返回 503」的维护片段 → ②usa `.backup` 最新库 → oci-a1：停 api、换库、起 api、冒烟 → ③装 upstream 配置（`conf.d/jetscope-upstream.conf` + 改 `sites-enabled/jetscope` 的 proxy_pass），撤掉维护片段，`nginx -t && reload` → ④公网冒烟（看 `X-JetScope-Served-By: oci-a1`）。写入只中断步骤 ①–③ 这几分钟；读请求不中断。nginx 改之前备份到 `/root/nginx-backup-jetscope-<ts>/` |
| 回切 | `oci-a1/cutover.sh --rollback` | 维护片段 → oci-a1 `.backup` 库拷回 usa（usa 原库留 `*.pre-rollback-<ts>`）→ 重启 usa api → nginx 改回只有本机 upstream → 冒烟 |

### 1.5 usa 热备的数据新鲜度（开放问题 3）

热备的行情由它自己的刷新循环保持 live；用户数据停在切换那一刻。因为热备只承接读请求，这个滞后只在 oci-a1 宕机期间可见，而且只影响 scenarios/preferences/policies 的展示。**本期不做定期同步**，只在回切时同步；观察期结束后再决定是否加每周同步。

## 2. 备选项

| 备选 | 内容 | 结论 |
|---|---|---|
| A. DNS 直接指 oci-a1 | oci-a1 自建 nginx、证书和公网 443 | **否决**（用户选择 esg 模式）：要动 Oracle 安全列表和 DNS，Basic Auth/限流要搬两份 |
| B. Web 容器化 | 用 `apps/web/Dockerfile`，或者把 compose 里现成的 `web` 服务（node:20-alpine，bind mount）跑起来 | **否决**：compose 里的 `web` 服务从未上过线，部署脚本特意避开它；usa 用的是 systemd，两台跑法不同会让冒烟和排障分叉。容器化留作以后两台一起改 |
| C. 系统 Node 换成 22（NodeSource apt） | 改 apt 源，全局升级 | **否决**：影响面更大；tarball 放 `/opt/node-22` 可以独立回退 |
| D. 允许 failover 时写入、回切时合并 | backup 也承接写请求 | **否决**：没有合并工具，scenarios 有自增 id，会冲突；用「写请求只到主库」换取不分叉 |
| E. 热备每日从 oci 同步库 | usa 上加一个定时换库任务 | **暂缓**：会让 usa 多一个每天停 api 的常驻任务，收益只是 failover 期间用户数据更新一点 |
| F. 改 `release.sh` / `auto-deploy.sh` 支持多目标 | 审批令牌覆盖两台主机 | **暂缓**：审批令牌派生里写死了 `host:dir:commit`，改动牵扯门禁；当前实际发布走部署脚本，先不动 |
| G. 重命名 `deploy-usa-vps.sh` | 改成 `deploy-host.sh` | **否决**：文档和人的习惯都引用旧名；用薄封装就够了 |

## 3. 影响面

**仓库内修改**
- `infra/server/docker-compose.prod.yml`：端口改为 `${JETSCOPE_API_BIND:-127.0.0.1}`（usa 行为不变）。
- `scripts/deploy-usa-vps.sh`：`$SUDO`、`JETSCOPE_NODE_BIN`、`JETSCOPE_SMOKE_BASE`、`JETSCOPE_EDGE_SMOKE` 四处，默认值全部保持现行为。
- 新增：`scripts/deploy-oci-a1.sh`；`scripts/oci-a1/{bootstrap,seed,install-units,cutover}.sh`；`infra/server/oci-a1/` 下的 web、backup、health-check 单元，以及 nginx 片段（upstream、method map、served-by map、维护片段）作为模板。
- 文档：新增 `docs/DEPLOY-OCI-A1.md`；`OPERATIONS.md`、`docs/DEPLOY_USA_VPS.md` 标注 usa 是热备；`docs/PRODUCTION_RISK_REGISTER.md` 加 tailnet 依赖风险。

**仓库外修改**
- usa-vps：`/etc/nginx/conf.d/jetscope-upstream.conf`（新）、`sites-enabled/jetscope`（proxy_pass 改用 upstream 变量）、root crontab 的 health-check 环境变量。
- oci-a1：`/opt/jetscope`、`/opt/node-22`、3 组 systemd 单元、`/usr/local/bin/oci-backup.sh`（加 jetscope 段）。

**新增依赖**：Node 22 官方 tarball（oci-a1）；不新增 npm/pip 依赖。

**兼容性**
- usa 部署：所有新变量都有默认值，`deploy-usa-vps.sh` 不带新变量时行为完全不变。dry-run 输出要逐行对比来证明这一点。
- 网络依赖：主站多了一跳 usa→oci-a1 tailnet；tailnet 断开时读请求落到 usa，写请求 502。
- 资源：oci-a1 增加约 280MB 常驻内存，构建时短时 1–2GB；usa 的负载不变，直到观察期后停掉热备。

## 4. 未解决问题

1. **nginx 用变量写 proxy_pass**（`proxy_pass http://$jetscope_api_up/v1/;`）时，路径拼接和 `keepalive` 的行为要在 usa 上 `nginx -t` 加实际请求验证。如果有坑，退回到 `if ($request_method …)` 分支写法。
2. **Next.js 的写请求面**：admin 页面和 server actions 是否全部走非 GET 方法，或者都在 `/admin` 路径下？需要逐个核对，否则 failover 时可能有写请求经 usa 的 web 落到 usa 的库。
3. **`.env` 权限**：usa 上的 `/opt/jetscope/.env` 是 644，内含 `JETSCOPE_ADMIN_TOKEN`。oci-a1 上一律用 600；usa 是否顺手修正，交给安全评审决定。
4. **tailnet 明文 HTTP**：usa→oci-a1 这一跳在 WireGuard 隧道里，不另加 TLS。是否接受，交给安全评审决定。
5. **ARM64 镜像**：`apps/api/Dockerfile` 的基础镜像和 pip 依赖在 arm64 上能否构建（esg 在 oci-a1 能构建，说明 Python 栈大体没问题，但要实测）；`next build` 的原生依赖（如 swc、lightningcss）在 linux-arm64 上的可用性。
6. **health-check 的 bus 写入**（`JETSCOPE_BUS_WRITE`）在 oci-a1 上是否启用，事件来源怎么标注。
7. **观察期结束后停 usa 热备**的判定指标（本期不执行，但要先定好指标）。
