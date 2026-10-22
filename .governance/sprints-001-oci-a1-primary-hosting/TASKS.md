# TASKS — sprints-001-oci-a1-primary-hosting

> 状态枚举：`planned | executing | reviewing | fixing | recheck | done | blocked | split`
> split 用于父 TK：自身不执行，由其子 TK 完成。
> 每次 phase 切换由 Coordinator 同步本表。

| id | title | status | blocked_by | write_scope | reviewer_lanes | notes |
|----|-------|--------|------------|-------------|----------------|-------|
| TK-001 | compose 端口变量化 + 部署脚本参数化 + oci 封装 | executing | — | `infra/server/docker-compose.prod.yml`、`scripts/deploy-usa-vps.sh`、`scripts/deploy-oci-a1.sh` | default,architecture | 含 arm64 一次性构建实测 |
| TK-002 | oci-a1 systemd 单元模板 + 状态变化告警脚本 | executing | — | `infra/server/oci-a1/systemd/**`、`infra/server/oci-a1/health-alert-on-change.sh` | default,security | — |
| TK-003 | usa nginx 模板 + nginx-smoke 回归测试 | executing | — | `infra/server/oci-a1/nginx/**`、`scripts/oci-a1/nginx-smoke.sh` | architecture,security | review A1 blocker 的落点 |
| TK-004 | bootstrap.sh：目录、Node 22 签名校验安装、sqlite3、Funnel 预检 | executing | — | `scripts/oci-a1/bootstrap.sh` | security | — |
| TK-005 | seed.sh：密钥搬运、ADMIN_TOKEN 轮换、usa 权限修正、库快照 | planned | — | `scripts/oci-a1/seed.sh` | security,architecture | — |
| TK-006 | install-units.sh + oci-backup.sh 加 jetscope 段 | planned | TK-002 | `scripts/oci-a1/install-units.sh`、`~/oci-a1-deploy/oci-backup.sh`（仓库外） | default,security | — |
| TK-007 | cutover.sh：切换 / 回切 / 阶段日志 / 维护片段 | planned | TK-003, TK-005 | `scripts/oci-a1/cutover.sh` | architecture,security | review A2/A3 的落点 |
| TK-008 | 文档与用户执行清单 | planned | TK-001..TK-007 | `docs/DEPLOY-OCI-A1.md`、`docs/DEPLOY_USA_VPS.md`、`docs/PRODUCTION_RISK_REGISTER.md`、`OPERATIONS.md` | default | 纯文档但含部署指令 → 加 security 复核 |

## 字段说明
- **write_scope**：路径前缀白名单，Executor 只能写其中的文件
- **reviewer_lanes**：`default` / `architecture` / `security` / `perf` 任意组合，决定派几个 Reviewer
- **blocked_by**：上游依赖的 TK id 列表
- **notes**：split 时记录子 TK id；blocked 时记录原因
