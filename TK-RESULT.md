# TK-RESULT — Sprint 001 Round 6（Repairer）

日期：2026-10-22 CST
范围：CR-002 N1（major）、CR-004 N3（nit）

## 改动文件

| 文件 | 说明 |
| --- | --- |
| `infra/server/oci-a1/health-alert-on-change.sh` | status=ok 时 api 只按 `api=200` 判定为 ok，删除 `readiness=200` 的要求与日志里的 readiness 码，和 health-check.sh（REQUIRE_READINESS 默认 0，只看 liveness）一致；头部注释同步说明 readiness 是单词而非状态码。 |
| `scripts/oci-a1/bootstrap.sh` | 本地仍按空格拆分并逐项校验指纹，再拼成逗号分隔的单个参数传给远端；远端用 `IFS=, read -ra` 拆开，按列表逐项匹配 VALIDSIG 主指纹；dry-run 的 ssh 文案同步为逗号形式。 |
| `TK-RESULT.md` | 本报告。 |

未触碰 `.governance/**`、`apps/**`、`scripts/release.sh`、`scripts/auto-deploy.sh` 或任何其他文件；未 ssh/curl 远程主机；未 git commit。

## 验证命令与结果原文

### 1. 语法与 shellcheck

```bash
$ bash -n infra/server/oci-a1/health-alert-on-change.sh scripts/oci-a1/bootstrap.sh
$ shellcheck -S warning infra/server/oci-a1/health-alert-on-change.sh scripts/oci-a1/bootstrap.sh
rc=0
```

### 2. 默认 dry-run

```bash
$ bash scripts/oci-a1/bootstrap.sh --dry-run
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79 standby=usa-vps node_version=v22.23.4
node signer fingerprints (NODE_SIGNER_FPRS): 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
would: ssh -o BatchMode=yes oci-a1-ts bash -s -- v22.23.4 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356
...（其余计划行略，rc=0）
rc=0
```

### 3. 两个指纹的 dry-run（N3 重点）

```bash
$ NODE_SIGNER_FPRS="5BE8A3F6C8A5C01D106C0AD820B1A390B168D356 4ED778F539E3634C779C87C6D7062848A1AB005C" \
    bash scripts/oci-a1/bootstrap.sh --dry-run | sed -n '1,5p'
==> DRY-RUN: no SSH, no network, no remote changes
host=oci-a1-ts ip=100.81.227.79 standby=usa-vps node_version=v22.23.4
node signer fingerprints (NODE_SIGNER_FPRS): 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356 4ED778F539E3634C779C87C6D7062848A1AB005C
would: ssh -o BatchMode=yes oci-a1-ts bash -s -- v22.23.4 5BE8A3F6C8A5C01D106C0AD820B1A390B168D356,4ED778F539E3634C779C87C6D7062848A1AB005C
rc=0
```

远端拆分逻辑的本地等价验证（`IFS=, read -ra`）：

```bash
$ bash -c 'NODE_SIGNER_FPRS="5BE8A3F6C8A5C01D106C0AD820B1A390B168D356,4ED778F539E3634C779C87C6D7062848A1AB005C"; IFS=, read -r -a L <<< "$NODE_SIGNER_FPRS"; echo "count=${#L[@]} second=${L[1]}"'
count=2 second=4ED778F539E3634C779C87C6D7062848A1AB005C
```

本地逐项校验仍生效：

```bash
$ NODE_SIGNER_FPRS="not-a-fpr" bash scripts/oci-a1/bootstrap.sh --dry-run
ERROR: NODE_SIGNER_FPRS contains an invalid fingerprint: 'not-a-fpr'
rc=1
```

### 4. N1 告警链路模拟（临时状态目录 + 假告警命令）

方法：在工作目录内建 `.tmp/state` 作为 `JETSCOPE_ALERT_STATE_DIR`，`.tmp/alert.sh` 作为 `OCI_TG_ALERT` 把消息追加到 `.tmp/alerts.log`；依次喂入 5 个事件（与 health-check.sh 实际 payload 形状一致），结束后删除 `.tmp/`。

