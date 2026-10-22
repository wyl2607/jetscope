# TK-006 — install-units.sh + oci-backup.sh 加 jetscope 段

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
把 TK-002 的单元安装到 oci-a1，并让 jetscope 备份进入 coco 拉取链。

## Context
依赖 TK-002。安装脚本风格参照 `~/oci-a1-deploy/health-talkie/install.sh`（暂存到 /tmp、verify、cmp 后 install、daemon-reload、enable）。`/usr/local/bin/oci-backup.sh` 的源文件在 `~/oci-a1-deploy/oci-backup.sh`（仓库外，现有 esg、commute 两段，`ocibak` 组可读）。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `scripts/oci-a1/install-units.sh`
  - `~/oci-a1-deploy/oci-backup.sh（仓库外）`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] `install-units.sh [--dry-run]`：装 web、backup timer、health-check timer；需要的告警脚本装到 `/usr/local/bin`；每个文件都有 cmp 判断，可重复执行；**不 enable web**（由 cutover 前的部署启动），只 enable 两个 timer
- [ ] oci-backup.sh 加 jetscope 段：取 `/opt/jetscope/data/backups` 里最新一份，校验 gzip 完整性后拷入快照；不复制 `.env`
- [ ] oci-backup.sh 改动另附一个安装命令（用户执行）和回退方法

## 验证命令
```bash
bash scripts/oci-a1/install-units.sh --dry-run
bash -n ~/oci-a1-deploy/oci-backup.sh
```

## 状态历史
- 2026-10-22 CST: planned
- 2026-10-22 23:41 CST: lane-chain 由 deepseek-v4.1-flash 一次过了质量门，已合并。Coordinator 预检：单元列表写死了（R2 要新增 jetscope-alert@.service → 并入 R2，改为安装 systemd 目录下的全部文件）；health-check timer 必须在第一次部署之后再启用，否则会先发一次故障告警（写进 TK-008 文档的执行顺序）。oci-backup.sh（仓库外）的 jetscope 段由 Coordinator 自己改，尚未完成。状态改为 reviewing。
