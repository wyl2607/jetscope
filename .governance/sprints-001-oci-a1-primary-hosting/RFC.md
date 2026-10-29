# RFC — sprints-001-oci-a1-primary-hosting

> 由 `/sdd-rfc` 从 `.governance/specs/001-oci-a1-primary-hosting/draft.md`、`draft.review.md` 收敛而来（2026-10-22）。
> 本 Sprint 启动后本文件冻结；之后的变更另开 RFC。

## 背景与动机

saf.meichen.beauty 的 API（docker，约 153MB）和 Web（systemd 下的 next start，约 128MB）现在都跑在 usa-vps 上，这台机器只有 1.9 GiB 内存，`next build` 很吃力。本次把主服务搬到 oci-a1（2 OCPU / 12 GiB），usa 改为热备。公网入口沿用 esg 已验证的模式。迁移给 oci-a1 带来约 280MB 的真实常驻内存，**不作为防回收的手段**（防回收靠 PAYG）。

## 协议 / 接口决策

1. **流量**：Cloudflare → usa nginx（TLS、Basic Auth、`limit_req`、real-ip 都不变）→ tailnet → oci-a1 `100.81.227.79:{8000,3000}`。不改 DNS，oci-a1 不开公网端口。
2. **读写分流**（`/etc/nginx/conf.d/jetscope-upstream.conf`）：
   - `upstream jetscope_api`、`jetscope_web`：oci-a1 主（`max_fails=2 fail_timeout=30s`）＋ `127.0.0.1` backup；
   - `upstream jetscope_api_rw`、`jetscope_web_rw`：只有 oci-a1；
   - `map $request_method`：GET/HEAD/OPTIONS 走前两个，其余方法走 `_rw`；`/admin` 一律走 `jetscope_web_rw`；
   - `proxy_pass` **不带 URI**（`proxy_pass http://$jetscope_api_up;`），原请求 URI 和 query 原样转发（review A1）。
3. **写入口清单（冻结）**：web 没有 server actions；写请求只有下面这些，全部由 `proxyToApi` 原方法转发，API 侧都 `Depends(require_admin_token)`：

   | web 路由（`apps/web/app/api/…/route.ts`） | 方法 |
   |---|---|
   | `scenarios` | POST |
   | `scenarios/[scenarioId]` | PUT、DELETE |
   | `policies/refuel-eu` | PUT |
   | `pathways` | PUT |
   | `market/refresh` | POST |
   | `research/refresh` | POST |

   之后新增写路由，必须是非 GET 方法（这是本拓扑的契约，写进 `docs/DEPLOY-OCI-A1.md`）。
4. **来源标识**：`map $upstream_addr $jetscope_served_by`，输出响应头 `X-JetScope-Served-By: oci-a1|usa`，只有名字，不含 IP。
5. **主库唯一**：oci-a1 的 `market.db` 是唯一会接受用户写入的库。usa 热备的库只由它自己的刷新循环更新行情；用户数据停在切换那一刻，回切时才从 oci 同步回来。

## 架构选择

- **API**：`infra/server/docker-compose.prod.yml` 端口改为 `${JETSCOPE_API_BIND:-127.0.0.1}:8000:8000`；oci-a1 的 `.env` 设 `JETSCOPE_API_BIND=100.81.227.79`。
- **Web**：oci-a1 用 systemd 单元 `infra/server/oci-a1/jetscope-web.service`（`User=ubuntu`，`PATH=/opt/node-22/bin:…`，`--hostname 100.81.227.79`，`JETSCOPE_API_BASE_URL=http://100.81.227.79:8000`，`MemoryMax=1G`）。
- **Node**：固定 **v22.23.4**（和 usa 生产一致），linux-arm64 官方 tarball 装到 `/opt/node-22`，系统 apt 的 node 18 不动。
- **部署脚本**：`scripts/deploy-usa-vps.sh` 加 4 个变量，默认值都等于现行为：`$SUDO`（非 root 时为 sudo）、`JETSCOPE_NODE_BIN`、`JETSCOPE_SMOKE_BASE`（默认 127.0.0.1）、`JETSCOPE_EDGE_SMOKE`（默认 1）。新增 `scripts/deploy-oci-a1.sh` 作薄封装。`release.sh` 和 `auto-deploy.sh` 不改。发布顺序是先 oci-a1，再 usa 热备。
- **切换和回切**：`scripts/oci-a1/cutover.sh [--rollback] [--dry-run]`：
  - 每个阶段写 `/var/lib/jetscope-cutover/<ts>/{phases.log,manifest}`，记录阶段开始和结束、备份路径、sha256；
  - 每个阶段可重复执行，失败就停下并打印恢复命令，**不自动回退**（review A3）；
  - 回切前先停 usa api，复制 oci 的 `.backup`，校验 integrity 和行数，原子替换后再启动（review A2）；
  - 写入只在维护片段生效的那几分钟里返回 503，读请求不中断。
- **告警**：oci-a1 上 `JETSCOPE_BUS_WRITE` 指向 `infra/server/oci-a1/health-alert-on-change.sh`，只在状态变化时调 `/usr/local/bin/oci-tg-alert`；usa 热备的 health-check 只检查本机，消息里标 `usa-standby`（review A4）。
- **备份**：oci-a1 用 `jetscope-sqlite-backup.timer`（复用 `scripts/backup-sqlite.sh`）；仓库外的 `~/oci-a1-deploy/oci-backup.sh` 把最新一份放进每日快照，由 coco 拉取。

