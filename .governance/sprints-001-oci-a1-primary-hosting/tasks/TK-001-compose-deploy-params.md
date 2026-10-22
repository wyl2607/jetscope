# TK-001 — compose 端口变量化 + 部署脚本参数化 + oci 封装

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
让 `deploy-usa-vps.sh` 可以在不改 usa 默认行为的前提下部署到 oci-a1（非 root、无本机 nginx、tailnet 绑定）。

## Context
RFC「架构选择」第 1、2、4 条。`deploy-usa-vps.sh` 已有 `JETSCOPE_DEPLOY_HOST/REMOTE_DIR/HOST_DATA_DIR/PUBLIC_HOST`；远程 `systemctl` 没有 sudo；冒烟写死 `127.0.0.1` 和本机 nginx。compose 端口写死在 `127.0.0.1:8000:8000`。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `infra/server/docker-compose.prod.yml`
  - `scripts/deploy-usa-vps.sh`
  - `scripts/deploy-oci-a1.sh`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] compose 端口改为 `${JETSCOPE_API_BIND:-127.0.0.1}:8000:8000`
- [ ] `deploy-usa-vps.sh` 加 `$SUDO`、`JETSCOPE_NODE_BIN`、`JETSCOPE_SMOKE_BASE`、`JETSCOPE_EDGE_SMOKE`，默认值等于现行为
- [ ] **不带新变量时 `--dry-run` 输出和改动前逐字相同**（保存 before/after 两份输出并 diff 为空，附进 CR）
- [ ] `scripts/deploy-oci-a1.sh`：设好 oci 变量（`JETSCOPE_DEPLOY_HOST=oci-a1-ts`、`JETSCOPE_NODE_BIN=/opt/node-22/bin`、`JETSCOPE_SMOKE_BASE=100.81.227.79`、`JETSCOPE_EDGE_SMOKE=0`）后 `exec` 主脚本，参数原样透传；它的 `--dry-run` 能跑通
- [ ] arm64 实测（一次性、不部署）：在 oci-a1 的 `/tmp` 下用当前 HEAD 跑 `docker build -f apps/api/Dockerfile` 和 Node v22.23.4 的 `npm ci && npm run web:build`，记录耗时和峰值内存，跑完清理
- [ ] `bash -n`、`shellcheck`（如可用）通过

## 验证命令
```bash
bash scripts/deploy-usa-vps.sh --rebuild --dry-run > /tmp/after.txt  # 与 before 对比
bash scripts/deploy-oci-a1.sh --rebuild --dry-run
bash -n scripts/deploy-usa-vps.sh scripts/deploy-oci-a1.sh
```

## 状态历史
- 2026-10-22 CST: planned
