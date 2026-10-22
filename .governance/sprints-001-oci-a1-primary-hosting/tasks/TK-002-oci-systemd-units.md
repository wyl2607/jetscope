# TK-002 — oci-a1 systemd 单元模板 + 状态变化告警脚本

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
提供 oci-a1 上 web、SQLite 备份、health-check 的 systemd 单元模板，以及只在状态变化时告警的脚本。

## Context
RFC「架构选择」Web、告警、备份三条；review A4、SEC-03。现有 `infra/server/jetscope-web.service`（root、127.0.0.1）、`jetscope-sqlite-backup.{service,timer}`、`health-check.sh`（`JETSCOPE_BUS_WRITE` 出口，`ALLOW_RESTART` 默认 0）。oci-a1 的告警命令是 `/usr/local/bin/oci-tg-alert "msg"`。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `infra/server/oci-a1/systemd/**`
  - `infra/server/oci-a1/health-alert-on-change.sh`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] `jetscope-web.service`：`User=ubuntu`，`Environment=PATH=/opt/node-22/bin:/usr/local/bin:/usr/bin:/bin`，`next start --hostname 100.81.227.79 --port 3000`，`JETSCOPE_API_BASE_URL=http://100.81.227.79:8000`，`MemoryMax=1G`，`--max-old-space-size=768`，`After/Requires=docker.service`
- [ ] `jetscope-sqlite-backup.{service,timer}`：`User=ubuntu`，`UMask=0077`，复用 `scripts/backup-sqlite.sh`，时间和 oci-backup（UTC 01:41 前后）错开，必须在它之前
- [ ] `jetscope-health-check.{service,timer}`：每分钟，环境变量指向 tailnet 地址，`JETSCOPE_HEALTH_ALLOW_RESTART=0`，`JETSCOPE_BUS_WRITE` 指向告警脚本
- [ ] `health-alert-on-change.sh`：维护一个状态文件，只在 ok↔failed 变化时调 `oci-tg-alert`，消息带主机名和组件
- [ ] `systemd-analyze verify` 在 oci-a1 的 `/tmp` 下通过（只读验证）

## 验证命令
```bash
ssh oci-a1-ts 'cd /tmp/<stage> && systemd-analyze verify ./*.service ./*.timer'
bash -n infra/server/oci-a1/health-alert-on-change.sh
```

## 状态历史
- 2026-10-22 CST: planned
