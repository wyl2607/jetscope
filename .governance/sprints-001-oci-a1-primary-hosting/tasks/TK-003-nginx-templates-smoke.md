# TK-003 — usa nginx 模板 + nginx-smoke 回归测试

> 字段契约对齐 codex-context-standard（Goal / Context / Constraints / Done）。来源：`../RFC.md`。

## Goal
交付 usa nginx 的 upstream、读写分流、来源标识、维护片段模板，并用容器化 nginx 证明它们的行为。

## Context
RFC「协议/接口决策」第 1–4 条；review A1（blocker：变量 `proxy_pass` 带 URI 会吞掉路径）、SEC-05。线上 `sites-enabled/jetscope` 的 location：`/v1/`、`~ ^/(en/|de/)?admin(/|$)`（auth_basic）、`/_next/static/`、`/`；esg 的写法见 `/etc/nginx/conf.d/esg-upstream.conf`。

## Relationship to Existing Systems (RC-002)
- 共存：沿用现有部署链（`deploy-usa-vps.sh`、`backup-sqlite.sh`、`health-check.sh`）和 oci-a1 现有运维件（`oci-tg-alert`、`oci-backup.sh`、coco 拉取）；不替代 `release.sh` / `auto-deploy.sh`。
- 衔接：完成后更新本 Sprint 的 TASKS/CURSOR；文档统一在 TK-008 落地。

## Constraints
- write_scope:
  - `infra/server/oci-a1/nginx/**`
  - `scripts/oci-a1/nginx-smoke.sh`
- 禁止修改：`apps/**`（业务代码）、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**`
- 不在任何远程主机上执行变更（只允许只读勘察，或在 oci-a1 `/tmp` 下做一次性验证）；远程变更都写成脚本交给用户
- 新脚本：`set -Eeuo pipefail`，支持 `--dry-run`（不 ssh 写、不改远程），密钥值不打印、不进日志
- 不跳过 hooks，不做破坏性 git 操作

## Done criteria
- [ ] `jetscope-upstream.conf`：4 个 upstream + `map $request_method` + `map $upstream_addr $jetscope_served_by`
- [ ] `jetscope-site.conf`：从线上 `sites-enabled/jetscope` 改写而来（先只读取回线上文件作为基线），`proxy_pass` 不带 URI，`/admin` 走 `_rw`，加上 `add_header X-JetScope-Served-By`；与线上基线的 diff 单独存一份
- [ ] `jetscope-maintenance.conf`：非 GET/HEAD/OPTIONS 返回 503（带 `Retry-After`）
- [ ] `nginx-smoke.sh`：本地 docker 起 nginx（版本与 usa 一致），用两个假 upstream 模拟 oci 和 usa，逐项断言：路径和 query 保留；oci 正常时读写都到 oci；oci 断开时读请求落到 usa、POST/PUT/DELETE 返回 502；`/admin` 不带凭据返回 401；维护片段打开时写请求返回 503；响应头 served-by 正确
- [ ] `nginx -t` 通过

## 验证命令
```bash
bash scripts/oci-a1/nginx-smoke.sh
```

## 状态历史
- 2026-10-22 CST: planned
- 2026-10-22 21:00 CST: executing（batch-001-001，lane-race：deepseek-v4.1-flash + codex，fallback nemotron:free）
