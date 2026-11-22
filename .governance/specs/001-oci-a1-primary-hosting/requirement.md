# 001 — JetScope 生产站主托管迁到 oci-a1（usa-vps 热备）

- 状态：requirement（2026-10-22 用户已确认）
- 日期：2026-10-22
- 角色：Coordinator（主会话）；后续 `/sdd-draft` 出技术方案

## Goal

把 saf.meichen.beauty 的 API + Web 主服务从 usa-vps 搬到 oci-a1，公网入口不变：Cloudflare → usa nginx → upstream 主走 oci-a1（tailnet 100.81.227.79），usa 本机实例作 backup upstream。

## 动机

1. **给 usa-vps 减负**：usa 只有 1.9 GiB 内存（当前 available ≈ 1.2 GiB），同时承载 esg 后备、meichen 等；`next build` 在这台机器上很吃力。oci-a1 有 2 OCPU / 12 GiB。
2. **为 oci-a1 增加真实负载**：只是次要收益。实测 jetscope 常驻只有约 280 MB（API 容器 153 MB + next-server 128 MB，CPU 0.3%），迁过来后 oci-a1 内存约从 15.5% 升到 18%，**不足以单独越过 Oracle 20% 闲置线**；防回收靠 PAYG 升级，不靠本迁移。
3. 和已迁移的 esg 保持同一套拓扑和回切方式，降低运维心智成本。

## 现状（2026-10-22 只读勘察）

| 组件 | usa-vps 现状 |
|---|---|
| API | docker 容器 `jetscope-api`（compose，`127.0.0.1:8000`），挂载 `/opt/jetscope/data → /app/data`；`market.db` SQLite 约 157 MB，进程内 `asyncio` 行情刷新循环（`JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS`）持续写库 |
| Web | systemd `jetscope-web.service`（root，`next start` 127.0.0.1:3000，Node 22，`--max-old-space-size=384`） |
| nginx | `sites-enabled/jetscope`：`/v1/` → :8000，`/admin` 带 Basic Auth（`/etc/nginx/.htpasswd_jetscope_admin`）→ :3000，其余 → :3000；`limit_req saf_req`；Cloudflare real-ip |
| 定时 | `jetscope-sqlite-backup.timer` 每日（备份目录 632 MB）；root cron 每分钟 `infra/server/health-check.sh` |
| 密钥 | `/opt/jetscope/.env`（含 `JETSCOPE_ADMIN_TOKEN` 等）、`apps/api/.env.api-keys` |
| 发布 | `scripts/release.sh` → `auto-deploy.sh` / `deploy-usa-vps.sh`（脚本写死 usa-vps 与 `/opt/jetscope`） |

**库里有用户可写数据**：scenarios 增删改、preferences PUT、policies PUT（refuel-eu）、pathways/grid 的 admin 端点。因此两边热备时数据库会分叉。

oci-a1 现状：Docker Compose 2.40 可用；系统 Node 是 **v18**（Next 16 至少需要 Node 20）；磁盘剩 19 GB；端口约定只绑 127.0.0.1 或 tailnet IP。

## Constraints

- 公网入口、TLS、Cloudflare、Basic Auth 全部留在 usa nginx，**不在 oci-a1 开公网端口**，不改 DNS。
- oci-a1 上服务只监听 `100.81.227.79`（供 usa 经 tailnet 访问）和 127.0.0.1。
- 数据契约不变：值只分 live/stale/estimated/missing，种子值不进 values。
- **用户可写数据只能有一个主库**：切换后写请求只落 oci-a1；需定义 backup 生效时（failover）的写入策略，以及回切时 oci→usa 的数据同步步骤（与 esg 相同的回切前置条件）。
- 现有发布门禁不能削弱（`security_check.sh`、`review_push_guard.sh`、approval token）；**合并、部署、改 usa nginx、停服务由用户执行**，AI 只写脚本并跑 dry-run。
- oci-a1 不跑 lane、不写空转任务；遵守 oci-a1 既有的坑（别 `netfilter-persistent save`，以其他用户执行命令前先 `cd /`）。
- 不迁 Postgres、代理栈，也不迁 meichen。

## Done criteria

1. oci-a1 上 API + Web 正式运行（随开机自启），`/v1/health` 正常，`/v1/readiness` 与 usa 一致；行情刷新循环在 oci-a1 写库。
2. usa nginx 中 saf 站的 `/v1/`、`/admin`、`/` upstream 主指 oci-a1，backup 指 usa 本机；公网冒烟（首页、`/v1/health`、`/admin` 401→Basic Auth、`/_next/static`）通过，响应头能区分走的是哪台（类似 esg 的 `environment` 字段或响应头）。
3. 首次切换时，`market.db` 以 `.backup` 一致性快照从 usa 拷到 oci-a1，行数校验一致。
4. 每日 SQLite 备份在 oci-a1 上运行，并纳入现有 oci-a1 → coco 的拉取备份链。
5. health-check 在 oci-a1 上对 oci 实例生效；usa 的 health-check 改为只检查本机热备，不误报。
6. 发布路径能发布到 oci-a1（`release.sh` / 部署脚本支持目标主机参数，或另写 oci 部署脚本），usa 热备仍可单独更新。
7. 回切脚本：一条命令把 upstream 切回 usa，并先把 oci-a1 的库同步回 usa；dry-run 通过。
8. 文档：`docs/` 增加 oci-a1 部署与回切说明；`OPERATIONS.md` 和部署手册同步更新。
9. 稳定观察 7 天后，由用户决定是否停 usa 热备（不在本 spec 内执行）。

## 明确不做（Non-goals）

- 不改 DNS、不在 oci-a1 上自建 TLS/nginx 公网入口。
- 不迁 meichen-web、Postgres、esg（esg 已迁）。
- 不改 JetScope 业务代码与数据模型（除非部署需要的配置项，例如 host/port、环境标识）。
- 不在本 spec 内停用 usa 实例。
- 不把 oci-a1 防回收作为验收指标。

## 待 draft 阶段决定的开放问题

1. Web 在 oci-a1 用什么跑：容器化（与 API 一致）还是 systemd + 用户级 Node 22？`next build` 在哪里做（oci-a1 本机 / CI 构建产物）？
2. failover 期间写入策略：backup 只读（nginx 对写方法不走 backup），还是允许写入、回切时人工合并？
3. usa 热备的数据新鲜度：靠它自己的刷新循环（行情会是 live，但用户数据停在切换时刻），还是定期从 oci 同步？
4. `release.sh` 改成多目标，还是新增 `deploy-oci-a1.sh`；approval token 怎么覆盖两个目标。
5. 两台机器的 health-check 与 bus 事件怎么区分来源。
