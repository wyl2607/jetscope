# TK-008 结果

## 改动文件

| 文件 | 说明 |
| --- | --- |
| `docs/DEPLOY-OCI-A1.md`（新建） | 拓扑、写入口契约、首次上线 7 步、回切、日常发布、备份告警、Tailscale/第三方 key 建议、停热备指标、nginx 回归测试。 |
| `docs/DEPLOY_USA_VPS.md` | 标题下新增一段：usa 自 2026-10-22 起是热备，先发 oci-a1 再发 usa，并链接新文档。 |
| `OPERATIONS.md` | 在 Canonical Release Path 后新增 `Primary Host And Publish Order` 段，写明主站和发布顺序；`release.sh` 流程描述未改。 |
| `docs/PRODUCTION_RISK_REGISTER.md` | 表格新增 R-011（tailnet 依赖）、R-012（主库只有一份）、R-013（热备数据滞后），并在验证日志追加一条记录。 |

未修改脚本、`.governance/**`、`apps/**` 或任何其他文件。

## 运行过的验证

```text
$ npx --no-install markdownlint-cli2 docs/DEPLOY-OCI-A1.md docs/DEPLOY_USA_VPS.md docs/PRODUCTION_RISK_REGISTER.md OPERATIONS.md
markdownlint-cli2 v0.24.0 (markdownlint v0.42.0)
Linting: 4 files
Summary: 0 issues in 0 files
```

```text
$ python3 scripts/markdownlint-pr-gate.py --help 2>&1 | head -5
usage: markdownlint-pr-gate.py [-h] --base BASE [--head HEAD] [--root ROOT]
                               [--report REPORT]

Run markdownlint as a pull-request new-line gate. The script lints changed
Markdown files, then only fails for findings on lines added by the current
```

该 gate 只比较两个 git 提交之间的新增行，工作区里未提交的文件不在它的 diff 范围内；因此又用同一份 `.markdownlint-cli2.yaml` 直接对四个文件跑了上面的 `markdownlint-cli2`。

```text
bash scripts/oci-a1/bootstrap.sh --dry-run -> rc=0
bash scripts/oci-a1/seed.sh --dry-run --rotate-admin-token -> rc=0
bash scripts/oci-a1/install-units.sh --dry-run -> rc=0
bash scripts/oci-a1/cutover.sh --dry-run -> rc=0
bash scripts/oci-a1/cutover.sh --rollback --dry-run -> rc=0
bash scripts/deploy-oci-a1.sh --rebuild --allow-unmerged --dry-run -> rc=0
bash scripts/deploy-oci-a1.sh --rebuild --dry-run -> rc=0
```

```text
$ grep -n "cutover.sh\|seed.sh\|bootstrap.sh\|install-units.sh\|deploy-oci-a1.sh" docs/DEPLOY-OCI-A1.md | head -30
46:bash scripts/oci-a1/bootstrap.sh --dry-run
52:bash scripts/oci-a1/bootstrap.sh
66:bash scripts/oci-a1/seed.sh --dry-run --rotate-admin-token
72:bash scripts/oci-a1/seed.sh --rotate-admin-token
94:bash scripts/oci-a1/install-units.sh --dry-run
100:bash scripts/oci-a1/install-units.sh
116:bash scripts/deploy-oci-a1.sh --rebuild --allow-unmerged
122:bash scripts/deploy-oci-a1.sh --rebuild
125:做什么：`deploy-oci-a1.sh` 是薄封装……
152:bash scripts/oci-a1/install-units.sh
166:bash scripts/oci-a1/cutover.sh --dry-run
172:bash scripts/oci-a1/cutover.sh
179:失败怎么办：……当前版本不接受 `--resume-smoke`……
186:bash scripts/oci-a1/cutover.sh --rollback --dry-run
192:bash scripts/oci-a1/cutover.sh --rollback
204:bash scripts/deploy-oci-a1.sh --rebuild
236:- oci-a1 不要开启 `tailscale serve` 或 `tailscale funnel`……
237:- `OPENAQ`、`ECMWF`、`QUANDL` 等第三方 key……
246:4. `deploy-oci-a1.sh` 至少完成过一次正常发布。
```

所有 dry-run 都只在本机执行，没有 SSH、curl 或 rsync 到任何远程主机。

## 与 TK Done criteria 对照

- [x] `docs/DEPLOY-OCI-A1.md` 包含拓扑图（cloudflare → usa nginx → tailnet → oci-a1，读回退/写与 `/admin` 只走 oci、`X-JetScope-Served-By`）、按顺序的 bootstrap → seed → install-units → deploy-oci-a1 → 启用 web → 再跑 install-units → cutover 清单，每步都有做什么/验证/失败处理；写入口契约、Tailscale ACL 建议、停热备判定指标都在。
- [x] `OPERATIONS.md` 和 `docs/DEPLOY_USA_VPS.md` 标明 usa 是热备、发布顺序先 oci-a1 再 usa，并链接新文档。
- [x] `docs/PRODUCTION_RISK_REGISTER.md` 新增 tailnet 依赖、主库只有一份、热备数据滞后三条风险。
- [x] markdownlint 对四个文件 0 issue（见上）。

## 核对过的「脚本实际行为 vs 文档描述」

