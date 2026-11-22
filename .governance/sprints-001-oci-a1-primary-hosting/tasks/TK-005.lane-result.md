# TK-005 结果：`scripts/oci-a1/seed.sh`

日期：2026-10-22
状态：done（仅本地静态验证 + dry-run；未连接任何远程主机）

## 改动文件

| 文件 | 说明 |
| --- | --- |
| `scripts/oci-a1/seed.sh` | 新增。预检 → usa env 改 600 → env 管道搬运并注入 `JETSCOPE_API_BIND` → 可选 ADMIN_TOKEN 轮换 → market.db 在线快照/校验/落位 → 第三方 key 名清单。支持 `--dry-run`（完全本地）`--rotate-admin-token` `--force-db`。 |
| `TK-RESULT.md` | 本报告。 |

未修改 `.governance/**`、`apps/**`、`scripts/release.sh`、`scripts/auto-deploy.sh`、`.github/**` 或任何其它文件；临时模拟目录 `.tmp/` 已删除。

## 关键实现说明

- 主机名统一走变量：`OCI=${JETSCOPE_OCI_HOST:-oci-a1-ts}`、`OCI_IP=${JETSCOPE_OCI_IP:-100.81.227.79}`、`USA=${JETSCOPE_USA_HOST:-usa-vps}`；所有 SSH 都带 `-o BatchMode=yes -o ConnectTimeout=12`。
- 密钥搬运只用管道：`ssh $USA cat <src> | ssh $OCI 'mktemp -> install -m 600 /dev/stdin -> sha256 对比 -> mv'`；本进程只捕获目标临时路径和哈希，不把文件内容写入本地磁盘。
- 每个 env 文件在 `mv` 前比对**完整 sha256**（源端 vs oci 临时文件），失败即中止；终端只打印行数和 sha256 前 8 位。
- `.env` 的 `JETSCOPE_API_BIND` 用 awk 重写：存在则替换，不存在则追加；临时文件 `chmod 600` 后 `mv`。
- ADMIN_TOKEN 在 oci-a1 上用 `openssl rand -hex 32` 生成，先原子替换 oci 的 `.env`，再把令牌通过 `ssh $OCI cat <token-temp> | ssh $USA ...` 写入 usa 的 `.env`（同样临时文件 + `mv`，保持 600）。两端只输出长度和 sha256 前 8 位，并断言一致；令牌临时文件在 `trap ... EXIT` 中清理。
- 库快照：`sqlite3 .backup` → 管道到 `/opt/jetscope/data/.market.db.incoming` → `PRAGMA integrity_check` 必须为 `ok` → 用 `sqlite_master` 列出全部表，在 usa 快照与 oci 副本上逐表 `count(*)`，完全一致才继续 → 已有非空 `market.db` 时无 `--force-db` 中止，有则改名为 `market.db.pre-seed-<UTC>`（重名自动加序号）→ `mv` 新库，`640 ubuntu:ubuntu`。usa 快照与 oci 的 `.incoming` 由 EXIT trap 清理。
- 第 6 步只打印 `.env.api-keys` 中键名（`toupper($1)` 匹配 `KEY|TOKEN|SECRET`），不打印值。
- `--dry-run` 在任何 SSH 之前分支退出，只打印计划。

## 验证命令与结果原文

### `bash -n scripts/oci-a1/seed.sh`

```text
(no output)
rc=0
```

### `shellcheck -S warning scripts/oci-a1/seed.sh`

```text
(no output)
rc=0
```

### 额外证明 dry-run 不 ssh

用退出码 99 的假 `ssh` 遮蔽 PATH 后跑 dry-run：

```text
PATH="$PWD/.tmp/bin:$PATH" bash scripts/oci-a1/seed.sh --dry-run >/dev/null
rc=0
```

（若调用了 ssh 会返回 99。）

### `bash scripts/oci-a1/seed.sh --dry-run`

