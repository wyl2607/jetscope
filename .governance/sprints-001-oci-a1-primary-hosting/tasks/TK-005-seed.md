# TK-005 — seed.sh：密钥搬运、ADMIN_TOKEN 轮换、usa 权限修正、库快照

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
把 usa 的配置和数据安全地播种到 oci-a1，同时修正 usa 上的密钥暴露。

## Context
RFC 安全决策 SEC-01：usa 上 `/opt/jetscope/.env`（9 个键，含 `JETSCOPE_ADMIN_TOKEN`）和 `apps/api/.env.api-keys`（含 3 个第三方 key）都是 644，且 usa 上有 3 个可登录的非 root 用户。做法参照 health-talkie cutover 的「mini2 → oci 管道传输、不打印」。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `scripts/oci-a1/seed.sh`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] usa 上两个 env 文件 `chmod 600`（属主不变）
- [ ] `.env` 经管道写到 oci-a1（600），并追加或替换 `JETSCOPE_API_BIND=100.81.227.79`
- [ ] `--rotate-admin-token`：在 oci-a1 用 `openssl rand -hex 32` 生成新令牌，原子替换两台机器 `.env` 里的 `JETSCOPE_ADMIN_TOKEN`；输出只有长度和 sha256 前 8 位；提示用户哪些调用方（如果有）需要更新
- [ ] 库快照：usa 上 `sqlite3 .backup` → 传到 oci-a1 临时文件 → `integrity_check` 加若干关键表行数对比 → `mv` 到 `/opt/jetscope/data/market.db`；oci-a1 上已有非空库时，必须加 `--force-db` 才会覆盖（旧库改名保留）
- [ ] 打印第三方 key 的轮换建议清单（只有键名）
- [ ] `--dry-run` 不改任何东西

## 验证命令
```bash
bash scripts/oci-a1/seed.sh --dry-run
```

## 状态历史
- 2026-10-22 CST: planned
