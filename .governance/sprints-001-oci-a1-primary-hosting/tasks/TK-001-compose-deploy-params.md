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
- 2026-10-22 21:00 CST: executing（batch-001-001，lane-race：deepseek-v4.1-flash + codex，fallback nemotron:free）
- 2026-10-22 21:10 CST: Coordinator 在 oci-a1 /tmp 一次性实测 arm64（HEAD ed1b006，Node v22.23.4）：`docker build apps/api` 通过，耗时 50s；`npm ci` 耗时 10.6s，内存峰值 350MB；`npm run web:build` 通过，耗时 65.7s，内存峰值 505MB（`--max-old-space-size=768`）。现场已清理。Done criteria 的 arm64 一项已满足。
- 2026-10-22 21:40 CST: lane-race 两份都过了质量门（codex、deepseek-v4.1-flash），选用 deepseek 版。理由：非默认值时 dry-run 如实打印冒烟地址和跳过项；codex 版在部署 oci 时 dry-run 仍显示 127.0.0.1，会误导。
- 2026-10-22 21:40 CST: **纠正 RFC/brief 的错误（被证伪）**：生产用的是仓库根目录的 `docker-compose.prod.yml`（usa 上容器的 compose 标签 `config_files=docker-compose.prod.yml`、`working_dir=/opt/jetscope` 可以证实），不是 `infra/server/docker-compose.prod.yml`。端口变量改到根目录文件的 api 服务上；infra/server 那份不动。在 oci-a1 上用 `docker compose config` 验证：变量不设或为空时绑 127.0.0.1，设为 100.81.227.79 时绑 tailnet IP。合并后重跑质量门：usa 默认 dry-run 输出逐字相同（IDENTICAL）。状态改为 reviewing。
