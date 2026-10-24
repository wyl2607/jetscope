# TK-004 — bootstrap.sh：目录、Node 22 签名校验安装、sqlite3、Funnel 预检

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
让用户一条命令把 oci-a1 准备到可以部署的状态。

## Context
RFC 安全决策 SEC-02、SEC-04；Node 固定为 v22.23.4（linux-arm64）。oci-a1：ubuntu 用户有 sudo 和 docker 组，`/opt` 下已有 esg；系统 node 是 apt 的 v18（不动）。ssh 默认 cwd 是 `/home/ubuntu`（750），以其他用户执行命令前先 `cd /`。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `scripts/oci-a1/bootstrap.sh`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] 预检（只读）：`tailscale serve status` 和 `funnel status` 必须为空，否则中止；磁盘剩余 ≥5G；docker compose 可用
- [ ] `/opt/jetscope`、`/opt/jetscope/data` 属主为 ubuntu，权限 750
- [ ] Node：下载 tarball、`SHASUMS256.txt`、`SHASUMS256.txt.sig`；从 nodejs/release-keys 导入 README 列出的指纹，`gpg --verify` 通过后再校验 sha256，解压到 `/opt/node-22`（已是同版本就跳过）
- [ ] 缺 `sqlite3` 时安装
- [ ] 可重复执行；`--dry-run` 只打印计划和预检结果

## 验证命令
```bash
bash scripts/oci-a1/bootstrap.sh --dry-run
```

## 状态历史
- 2026-10-22 CST: planned
- 2026-10-22 21:00 CST: executing（batch-001-001，lane-race：deepseek-v4.1-flash + codex，fallback nemotron:free）
- 2026-10-22 22:05 CST: lane-race 两份都过了质量门，选用 deepseek 版（每步已满足就跳过、可重复执行，签名和 sha256 双重校验，原子替换并保留 .prev）。Coordinator 在本机实测签名链路：release-keys `main/keys.list` 共 29 把公钥，v22.23.4 的 SHASUMS256 由 `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356` 签名，校验为 Good。待 CR-004 修复：运行时信任 keys.list 里的任意公钥，没有按 RFC 固定签名者指纹；指纹没做格式校验。状态改为 reviewing。