| 脚本行为（读代码/dry-run 核对） | 文档写法 |
| --- | --- |
| `install-units.sh` 第一次运行时，`/opt/jetscope/node_modules/.bin/next` 不存在，跳过 `jetscope-web.service` 的 verify 但仍安装；health-check timer 只在 web 已 active 时启用，backup timer 无条件启用。 | 第 3 步写明两条预期提示（warn + note）和 backup timer 已启用、health timer 未启用。另注明 backup timer 的 `backup-sqlite.sh` 要等第 4 步 rsync 后才存在，避免跨 01:10 UTC 过夜失败。 |
| `deploy-oci-a1.sh` 只设置 host/node/smoke base/edge smoke 四个默认值，然后 exec `deploy-usa-vps.sh`，没有自己的部署逻辑。 | 第 4 步按封装行为描述，并说明 `--rebuild`、`--allow-unmerged` 的适用条件。 |
| `deploy-usa-vps.sh` 的 web 重建段只检查 `jetscope-web.service` 已安装，然后 `systemctl restart`；未 enable 的已安装单元也会被 restart 启动。deploy 结尾冒烟要求 `:3000` 可响应。 | 第 4 步说明部署结束前 web 已被启动；第 5 步只负责 `enable --now` 开机自启。顺序按脚本实际行为写，未照抄 install-units 里“部署前 enable”的提示。 |
| `deploy-usa-vps.sh` 在 `SMOKE_BASE != 127.0.0.1` 时要求 `.env` 有 `JETSCOPE_API_BIND=$SMOKE_BASE`，否则在改容器前退出；宿主非空 `market.db` 永不覆盖。 | 第 4 步写明这两个前置检查和数据库保护。 |
| `seed.sh` 轮换令牌后在 usa 上打印的是 `docker-compose -f docker-compose.prod.yml up -d api`（v1），不是 `docker compose`。 | 第 2 步给出逐字相同的 v1 命令。 |
| `seed.sh --help` 不存在（只接受 `--dry-run`、`--rotate-admin-token`、`--force-db`，未知参数报错）。 | 文档只使用这三个已实现的选项，没有写 `--help`。 |
| `cutover.sh` 当前只接受 `--rollback`、`--dry-run`、`--help`，**没有 `--resume-smoke`**（CR-007 F3 的“从第 5 步续跑”仍在待修，工作区快照未包含 R5 修复）。 | 第 7 步明确写“当前版本不接受 `--resume-smoke`”，并给出实际失败路径：按 recovery 处理，或先回切再重来。没有编造该选项。 |
| `cutover.sh` 的切换阶段 0–7：预检、备份 usa nginx、维护闸、usa→oci 数据库同步（旧库 `market.db.pre-cutover-<ts>`）、安装 upstream/站点并原子切换符号链接、移除维护闸、公网冒烟、summary；日志在 usa 的 `/var/lib/jetscope-cutover/<ts>/{phases.log,manifest}`。 | 第 7 步逐项对应，验证写 `cutover complete`、served-by、page-as-of、/admin 401。 |
| `cutover.sh --rollback` 的数据库方向是 oci→usa：先停 usa api，oci 上 `.backup`，流回 usa，完整性/行数校验，旧 usa 库保留 `market.db.pre-rollback-<ts>`，换库并启动 usa api；最后切回原站点，`nginx -t` 通过后才删除 upstream 文件，冒烟要求 served-by 缺失或 usa。 | “回切到 usa”段按此描述，并明确数据同步方向和旧库保留。 |
| `nginx-smoke.sh` 的断言是 a–g：路径/query、读请求 served-by、写请求到 oci、admin 401（含 en/de）、oci 停止后读回退 usa 且写 502、维护闸 503、`nginx -t`；token 401/403 不在测试内。 | 第 9 节逐条列出 a–g，并说明 token 保护由 API 代码（`require_admin_token`）保证。 |
| `jetscope-sqlite-backup.timer` 是 01:10 UTC + `RandomizedDelaySec=5min`，服务失败 `OnFailure=jetscope-alert@%n.service`；`health-check.timer` 每分钟一次，`ALLOW_RESTART=0`，经 on-change 钩子告警；`backup-sqlite.sh` 默认保留 14 份；仓库外 `oci-backup.sh` 在 01:41 UTC 取最新 `market-*.db.gz`。 | 备份与告警段按这些实际值写。 |
| `next.config.mjs` 的 `generateBuildId` 读取 `process.env.JETSCOPE_BUILD_SHA`；deploy 脚本把提交号作为该变量传给 web 构建。 | 日常发布段写相同提交 → 相同 buildId → failover 时 `/_next/static` 仍匹配。 |
| nginx 模板：GET/HEAD/OPTIONS 走 `*_up`（oci + 127.0.0.1 backup），其余走 `*_rw`（仅 oci）；`/admin` 正则覆盖带可选 en/de 前缀的形式；`map $upstream_addr` 输出 oci-a1/usa/none；维护片段对非 GET/HEAD/OPTIONS 返回 503 + `Retry-After`。 | 拓扑和写入口契约按模板写。 |

## 已知遗留风险

1. 文档按当前工作区快照（`5c91eda`，CR-007 仅完成 Round 1）编写。CR-007 的 R5/R6 修复（`--resume-smoke`、`/tmp` 可预测快照名、`-journal` 处理等）尚未落地；文档已明确当前没有 `--resume-smoke`，修复合并后需要同步更新第 7 步的失败处理。
2. 文档中的首次上线顺序依赖人工执行，未在真实 oci-a1/usa-vps 上跑通；所有 dry-run 均为本地静态检查。
3. `cutover.sh` 的 usa/oci 数据库快照仍使用 `/tmp` 下可预测文件名（CR-007 C1/F8 待修），文档没有暴露这个内部路径，但风险仍在脚本侧。
4. RFC 提到的 usa 热备告警消息标 `usa-standby` 在当前仓库里没有对应实现，文档未声称已实现。
5. `markdownlint-pr-gate.py` 只能检查提交间新增行；本次未提交，使用 `markdownlint-cli2` 直接检查了四个文件，PR 门禁仍需在提交后按 `--base/--head` 跑一次。
