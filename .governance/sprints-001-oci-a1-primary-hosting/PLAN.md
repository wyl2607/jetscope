# PLAN — sprints-001-oci-a1-primary-hosting

## 目标
做完后，saf.meichen.beauty 由 oci-a1 提供服务，usa-vps 作为只读热备；切换、回切、发布、备份、告警都有经过 dry-run 的脚本，由用户一键执行。

## 接续点
- 这是第一个 Sprint，来源是 spec `001-oci-a1-primary-hosting`（requirement → draft → review，已完成）。
- 已有先例：esg 的 upstream 模式（usa `/etc/nginx/conf.d/esg-upstream.conf`）、health-talkie 的 cutover 脚本风格（`~/oci-a1-deploy/health-talkie/cutover.sh`）。
- auto 模式限制：AI 不能在远程装或启常驻单元、写远程凭据、改 usa nginx、停服务 → 所有远程变更都交付成脚本，由用户执行。

## 范围
- 包含：
  - compose 端口变量化、`deploy-usa-vps.sh` 加 4 个变量、`deploy-oci-a1.sh` 薄封装
  - oci-a1 的 systemd 单元模板（web、backup、health-check）和状态变化告警脚本
  - usa nginx 模板（upstream、读写 map、served-by、维护片段）和 `nginx-smoke.sh` 回归测试
  - `scripts/oci-a1/{bootstrap,seed,install-units,cutover}.sh`（都支持 `--dry-run`；cutover 支持 `--rollback`）
  - 仓库外 `~/oci-a1-deploy/oci-backup.sh` 加 jetscope 段
  - 文档：`docs/DEPLOY-OCI-A1.md`（含写入口契约）、OPERATIONS、DEPLOY_USA_VPS、RISK_REGISTER
- 明确不做：
  - 改 DNS，或在 oci-a1 开公网端口
  - 改 `release.sh` / `auto-deploy.sh`
  - 改业务代码和数据模型
  - 停 usa 热备（观察期过后由用户决定）
  - AI 亲自执行任何远程变更

## 车道（并行 lanes）
| lane | TKs | write_scope 摘要 |
|------|-----|-----------------|
| L-A | TK-001 | `infra/server/docker-compose.prod.yml`、`scripts/deploy-usa-vps.sh`、`scripts/deploy-oci-a1.sh` |
| L-B | TK-002 → TK-006 | `infra/server/oci-a1/systemd/**`、`infra/server/oci-a1/health-alert-on-change.sh`、`scripts/oci-a1/install-units.sh`、`~/oci-a1-deploy/oci-backup.sh` |
| L-C | TK-003 | `infra/server/oci-a1/nginx/**`、`scripts/oci-a1/nginx-smoke.sh` |
| L-D | TK-004、TK-005 → TK-007 | `scripts/oci-a1/{bootstrap,seed,cutover}.sh` |
| L-E | TK-008 | `docs/**`、`OPERATIONS.md` |

TK-001 至 TK-005 之间没有写入冲突，可以并行；TK-006 依赖 TK-002；TK-007 依赖 TK-003、TK-005；TK-008 最后做。

## Checklist（与 TK done 状态保持一致）
- [ ] TK-001 compose 端口变量化 + 部署脚本参数化 + oci 封装（含 usa dry-run 逐字不变、arm64 实测构建）
- [ ] TK-002 oci-a1 systemd 单元模板 + 状态变化告警脚本
- [ ] TK-003 usa nginx 模板 + nginx-smoke 回归测试
- [ ] TK-004 bootstrap.sh（目录、Node 22 签名校验安装、sqlite3、Funnel 预检）
- [ ] TK-005 seed.sh（密钥搬运、ADMIN_TOKEN 轮换、usa 权限修正、库快照）
- [ ] TK-006 install-units.sh + oci-backup.sh 加 jetscope 段
- [ ] TK-007 cutover.sh（切换 / 回切 / 阶段日志 / 维护片段）
- [ ] TK-008 文档与用户执行清单

## 退出条件
- 所有 TK done
- 所有 CR closed（没有 pending finding）
- Experience 子 Agent 已提取候选规则
- 没有未解释的失败模式
- 交给用户执行的命令清单已在 `docs/DEPLOY-OCI-A1.md` 里定稿