```text
==> DRY-RUN: no SSH, no network, no local or remote changes
hosts: usa=usa-vps oci=oci-a1-ts (100.81.227.79)
flags: rotate_admin_token=0 force_db=0
==> 1/6 preflight (read-only)
would: ssh -o BatchMode=yes usa-vps -> check /opt/jetscope/.env, /opt/jetscope/apps/api/.env.api-keys, /opt/jetscope/data/market.db exist
would: ssh -o BatchMode=yes oci-a1-ts -> check /opt/jetscope exists, is writable, sqlite3 is on PATH
would: abort on the first missing prerequisite
==> 2/6 usa permissions
would: on usa-vps: chmod 600 /opt/jetscope/.env /opt/jetscope/apps/api/.env.api-keys (owners unchanged)
would: print mode and owner before and after each chmod
==> 3/6 env files -> oci-a1
would: ssh usa-vps cat /opt/jetscope/.env | ssh oci-a1-ts 'mkdir -p ... && install -m 600 /dev/stdin <tmp> && mv <tmp> /opt/jetscope/.env'
would: verify the copied file's sha256 against the source before mv
would: on oci-a1-ts: replace or append JETSCOPE_API_BIND=100.81.227.79 in /opt/jetscope/.env (mode 600)
would: ssh usa-vps cat /opt/jetscope/apps/api/.env.api-keys | ssh oci-a1-ts 'mkdir -p ... && install -m 600 /dev/stdin <tmp> && mv <tmp> /opt/jetscope/apps/api/.env.api-keys'
would: print line count and sha256 prefix for both oci files
==> 4/6 rotate JETSCOPE_ADMIN_TOKEN: skipped (--rotate-admin-token not given)
==> 5/6 market.db snapshot
would: on usa-vps: sqlite3 /opt/jetscope/data/market.db '.backup /tmp/<random>.db'
would: ssh usa-vps cat <snapshot> | ssh oci-a1-ts 'cat > /opt/jetscope/data/.market.db.incoming'
would: on oci-a1-ts: PRAGMA integrity_check must return ok
would: list every table from sqlite_master on both the usa snapshot and the oci copy, count(*) each, abort on any difference
would: if /opt/jetscope/data/market.db is non-empty, abort and ask for --force-db (old db is never overwritten silently)
would: on oci-a1-ts: mv /opt/jetscope/data/.market.db.incoming /opt/jetscope/data/market.db, mode 640, owner ubuntu:ubuntu
would: remove the usa snapshot and /opt/jetscope/data/.market.db.incoming
==> 6/6 third-party keys
would: read key names from /opt/jetscope/apps/api/.env.api-keys and list only those containing KEY, TOKEN or SECRET (no values)
rc=0
```

### `bash scripts/oci-a1/seed.sh --dry-run --rotate-admin-token --force-db`

```text
==> DRY-RUN: no SSH, no network, no local or remote changes
hosts: usa=usa-vps oci=oci-a1-ts (100.81.227.79)
flags: rotate_admin_token=1 force_db=1
==> 1/6 preflight (read-only)
would: ssh -o BatchMode=yes usa-vps -> check /opt/jetscope/.env, /opt/jetscope/apps/api/.env.api-keys, /opt/jetscope/data/market.db exist
would: ssh -o BatchMode=yes oci-a1-ts -> check /opt/jetscope exists, is writable, sqlite3 is on PATH
would: abort on the first missing prerequisite
==> 2/6 usa permissions
would: on usa-vps: chmod 600 /opt/jetscope/.env /opt/jetscope/apps/api/.env.api-keys (owners unchanged)
would: print mode and owner before and after each chmod
==> 3/6 env files -> oci-a1
would: ssh usa-vps cat /opt/jetscope/.env | ssh oci-a1-ts 'mkdir -p ... && install -m 600 /dev/stdin <tmp> && mv <tmp> /opt/jetscope/.env'
would: verify the copied file's sha256 against the source before mv
would: on oci-a1-ts: replace or append JETSCOPE_API_BIND=100.81.227.79 in /opt/jetscope/.env (mode 600)
would: ssh usa-vps cat /opt/jetscope/apps/api/.env.api-keys | ssh oci-a1-ts 'mkdir -p ... && install -m 600 /dev/stdin <tmp> && mv <tmp> /opt/jetscope/apps/api/.env.api-keys'
would: print line count and sha256 prefix for both oci files
==> 4/6 rotate JETSCOPE_ADMIN_TOKEN
would: on oci-a1-ts: openssl rand -hex 32, atomically replace JETSCOPE_ADMIN_TOKEN= in /opt/jetscope/.env (mode 600)
would: ssh oci-a1-ts 'cat <token temp>' | ssh usa-vps 'atomically replace JETSCOPE_ADMIN_TOKEN= in /opt/jetscope/.env (mode 600)'
would: print both token lengths and sha256 prefixes, assert they match
would: note that the usa api needs 'docker compose -f docker-compose.prod.yml up -d api' and oci takes effect at deploy
==> 5/6 market.db snapshot
would: on usa-vps: sqlite3 /opt/jetscope/data/market.db '.backup /tmp/<random>.db'
would: ssh usa-vps cat <snapshot> | ssh oci-a1-ts 'cat > /opt/jetscope/data/.market.db.incoming'
would: on oci-a1-ts: PRAGMA integrity_check must return ok
would: list every table from sqlite_master on both the usa snapshot and the oci copy, count(*) each, abort on any difference
would: --force-db: if /opt/jetscope/data/market.db is non-empty, rename it to /opt/jetscope/data/market.db.pre-seed-<UTC timestamp>
would: on oci-a1-ts: mv /opt/jetscope/data/.market.db.incoming /opt/jetscope/data/market.db, mode 640, owner ubuntu:ubuntu
would: remove the usa snapshot and /opt/jetscope/data/.market.db.incoming
==> 6/6 third-party keys
would: read key names from /opt/jetscope/apps/api/.env.api-keys and list only those containing KEY, TOKEN or SECRET (no values)
rc=0
```