## 安全决策

- **SEC-01**：切换前 usa 上 `/opt/jetscope/.env` 和 `apps/api/.env.api-keys` 改为 600；**轮换 `JETSCOPE_ADMIN_TOKEN`**（usa 上有 3 个可登录的非 root 用户，已经暴露）。新令牌由 `seed.sh` 在 oci-a1 用 `openssl rand` 生成，同步写入两台机器，不打印。第三方 key（OPENAQ、ECMWF、QUANDL）**建议**用户到服务商那里轮换，不阻塞切换。
- **SEC-02**：`bootstrap.sh` 和 `cutover.sh` 的预检要求 oci-a1 上 `tailscale serve status` / `funnel status` 为空，否则中止。文档建议在 Tailscale ACL 里只允许 usa 节点访问 oci-a1 的 3000/8000。不加主机防火墙。
- **SEC-03**：oci-a1 的 backup 单元设 `UMask=0077`。
- **SEC-04**：Node 安装先用 nodejs/release-keys 的公钥（按 README 的指纹导入）跑 `gpg --verify SHASUMS256.txt.sig`，通过后再校验 tarball 的 sha256。
- **SEC-05**：nginx 回归测试 `scripts/oci-a1/nginx-smoke.sh` 证明三件事：admin 路径都有 Basic Auth、强制走 backup 时写请求返回 502（不会落到 usa）、API 写端点不带 token 时返回 401/403。
- tailnet 内这一跳用明文 HTTP，接受（WireGuard 加密，和 esg 一致）。
- 所有远程变更（oci-a1 装单元、usa nginx、密钥、停启服务）都**由用户执行**，AI 只交付脚本和 dry-run。

## 已被驳回的备选项

| 备选 | 理由 |
|---|---|
| DNS 直接指 oci-a1、在 oci-a1 自建 TLS | 用户选了 esg 模式；要动 Oracle 安全列表和 DNS，Basic Auth 和限流要维护两份 |
| Web 容器化（`apps/web/Dockerfile` 或 compose 里的 `web` 服务） | compose 里的 `web` 从未上过线；usa 用 systemd，两台跑法分叉会让冒烟和排障分叉 |
| 通过 NodeSource apt 把系统 Node 升到 22 | 影响面大；放在 `/opt/node-22` 可以独立回退 |
| failover 时允许写入，事后合并 | 没有合并工具，scenarios 有自增 id，会冲突 |
| 热备每日从 oci 同步库 | usa 会多一个每天要停 api 的常驻任务，收益很小；暂缓 |
| 改 `release.sh` / `auto-deploy.sh` 支持多目标 | 审批令牌的派生写死了 `host:dir:commit`，改动牵扯门禁；暂缓 |
| 失败时自动回退 | 部分失败后再动一次线上，风险比停下来大（review A3） |
| oci-a1 主机防火墙 | oci-a1 的 iptables 有已知坑；esg 已经是同样的暴露面；写端点本身有 token 保护（review SEC-02） |

## 影响面

- **修改路径**：`infra/server/docker-compose.prod.yml`、`scripts/deploy-usa-vps.sh`；新增 `scripts/deploy-oci-a1.sh`、`scripts/oci-a1/{bootstrap,seed,install-units,cutover,nginx-smoke}.sh`、`infra/server/oci-a1/**`；文档 `docs/DEPLOY-OCI-A1.md`（新）、`OPERATIONS.md`、`docs/DEPLOY_USA_VPS.md`、`docs/PRODUCTION_RISK_REGISTER.md`。仓库外：`~/oci-a1-deploy/oci-backup.sh`。
- **新增依赖**：Node v22.23.4 tarball（只在 oci-a1）；不新增 npm 或 pip 依赖。
- **兼容性**：usa 不带新变量时，`deploy-usa-vps.sh` 的 `--dry-run` 输出和改动前逐字相同（TK-001 的验收项）。tailnet 断开时读请求落到 usa、写请求返回 502。

## Done criteria

1. TK-001 至 TK-008 全部 done，每个 CR 至少 2 轮评审后收敛（遵循 self-healing 规则）。
2. usa 默认部署的 dry-run 输出逐字不变；oci-a1 上一次性实测 API 镜像构建和 `next build` 通过（arm64）。
3. `nginx-smoke.sh` 在容器化的 nginx 和假 upstream 上通过：路径保留、读请求 failover、写请求不 failover、admin 要 Basic Auth、响应头来源标识。
4. 所有远程脚本的 `--dry-run` 通过，交付给用户执行的命令清单写在 `docs/DEPLOY-OCI-A1.md`。
5. 用户执行完切换后：公网冒烟通过、`X-JetScope-Served-By: oci-a1`、`market.db` 行数一致、备份进入 coco 拉取链、告警能收到测试消息。
6. **停 usa 热备的判定指标**（留给观察期，不在本 Sprint 执行）：连续 7 天 failover 事件为 0；oci-a1 的每日备份 7/7 成功，coco 拉取成功；公网 5xx 比例不高于切换前；`deploy-oci-a1.sh` 至少完成一次正常发布。
