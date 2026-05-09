# mac-mini Claude / Codex / OMX Baseline Checklist

> **⚠️ Historical baseline snapshot — 2026-04-09**
>
> This document records the mac-mini runtime baseline as observed on 2026-04-09.
> It does **not** represent the current (2026-05-09+) configuration, routing labels,
> or executable steps. Routing labels, paths, tool releases, and commands listed below
> may have changed since this snapshot was taken.
>
> **Do not copy-paste commands from this file.** Before running any verification,
> consult the current entry map (`workspace-guides/ai-entry-map.json`), the AI
> systems registry (`workspace-guides/ai-systems-registry.json`), and the OpenCode
> routing policy (`workspace-guides/opencode-model-policy.json`) for up-to-date
> routing and tool state.

## Purpose

This checklist was the accepted **mac-mini runtime baseline** for the local Claude / Codex / OMX lane as of **2026-04-09**.

Historical use cases (verify current applicability before acting):

- validating a fresh or repaired `mac-mini`
- re-checking the `cc-switch-sidecar` control-plane host
- confirming Claude/Codex/OMX are healthy before resuming project work

Accepted machine role at time of writing:

- `mac-mini` = primary instant-compute local control surface

## Accepted Baseline (as of 2026-04-09)

The machine was considered healthy only if all of the following were true:

1. `omx doctor` passes with **0 warnings / 0 failures**
2. `<machine-specific-codex-config-toml>` contains OMX MCP sections
3. `<machine-specific-omx-config-json>` pins:
   - `OMX_DEFAULT_SPARK_LABEL = <historical-spark-routing-label>` *(historical routing label; verify current default via router/registry)*
4. `codex exec` works
5. `omx exec` works
6. `omx explore` works **without** a manual env override
7. `cc-switch-sidecar` listens on `127.0.0.1:8787`
8. sidecar sync preserves OMX sections instead of deleting them

## Required Files / Surfaces (historical paths)

These paths were valid on the mac-mini at time of writing; verify current layout before use:

- `<machine-specific-codex-config-toml>`
- `<machine-specific-omx-config-json>`
- `<machine-specific-path:~/.omx/state/>`
- `<machine-specific-path:~/.local/share/cc-switch-sidecar/controller.py>`
- `<machine-specific-path:~/tools/cc-switch-sidecar/controller.py>`

## Checklist (historical verification steps)

> The following commands are recorded as historical reference only.
> Do not run from this document; verify against current AGENTS.md and entry map first.

### 1. Verify OMX health

```text
# Historical check command — verify current omx CLI availability first
omx doctor
```

Expected (2026-04-09):

- `Results: 12 passed, 0 warnings, 0 failed`
- includes:
  - `Explore Harness: ready`
  - `MCP Servers: 5 servers configured (OMX present)`

### 2. Verify Codex OMX config sections

```text
# Historical check — path is machine-specific
rg -n "^\[mcp_servers\.omx_" <machine-specific-codex-config-toml>
```

Expected sections (2026-04-09):

- `omx_state`
- `omx_memory`
- `omx_code_intel`
- `omx_trace`
- `omx_team_run`

### 3. Verify default spark routing pin

```text
# Historical check — routing label may have changed
cat <machine-specific-omx-config-json>
```

Expected content shape (2026-04-09):

```text
{
  "env": {
    "OMX_DEFAULT_SPARK_LABEL": "<historical-spark-routing-label>"   <- verify current route via router
  }
}
```

Historical optional resolution check (do not run; uses machine-specific absolute path):

```text
# Historical reference only — path was specific to the mac-mini Node install at the time
node - <<'JS'
const { getSparkDefaultLabel } = await import("<historical-oh-my-codex-models-module>");
console.log(getSparkDefaultLabel("<historical-codex-config-root>"));
JS
```

Expected (2026-04-09):

- `<historical-spark-routing-label>` *(current default may differ)*

### 4. Verify Codex exec

```text
# Historical check — verify the Codex CLI is still installed and configured
codex exec --skip-git-repo-check --sandbox read-only "Reply with OK only."
```

Expected:

- returns `OK`

### 5. Verify OMX exec

```text
# Historical check — verify omx CLI is still installed and configured
omx exec --skip-git-repo-check --sandbox read-only "Reply with OK only."
```

