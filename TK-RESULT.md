# Sprint 001 Round 2（Repairer）结果

- 范围：只修 CR-001 / CR-002 / CR-004 / CR-005 已接受的 finding（A–F）。
- 未触碰：`scripts/oci-a1/cutover.sh`（不存在于本 worktree，也未创建）。
- 未执行：ssh、curl 远程主机、git commit。

## A. `scripts/deploy-usa-vps.sh`（CR-001）

### F1 — 非 loopback 冒烟前校验 `JETSCOPE_API_BIND`
`scripts/deploy-usa-vps.sh:210-220`

在 rebuild heredoc 内、`up -d api` 之前加入检查。heredoc 为未加引号的 `<<REMOTE`，因此 `$SMOKE_BASE` 在**本地**展开后写入远程脚本；`\$host_dir` 这类远程变量仍保持转义。`SMOKE_BASE == 127.0.0.1`（usa 默认）时整段跳过：

```bash
if [ "$SMOKE_BASE" != "127.0.0.1" ]; then
  if ! grep -qxF "JETSCOPE_API_BIND=$SMOKE_BASE" .env; then
    echo "ERROR: .env is missing JETSCOPE_API_BIND=$SMOKE_BASE (...)" >&2
    exit 1
  fi
  echo "ok: .env binds the API to $SMOKE_BASE"
fi
```

检查放在 build / SQLite stop 之前，避免先换容器再失败。

### F3 — journalctl 使用 `$SUDO` 且不误报
`scripts/deploy-usa-vps.sh:363`

```bash
\$SUDO journalctl -u jetscope-web.service -n 40 --no-pager || true
```

### F4 — NODE_BIN 非空时 dry-run 显示 `[sudo]`
`scripts/deploy-usa-vps.sh:115-121`

```bash
elif [[ -n "$NODE_BIN" ]]; then
  echo "would: npm run web:build && [sudo] systemctl restart jetscope-web.service"
else
  echo "would: npm run web:build && systemctl restart jetscope-web.service"
fi
```

usa 默认（`NODE_BIN` 为空）一行未改，基线比对见下。

## B. `scripts/oci-a1/bootstrap.sh`（CR-004 F1–F6、CR-001 F2、NODE_SIGNER_FPRS）

- **F1**：`scripts/oci-a1/bootstrap.sh:125-136` — 去掉 `|| true` 和“空输出即通过”。现在要求 `sudo -n tailscale <kind> status` 退出码为 0 **且** 输出包含 `No serve config`，否则打印原输出并 abort。
- **F2**：`scripts/oci-a1/bootstrap.sh:122-123` — `sudo -n true` 移到 tailscale 预检之前；tailscale 调用改为 `sudo -n`。
- **F3**：`scripts/oci-a1/bootstrap.sh:234-237` — `tar` 加 `--no-same-owner`，解压后 `sudo chown -R root:root "$PREFIX.new"`（失败即 abort）。
- **F4**：`scripts/oci-a1/bootstrap.sh:256-263` — `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y sqlite3 </dev/null`；失败时先 `apt-get update </dev/null`，再重试一次安装。
- **F5**：`scripts/oci-a1/bootstrap.sh:59-71` — 在本地（ssh 之前）校验 `NODE_VERSION` 匹配 `^v22\.[0-9]+\.[0-9]+$`，并逐项校验 `NODE_SIGNER_FPRS` 匹配 `^[A-F0-9]{40}$`；不合法则 `exit 1`。
- **F6**：`scripts/oci-a1/bootstrap.sh:177` — 远程 `cleanup()` 增加 `sudo rm -rf "$PREFIX.new"`。
- **CR-001 F2**：`scripts/oci-a1/bootstrap.sh:144-145` — 预检 `docker compose version` 改为 `docker info >/dev/null 2>&1`（连 daemon，验证 docker.sock 可达）。
- dry-run 文本同步：`:80-84`（sudo 在前、tailscale 需退出码 0 + `No serve config`、`docker info`）、`:85`（sqlite3 失败后 update 重试）。

## C. `infra/server/oci-a1/systemd/`（CR-002 F1、F2）

- **F1**：`infra/server/oci-a1/systemd/jetscope-health-check.timer:3-4`、`jetscope-sqlite-backup.timer:3-4` — 删除 `[Unit]` 中的 `Requires=`；保留 `[Timer] Unit=`。
- **F2**：
  - 新增 `infra/server/oci-a1/systemd/jetscope-alert@.service:1-9`（`Type=oneshot`，`ExecStart=/usr/local/bin/oci-tg-alert "jetscope unit failed: %i on %H"`）。
  - `infra/server/oci-a1/systemd/jetscope-sqlite-backup.service:5` — `[Unit]` 增加 `OnFailure=jetscope-alert@%n.service`，删除 `ConditionPathExists=`（库缺失时由脚本报错并触发告警）。

## D. `infra/server/oci-a1/health-alert-on-change.sh`（CR-002 F3）

`infra/server/oci-a1/health-alert-on-change.sh:170`

```bash
DETAIL="$(printf '%s' "$DETAIL" | tr '\n\r' '  ' | cut -c1-800)"
```

