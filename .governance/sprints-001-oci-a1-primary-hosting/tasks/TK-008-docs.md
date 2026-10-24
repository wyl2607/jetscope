# TK-008 — 文档与用户执行清单

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
让用户和以后的会话能照着文档完成部署、切换、发布、回切，并理解这套拓扑的契约。

## Context
依赖 TK-001..007。RFC 全文；写入口契约（新写路由必须是非 GET）；停热备的判定指标。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `docs/DEPLOY-OCI-A1.md`
  - `docs/DEPLOY_USA_VPS.md`
  - `docs/PRODUCTION_RISK_REGISTER.md`
  - `OPERATIONS.md`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] `docs/DEPLOY-OCI-A1.md`：拓扑图、用户按顺序执行的命令清单（bootstrap → seed → deploy-oci-a1 → install-units → cutover），每步的验证和回退方法，写入口契约，Tailscale ACL 建议，停热备的判定指标
- [ ] `OPERATIONS.md` 和 `DEPLOY_USA_VPS.md`：标明 usa 现在是热备，发布顺序是先 oci-a1 再 usa
- [ ] `PRODUCTION_RISK_REGISTER.md`：新增 tailnet 依赖、主库只有一份、热备数据滞后三条风险
- [ ] markdownlint 通过（仓库有 `scripts/markdownlint-pr-gate.py`）

## 验证命令
```bash
python3 scripts/markdownlint-pr-gate.py  # 以脚本实际用法为准
```

## 状态历史
- 2026-10-22 CST: planned