### 本地片段自测（不涉及远程）

在 `.tmp/` 中用假文件/假库验证了：`mktemp + cat + chmod 600 + mv` 的引号路径、`JETSCOPE_API_BIND` 替换/追加、`printf %q` 包裹的多行远程脚本配合 stdin 传令牌（`bash -c` 形式）、`sqlite_master` 全表计数（含带空格表名）、`PRAGMA integrity_check`、key 名过滤。结果均符合预期；`.tmp/` 已删除。

## 与 TK Done criteria 对照

| Done criteria | 状态 | 对应实现 |
| --- | --- | --- |
| usa 上两个 env 文件 `chmod 600`（属主不变） | 满足 | 第 2 步，打印前后 `mode owner:group` |
| `.env` 管道写到 oci-a1（600），追加或替换 `JETSCOPE_API_BIND=100.81.227.79` | 满足 | 第 3 步 `transfer_file` + awk 重写，`mv` 前比对完整 sha256 |
| `--rotate-admin-token`：oci 上 `openssl rand -hex 32`，原子替换两端，输出只有长度+sha 前 8 位，提示调用方更新 | 满足 | 第 4 步；只打印长度/前缀；提示重启 usa api、oci 部署生效、更新其它持有旧令牌的调用方 |
| 库快照：`.backup` → 传输 → `integrity_check` + 全表行数对比 → `mv`；非空旧库需 `--force-db`，旧库改名保留 | 满足 | 第 5 步；旧库名为 `market.db.pre-seed-<UTC>`，重名加序号 |
| 打印第三方 key 轮换清单（只有键名） | 满足 | 第 6 步，`toupper` 匹配 KEY/TOKEN/SECRET |
| `--dry-run` 不改任何东西 | 满足 | 在 SSH 之前退出；用假 `ssh` 验证未调用 |
| 报告 `TK-RESULT.md` | 满足 | 本文件 |

## 已知遗留风险

1. **没有对真实主机执行过**：按要求只做了静态检查和 dry-run。远程路径、`install -m 600 /dev/stdin`（Ubuntu GNU coreutils）、`sqlite3 -readonly`、`chown ubuntu:ubuntu` 等都依赖宿主环境，首次实跑需要人工观察。
2. **oci `.env` 被 usa `.env` 整体替换**：这是任务要求的行为；oci 上如果原本有 usa 没有的键，会被覆盖（`JETSCOPE_API_BIND` 除外，它是注入的）。首次在 oci 实跑前若已有手工配置，需先确认。
3. **令牌临时文件窗口**：oci 上 `/opt/jetscope/.admin-token.seed.XXXXXX`（600）在两台 `.env` 都更新后被删除；正常失败路径由 EXIT trap 清理，但 `SIGKILL` 可能留下该文件。令牌仍只在两台主机与本地进程内存中出现。
4. **轮换后 usa API 必须手动重启**（脚本只提示，不执行），否则 usa 仍用旧令牌。
5. **`--force-db` 落位窗口**：旧库先改名、新库再 `mv`，两步之间 `/opt/jetscope/data/market.db` 不存在；若此时中断，需要人工把 `market.db.pre-seed-<ts>` 改回。旧库不会被删除或覆盖。
6. **行数对比基准**：为避免线上写入造成误报，对比的是 usa 的 `.backup` 快照与 oci 的 `.incoming` 副本（同一时刻、同一文件），而不是 usa 活库；传输完整性同时由 `integrity_check` 和全表计数保证。env 文件则在 `mv` 前做了完整 sha256 对比。
7. **`chmod 600` 只作用于文件本身**：父目录权限、ACL、已有的非 root 登录用户（SEC-01 的背景）不由本脚本处理。
8. 密钥值不会打印/落本地盘，但按任务指定的管道方式会经过 MacBook 上 `ssh` 进程的内存。