Expected:

- returns `OK`

### 6. Verify default OMX explore

```text
# Historical check — path is machine-specific
omx explore --prompt "find usages of build_codex_config"
```

Expected (2026-04-09):

- returns a concise markdown summary
- identifies:
  - definition in `controller.py`
  - single in-file call site

### 7. Verify sidecar listener

```text
# Historical check — verify sidecar is still deployed on this port
lsof -iTCP:8787 -sTCP:LISTEN
ps -axo pid,rss,command | egrep "cc-switch-sidecar/controller.py serve|PID"
```

Expected (2026-04-09):

- one listener on `127.0.0.1:8787`
- one live sidecar process
- RSS should stay in normal small-process range, not runaway growth

### 8. Verify sidecar sync preserves OMX config

```text
# Historical check — do not run sync from this doc; verify current sidecar state first
wc -c <machine-specific-codex-config-toml>
python3 <machine-specific-path:~/.local/share/cc-switch-sidecar/controller.py> sync
wc -c <machine-specific-codex-config-toml>
python3 <machine-specific-path:~/.local/share/cc-switch-sidecar/controller.py> sync
wc -c <machine-specific-codex-config-toml>
rg -n "^\[mcp_servers\.omx_" <machine-specific-codex-config-toml>
```

Expected (2026-04-09):

- config size converges and stays stable
- repeated sync does not strip OMX sections

## Fast Acceptance Command Set (historical — do not run directly)

These were the 2026-04-09 acceptance commands. Verify each against current tooling before use:

```text
# Historical fast-acceptance sequence — not for direct execution
omx doctor
rg -n "^\[mcp_servers\.omx_" <machine-specific-codex-config-toml>
cat <machine-specific-omx-config-json>
codex exec --skip-git-repo-check --sandbox read-only "Reply with OK only."
omx exec --skip-git-repo-check --sandbox read-only "Reply with OK only."
omx explore --prompt "find usages of build_codex_config"
lsof -iTCP:8787 -sTCP:LISTEN
python3 <machine-specific-path:~/.local/share/cc-switch-sidecar/controller.py> sync
```

## Failure Routing (historical remediation steps)

> These remediation steps were valid on 2026-04-09. Do not execute without
> verifying current tool state. Consult current AGENTS.md and entry map first.

### If `omx doctor` warns about Explore Harness

```text
# Historical fix — verify brew/rust are still the correct remediation
brew install rust
omx doctor
```

### If `omx explore` hangs or fails on spark routing

Check (historical paths):

- `<machine-specific-omx-config-json>`
- `OMX_DEFAULT_SPARK_MODEL`

Accepted default on this host was (2026-04-09):

- `<historical-spark-routing-label>` *(historical; current routing may differ; check router and routing policy)*

Do **not** treat `<historical-codex-spark-label>` as the required healthy default on this machine. *(Historical note: this route was already considered unstable at time of writing.)*

### If OMX MCP sections disappear after sync

```text
# Historical fix — do not run setup/sync from this doc without current verification
omx setup --force
python3 <machine-specific-path:~/.local/share/cc-switch-sidecar/controller.py> sync
rg -n "^\[mcp_servers\.omx_" <machine-specific-codex-config-toml>
```

If still unstable, inspect (historical paths):

- `<machine-specific-path:~/tools/cc-switch-sidecar/controller.py>`
- `<machine-specific-path:~/tools/cc-switch-sidecar/tests/test_controller.py>`
- `<machine-specific-path:~/tools/cc-switch-sidecar/PROJECT_PROGRESS.md>`
- `<machine-specific-path:~/tools/cc-switch-sidecar/INCIDENT_LOG.md>`

## Boundary Notes

- This checklist was for the **mac-mini local control-plane baseline**, not for VPS deployment.
- Accepted truth at time of writing:
  - sidecar active on local / `mac-mini`
  - VPS sidecar optional and **not deployed by default**

## Source of Truth

Related records (verify paths are still current):

- `tools/cc-switch-sidecar/PROJECT_PROGRESS.md`
- `tools/cc-switch-sidecar/INCIDENT_LOG.md`
- `tools/automation/PROJECT_PROGRESS.md`