## E. `scripts/oci-a1/install-units.sh`（适配 C）

- `scripts/oci-a1/install-units.sh:53-60` — 不再写死列表：用 `find "$UNIT_SRC" -maxdepth 1 -type f \( -name '*.service' -o -name '*.timer' \)` 枚举全部单元（含 `*@.service`），排序后装入 `UNIT_FILES`；为空则退出。
- `scripts/oci-a1/install-units.sh:197-220` — verify 时对 `*@.service` 复制出测试实例 `jetscope-alert@test.service` 交给 `systemd-analyze verify`，通过后删除该临时实例；普通单元仍批量 verify。
- `:101,109` — dry-run 说明模板单元的验证方式与“不启用”事实；文件列表改为实际枚举结果（含 `jetscope-alert@.service`）。
- 启用逻辑未改：只 `enable --now` 两个 timer；web 与 alert 模板都不启用。
- `:28-30` 头部“Installed files”改为目录级描述。

## F. `scripts/oci-a1/seed.sh`（CR-005 C2、F1）

- **C2**：`scripts/oci-a1/seed.sh:287` — usa 重启命令改为 `docker-compose -f docker-compose.prod.yml up -d api`（v1）；dry-run 文本 `:85` 同步。
- **F1**：`scripts/oci-a1/seed.sh:293-309` — 不再用可预测的 `/tmp/jetscope-seed.$$.$RANDOM.db`。远程 `sudo mktemp /root/jetscope-seed.XXXXXX.db` 创建，实际路径回传本地 `USA_DUMP`；后续 `sudo sqlite3 .backup`、`sudo cat`、行数统计与 cleanup 都用该路径（`sudo rm -f`，`:119-127`）。
- `scripts/oci-a1/seed.sh:324-347` — `table_counts` 增加 `use_sudo` 参数：usa 快照在 `/root` 下用 `sudo sqlite3` 读取，oci 副本保持原行为；调用处 `:347-348` 分别传 `1` / `0`。

## 验证输出

### bash -n

```text
$ bash -n scripts/deploy-usa-vps.sh scripts/oci-a1/*.sh infra/server/oci-a1/health-alert-on-change.sh
SYNTAX_OK
```

### shellcheck

```text
$ shellcheck -S warning scripts/oci-a1/*.sh infra/server/oci-a1/health-alert-on-change.sh
shellcheck rc=0
```

### deploy-usa-vps dry-run 与基线

```text
$ bash -c 'for a in "--rebuild --dry-run" "--rebuild --api-only --dry-run" "--dry-run"; do echo "### $a"; bash scripts/deploy-usa-vps.sh $a 2>&1; echo "rc=$?"; done' | sed "s|$PWD|<ROOT>|g" | diff - .governance/sprints-001-oci-a1-primary-hosting/metrics/baseline/deploy-usa-vps.dryrun.txt && echo IDENTICAL
IDENTICAL
```

### deploy-oci-a1 dry-run

```text
$ bash scripts/deploy-oci-a1.sh --rebuild --dry-run
==> DRY-RUN: no SSH, no rsync, no docker, no remote changes
host=oci-a1-ts
remote_dir=/opt/jetscope
host_data_dir=/opt/jetscope/data
container=jetscope-api
container_db=/app/data/market.db
rebuild=1 api_only=0 allow_unmerged=0 allow_empty_db=0
node_bin=/opt/node-22/bin (prepended to PATH for the remote web build)
would: rsync /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/ -> oci-a1-ts:/opt/jetscope/ (excludes .env, data/*.db, data/*.sqlite; no --delete)
would: record HEAD in /opt/jetscope/.deploy-commit
would: docker compose -f docker-compose.prod.yml build api   # old container keeps serving
would: mkdir -p /opt/jetscope/data
would: if /opt/jetscope/data/market.db is non-empty: skip docker cp (idempotent; never overwrite)
would: else if jetscope-api is missing, or /app/data/market.db is missing or empty: fail with exit 1 (use --allow-empty-db to continue)
would: else: PRAGMA wal_checkpoint(FULL); docker stop jetscope-api; docker cp market.db and non-empty -wal/-shm to /opt/jetscope/data
would: JETSCOPE_HOST_DATA_DIR=/opt/jetscope/data docker compose -f docker-compose.prod.yml up -d api
would: npm run web:build && [sudo] systemctl restart jetscope-web.service
would: skip host nginx edge probes (JETSCOPE_EDGE_SMOKE=0)
would: remote smoke against 100.81.227.79:8000 and 100.81.227.79:3000
rc=0
```

### 非法 NODE_VERSION

```text
$ NODE_VERSION='v22.1.1;id' bash scripts/oci-a1/bootstrap.sh --dry-run; echo "rc=$?"
ERROR: NODE_VERSION='v22.1.1;id' does not match ^v22\.[0-9]+\.[0-9]+$
rc=1 (必须非 0)
```

### bootstrap dry-run