```bash
$ export JETSCOPE_ALERT_STATE_DIR="$PWD/.tmp/state" OCI_TG_ALERT="$PWD/.tmp/alert.sh"
$ bash infra/server/oci-a1/health-alert-on-change.sh health-check --producer health-check --payload '<event>'
```

事件与输出原文：

```text
--- event 1: failed(api)
jetscope-health-alert: alerted: [localhost] jetscope-api ok -> failed: status=failed producer=health-check summary=api unhealthy, restart disabled error=liveness=000 readiness=unknown
   alerts so far: 1

--- event 2: ok api=000 readiness=unknown web=200
jetscope-health-alert: status=ok but api=000; api state unchanged
jetscope-health-alert: web still ok (status=ok); no alert
   alerts so far: 1

--- event 3: ok api=200 readiness=ready web=200
jetscope-health-alert: alerted: [localhost] jetscope-api failed -> ok: status=ok producer=health-check summary=health check ok error=api=200 readiness=ready web=200
jetscope-health-alert: web still ok (status=ok); no alert
   alerts so far: 2

--- event 4: failed(api)
jetscope-health-alert: alerted: [localhost] jetscope-api ok -> failed: status=failed producer=health-check summary=api unhealthy, restart disabled error=liveness=000 readiness=unknown
   alerts so far: 3

--- event 5: ok api=200 readiness=degraded web=200
jetscope-health-alert: alerted: [localhost] jetscope-api failed -> ok: status=ok producer=health-check summary=health check ok error=api=200 readiness=degraded web=200
jetscope-health-alert: web still ok (status=ok); no alert
   alerts so far: 4
```

告警总数：**4 条**，内容与期望完全一致（`alerts.log` 逐行）：

```text
1  [localhost] jetscope-api ok -> failed: status=failed producer=health-check summary=api unhealthy, restart disabled error=liveness=000 readiness=unknown
2  [localhost] jetscope-api failed -> ok: status=ok producer=health-check summary=health check ok error=api=200 readiness=ready web=200
3  [localhost] jetscope-api ok -> failed: status=failed producer=health-check summary=api unhealthy, restart disabled error=liveness=000 readiness=unknown
4  [localhost] jetscope-api failed -> ok: status=ok producer=health-check summary=health check ok error=api=200 readiness=degraded web=200
```

即 ok→failed、failed→ok（ready）、ok→failed、failed→ok（degraded），无额外抖动；`api=000` 的 ok 事件和 N2 提到的 web 行为均未产生新告警。

## 与 TK Done criteria 对照

- **CR-002 N1**：status=ok 时 `api=200` 即视为健康（不再要求 readiness=200）；web 仍要求 `web=200`；日志不再输出 readiness 码要求 → **fixed**。模拟证明 api 能从 failed 经 ok（readiness=ready 与 degraded 两种）恢复为 ok，且 `api=000` 不会伪恢复。
- **CR-004 N3**：空格列表在本地逐项校验后转为逗号单词传输，远端 `IFS=, read -ra` 还原为数组并逐项匹配白名单；dry-run 文案同步 → **fixed**。单指纹与双指纹 dry-run 均 rc=0，非法指纹本地 rc=1（fail-closed）。
- 原有 TK-002/TK-004 验收项（只在 ok↔failed 变化时告警、消息含主机名/组件、dry-run 不 ssh、密钥值不打印）保持：本次未打印任何密钥，dry-run 未发起网络连接。

## 已知遗留风险

1. 未在真实 oci-a1 上执行 `bootstrap.sh`（任务禁止远程连接）；远端 `IFS=,` 拆分仅做了本地等价验证，首次真实执行仍需人类观察。
2. `status=recovered` 事件（health-check 重启成功后发出）error 字段是 `liveness=... readiness=...`，不含 `api=`；本次按任务范围未改其分支（仍走组件单词匹配），与 N1 的 ok 判定互不影响。
3. 若运维把 `JETSCOPE_HEALTH_REQUIRE_READINESS=1` 打开，health-check.sh 会把 readiness 纳入自身 failed 判定，但本告警脚本的 ok 分支只看 `api=200`；此时真实故障仍由 failed 事件触发告警，不会漏报，只是恢复判定更宽松，与 health-check 默认配置一致。
