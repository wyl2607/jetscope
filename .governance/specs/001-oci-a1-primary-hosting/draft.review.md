# 001 — draft review（2026-10-22）

评审者：两个 codex（gpt-5.6-terra，只读，在仓库 worktree 中对照 `scripts/`、`infra/`、`apps/` 评审），并行运行，各自负责一个视角。Coordinator（Claude）逐条对照代码和线上状态做了核实，核实结果写在每条后面的方括号里。

## A. 架构视角（verdict: needs_fix）

| id | 严重度 | 位置 | 问题 | 建议 |
|---|---|---|---|---|
| A1 | blocker | draft.md §1.1 / §4-1 | `proxy_pass` 一旦用了变量又带上 URI（`http://$up/v1/`），nginx 会用这个 URI **整体替换**原请求路径，`/v1/health` 和 `/v1/scenarios` 都会被转成 `/v1/` | 用能保留原 URI 和 query 的写法，并把各路径在主、备两种情况下的冒烟列为切换前置条件。[核实：符合 nginx 的文档行为] |
| A2 | major | §1.4 回切 | 回切时直接覆盖 usa 的库后再重启 api，但 usa api 和刷新循环当时仍在写同一个库 | 先停 usa api，再复制、校验 integrity 和行数、原子替换，最后启动。[核实：属实，usa 热备一直在跑刷新循环] |
| A3 | major | §1.4 切换 | 切换分多个阶段，没有把阶段状态和备份清单落盘，也没定义失败时恢复哪一份库 | 写带时间戳的阶段日志和备份清单，每个阶段可重复执行并定义失败处理 |
| A4 | major | §1.2 健康检查 / §4-6 | `ALLOW_RESTART=0` 时 health-check 只写日志，只有配置了 `JETSCOPE_BUS_WRITE` 才发事件；而 bus 又被列为未决问题，等于没有告警闭环 | 明确告警通道、主机标识和失败阈值。[核实：`infra/server/health-check.sh:84-87` 属实] |

## B. 安全视角（verdict: needs_fix）

| id | 严重度 | 位置 | 问题 | 建议 |
|---|---|---|---|---|
| SEC-01 | major | §4-3 | usa 的 `.env` 是 644 且含管理令牌，本机非特权用户可读 | 改为仅属主可读写，并轮换 `JETSCOPE_ADMIN_TOKEN` 和其他已暴露的密钥。[核实：usa 上有 `mita`、`mini2backup`、`postgres` 三个可登录的非 root 用户，确实读得到] |
| SEC-02 | major | §1.2 绑定 | 服务绑在 tailnet IP 上，但没规定 Tailscale ACL、主机防火墙或禁用 Funnel；从 tailnet 直连会绕过边缘 nginx 的保护（Basic Auth、`/v1/readiness` 的限制） | 只允许 usa 节点访问 8000/3000，并确认 Funnel 没开。[核实：oci-a1 节点有 funnel 权限，当前没有 serve 配置] |
| SEC-03 | major | §1.2 备份 | `scripts/backup-sqlite.sh` 没设 umask/chmod，以 ubuntu 用户运行时生成的备份其他本机用户可读 | systemd 单元设 `UMask=0077`，目录 700，文件 600 |
| SEC-04 | major | §1.4 bootstrap | 只校验 SHASUMS256，清单和 tarball 来自同一来源，挡不住篡改 | 固定 Node 版本，并用官方发布密钥校验清单签名 |
| SEC-05 | major | §4-2 | Next.js 的写请求面仍是未决问题 | 冻结「路由 × 方法」表，并用 nginx 回归测试证明 admin 路径保留 Basic Auth、写请求只走主库、token 鉴权有效 |