```text
$ bash scripts/oci-a1/bootstrap.sh --dry-run
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79 standby=usa-vps node_version=v22.23.4
node signer fingerprints (NODE_SIGNER_FPRS): 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would: ssh -o BatchMode=yes oci-a1-ts bash -s -- v22.23.4 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would: cd / (ubuntu home is 750)
would: preflight (read-only, abort on any failure):
would:   sudo -n true
would:   sudo -n tailscale serve status  -> exit 0 and contains 'No serve config'
would:   sudo -n tailscale funnel status -> exit 0 and contains 'No serve config'
would:   df -Pk / -> available KiB >= 5242880 (5 GiB)
would:   docker info (proves the daemon socket is reachable)
would: ensure /opt/jetscope and /opt/jetscope/data are ubuntu:ubuntu 750
would: if /opt/node-22/bin/node --version != v22.23.4:
would:   download https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-arm64.tar.xz
would:   download https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
would:   download https://nodejs.org/dist/v22.23.4/SHASUMS256.txt.sig
would:   download https://raw.githubusercontent.com/nodejs/release-keys/main/keys.list
would:   import each https://raw.githubusercontent.com/nodejs/release-keys/main/keys/<fingerprint>.asc
would:   into a temporary GNUPGHOME, then gpg --batch --status-fd 1 --verify SHASUMS256.txt.sig SHASUMS256.txt
would:   read the primary key fingerprint (last field of the [GNUPG:] VALIDSIG line)
would:   abort unless that fingerprint is one of: 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would:   grep ' node-v22.23.4-linux-arm64.tar.xz$' SHASUMS256.txt | sha256sum -c -
would:   extract to /opt/node-22.new, keep the old tree as /opt/node-22.prev, then rename
would:   assert /opt/node-22/bin/node --version == v22.23.4
would: else print ok: node v22.23.4 already installed
would: if sqlite3 is missing: sudo apt-get install -y sqlite3 (retry after apt-get update on failure)
would: else print ok: sqlite3 already installed
would: print summary: node version, /opt/jetscope modes, serve/funnel status
rc=0
```

### install-units dry-run

```text
$ bash scripts/oci-a1/install-units.sh --dry-run
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79
would: ssh -o BatchMode=yes oci-a1-ts true
would: preflight (read-only, abort on the first two failures):
would:   test -d /opt/jetscope (abort if missing)
would:   test -x /opt/node-22/bin/node (abort if missing)
would:   test -x /usr/local/bin/oci-tg-alert (warn only if missing)
would: stage=$(ssh oci-a1-ts mktemp -d /tmp/jetscope-units.XXXXXX)
would: scp -q these files to $stage:
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/systemd/jetscope-alert@.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/systemd/jetscope-health-check.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/systemd/jetscope-health-check.timer
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/systemd/jetscope-sqlite-backup.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/systemd/jetscope-sqlite-backup.timer
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/systemd/jetscope-web.service
would:   /Users/yumei/fleet/jr-oci-rev/REPAIR-R2/infra/server/oci-a1/health-alert-on-change.sh
would: sudo systemd-analyze verify $stage/*.service $stage/*.timer
would: template units (*@.service) are verified through a test instance name
would: for each unit: sudo cmp -s $stage/<name> /etc/systemd/system/<name>; install -o root -g root -m 644 when different
would: sudo cmp -s $stage/health-alert-on-change.sh /usr/local/bin/jetscope-health-alert-on-change; install -o root -g root -m 755 when different
would: sudo systemctl daemon-reload (only if any installed file changed)
would: sudo systemctl enable --now jetscope-sqlite-backup.timer jetscope-health-check.timer
would: sudo systemctl list-timers --all (filter jetscope-sqlite-backup.timer jetscope-health-check.timer)
would: print is-enabled/is-active for jetscope-sqlite-backup.timer, jetscope-health-check.timer and jetscope-web.service
would: remove $stage
note: template units such as jetscope-alert@.service are installed but never enabled
note: jetscope-web.service is installed but not enabled; enable it manually before the first deploy:
note:   sudo systemctl enable --now jetscope-web.service
rc=0
```

### seed dry-run

```text
$ bash scripts/oci-a1/seed.sh --dry-run --rotate-admin-token --force-db
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
would: note that the usa api needs 'docker-compose -f docker-compose.prod.yml up -d api' and oci takes effect at deploy
==> 5/6 market.db snapshot
would: on usa-vps: dump=$(sudo mktemp /root/jetscope-seed.XXXXXX.db); sudo sqlite3 /opt/jetscope/data/market.db ".backup $dump"
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

### timer 中不得再有 Requires=

```text
$ grep -n "Requires=" infra/server/oci-a1/systemd/*.timer
（无输出）
```

## 剩余风险

- 未 ssh / 未在真实主机跑 bootstrap、install-units、seed，也未在 Linux 上跑 `systemd-analyze verify`；这些脚本的远程分支只有 `bash -n` + shellcheck + dry-run 证据。
- `seed.sh` 的 `/root` 快照依赖 usa 上 `sudo -n`（与 deploy 脚本已有的 sudo 前提一致）；若 usa 改为需要密码的 sudo，该步骤会失败而不是静默回退。
