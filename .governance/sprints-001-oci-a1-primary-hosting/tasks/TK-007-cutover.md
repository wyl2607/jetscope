# TK-007 — cutover.sh：切换 / 回切 / 阶段日志 / 维护片段

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
一条命令完成切换（或回切），失败可定位、可重复执行。

## Context
依赖 TK-003（nginx 模板和冒烟）、TK-005（seed）。review A2（回切先停 usa api）、A3（阶段日志，不自动回退）。usa 改 nginx 前要备份到 `/root/nginx-backup-jetscope-<ts>/`；`nginx -t` 失败要立即恢复备份。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `scripts/oci-a1/cutover.sh`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] 切换：预检（oci-a1 tailnet 冒烟、Funnel 关闭、seed 已完成）→ 打开维护片段 → 最终库同步（usa `.backup` → oci-a1：停 api、替换、起 api、冒烟）→ 装 upstream 和新站点配置，撤维护片段，`nginx -t && reload` → 公网冒烟（含 served-by=oci-a1）
- [ ] 回切 `--rollback`：维护片段 → 停 usa api → oci `.backup` → usa 临时文件 → integrity 和行数校验 → 原子替换（旧库留 `*.pre-rollback-<ts>`）→ 起 usa api → 恢复只有本机 upstream 的站点配置 → 撤维护片段 → 冒烟
- [ ] 每个阶段写 `/var/lib/jetscope-cutover/<ts>/{phases.log,manifest}`；任一步失败就停下并打印恢复命令；不自动回退
- [ ] 切换和回切的 `--dry-run` 都跑通

## 验证命令
```bash
bash scripts/oci-a1/cutover.sh --dry-run
bash scripts/oci-a1/cutover.sh --rollback --dry-run
```

## 状态历史
- 2026-10-22 CST: planned
