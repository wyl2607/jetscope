#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/yumei/tools/automation"
FIX="$ROOT/workspace-guides/skill-chains/fixtures/dashboard"
STATE_DIR="$FIX/state-samples"
EXPECTED="$FIX/expected-data.json"
TMP_ROOT="/tmp/dash-fixture"
OUT_DIR="$TMP_ROOT/out"
FALLBACK_OUT_DIR="$TMP_ROOT/fallback-out"
TRACE_FILE="$TMP_ROOT/session-ledger.jsonl"
DASHBOARD_APP="$ROOT/runtime/skill-chains/dashboard/app.js"
DASHBOARD_I18N_JSON="$ROOT/runtime/skill-chains/dashboard/i18n.json"
DASHBOARD_I18N_JS="$ROOT/runtime/skill-chains/dashboard/i18n.js"
DASHBOARD_KPI_JS="$ROOT/runtime/skill-chains/dashboard/modules/g9a-kpi.js"
DASHBOARD_CHAIN_DRAWER_JS="$ROOT/runtime/skill-chains/dashboard/modules/g9c-chain-drawer.js"
DASHBOARD_WATCH_DRAWER_JS="$ROOT/runtime/skill-chains/dashboard/modules/g9b-watch-drawer.js"

rm -rf "$TMP_ROOT"
mkdir -p "$OUT_DIR"
mkdir -p "$FALLBACK_OUT_DIR"

cat > "$TRACE_FILE" <<'EOF'
{"timestamp":"2026-05-07T00:00:00Z","scope":"jetscope/feature-pr","summary":"fixture dashboard session","linked_issue":""}
{"timestamp":"2026-05-07T00:01:00Z","scope":"esg-research-toolkit/refactor-pr","summary":"fixture dashboard session","linked_issue":""}
{"timestamp":"2026-05-07T00:02:00Z","kind":"goal_status","goal_run_id":"goal-fixture-1","goal_packet_id":"dashboard-fixture-jetscope","project":"jetscope","chain":"feature-pr","status":"running","agent":"codex-cli","summary":"fixture goal running"}
{"timestamp":"2026-05-07T00:03:00Z","kind":"goal_status","goal_run_id":"goal-fixture-1","goal_packet_id":"dashboard-fixture-jetscope","project":"jetscope","chain":"feature-pr","status":"done","agent":"codex-cli","summary":"fixture goal done"}
EOF

python3 "$ROOT/scripts/skill-chain-dashboard.py" \
  --once \
  --state-dir "$STATE_DIR" \
  --trace-file "$TRACE_FILE" \
  --out "$OUT_DIR" >/tmp/dash-fixture.out

python3 "$ROOT/scripts/skill-library.py" \
  --once \
  --trace-file "$TRACE_FILE" \
  --out "$OUT_DIR" >/tmp/skill-library-fixture.out

python3 - "$ROOT" "$OUT_DIR/data.json" "$EXPECTED" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
data_path = Path(sys.argv[2])
expected_path = Path(sys.argv[3])

data = json.loads(data_path.read_text(encoding="utf-8"))
expected = json.loads(expected_path.read_text(encoding="utf-8"))
registry = json.loads((root / "workspace-guides/skill-chains/registry.json").read_text(encoding="utf-8"))

def fail(message: str) -> None:
    raise SystemExit(message)

chains = data.get("chains", [])
chain_names = sorted(chain.get("name") for chain in chains)
registry_chain_names = sorted(registry.get("chains", {}).keys())
if len(chains) != len(registry.get("chains", {})):
    fail(f"chain count mismatch: data={len(chains)} registry={len(registry.get('chains', {}))}")
if chain_names != expected["chain_names"] or chain_names != registry_chain_names:
    fail(f"chain names mismatch: data={chain_names} registry={registry_chain_names}")

states_by_project = {
    project.get("project"): project.get("states", [])
    for project in data.get("projects", [])
}

keep_projects = sorted(
    project
    for project, states in states_by_project.items()
    if any(state.get("classification") == "keep" for state in states)
)
if keep_projects != expected["keep_projects"]:
    fail(f"keep projects mismatch: {keep_projects}")
for project in expected["keep_projects"]:
    keep_states = [
        state
        for state in states_by_project.get(project, [])
        if state.get("classification") == "keep"
    ]
    if not keep_states:
        fail(f"missing keep state for {project}")
    if not all(state.get("chain") and state.get("state") for state in keep_states):
        fail(f"keep state missing selected_chain/state for {project}: {keep_states}")

archive_candidates = [
    (project, state)
    for project, states in states_by_project.items()
    for state in states
    if state.get("classification") == "archive_candidate"
]
if not archive_candidates:
    fail("expected at least one archive_candidate project")

if data.get("state_enum") != expected["state_enum"]:
    fail(f"state_enum mismatch: {data.get('state_enum')}")

assistants = data.get("assistants", [])
assistant_names = {assistant.get("name") for assistant in assistants}
for required_name in {"Claude Code", "Codex CLI", "OpenCode"}:
    if required_name not in assistant_names:
        fail(f"missing assistant: {required_name}")
if len(assistants) < 4:
    fail(f"expected at least 4 assistant/provider rows, got {len(assistants)}")
unexpected_providers = {"LongCat", "火山", "Relay"} & assistant_names
if unexpected_providers:
    fail(f"provider-only rows should not appear as assistants: {sorted(unexpected_providers)}")
for assistant in assistants:
    if "support_matrix" not in assistant:
        fail(f"assistant missing support_matrix: {assistant.get('name')}")
    if assistant.get("name") == "Codex CLI":
        feature = [
            item
            for item in assistant.get("support_matrix", [])
            if item.get("chain") == "feature-pr"
        ]
        if not feature or feature[0].get("ok") is not True:
            fail(f"Codex CLI should support feature-pr via capability registry: {feature}")

capability_registry = data.get("capability_registry", {})
if capability_registry.get("missing") is not False:
    fail(f"capability registry should be present: {capability_registry}")
if capability_registry.get("version") != 1:
    fail(f"unexpected capability registry version: {capability_registry}")

skill_library = data.get("skill_library", {})
library_summary = skill_library.get("summary", {})
library_gate = skill_library.get("gate", {})
duplicate_metadata = skill_library.get("duplicate_metadata", {})
active_risk_names = duplicate_metadata.get("active_drift_risk_names", [])
if library_summary.get("active_drift_risk_names") != 0:
    fail(f"expected zero active skill drift risks, got {library_summary}")
if library_gate.get("active_drift_risk_clear") is not True or library_gate.get("active_drift_risk_count") != 0:
    fail(f"active drift gate should be clear with count zero: {library_gate}")
if active_risk_names:
    fail(f"active drift risk names should be empty without a real active hash split: {active_risk_names}")

model_router = data.get("model_router", {})
model_summary = model_router.get("summary", {})
if not isinstance(model_router.get("models", []), list):
    fail(f"model router models should be a list: {model_router}")
for required in ("models", "ready", "cooldown", "fatal", "unavailable", "last_success"):
    if required not in model_summary:
        fail(f"model router summary missing {required}: {model_summary}")
if "fatal_clear" not in model_router.get("gate", {}) or "cooldown_clear" not in model_router.get("gate", {}) or "unavailable_clear" not in model_router.get("gate", {}):
    fail(f"model router gate missing clear flags: {model_router.get('gate')}")

goal_runs = data.get("goal_runs", [])
if not goal_runs:
    fail("expected goal_runs in dashboard payload")
fixture_goal = next((item for item in goal_runs if item.get("goal_run_id") == "goal-fixture-1"), None)
if not fixture_goal:
    fail(f"missing fixture goal run: {goal_runs}")
if fixture_goal.get("status") != "done" or fixture_goal.get("project") != "jetscope" or fixture_goal.get("chain") != "feature-pr":
    fail(f"unexpected fixture goal run aggregation: {fixture_goal}")

for chain in chains:
    if not isinstance(chain.get("executor_hint"), dict) or not chain["executor_hint"]:
        fail(f"chain missing executor_hint: {chain.get('name')}")

parse_states = [
    state
    for states in states_by_project.values()
    for state in states
    if str(state.get("file", "")).endswith("/parse_error.json")
]
if not parse_states:
    fail("parse_error sample missing from projects")
if not any(state.get("classification") == "review" for state in parse_states):
    fail(f"parse_error not classified as review: {parse_states}")

print("OK dashboard fixture")
PY

python3 - "$OUT_DIR/skills.json" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))

def fail(message: str) -> None:
    raise SystemExit(message)

summary = data.get("summary", {})
duplicate_metadata = data.get("duplicate_metadata", {})
gate = data.get("gate", {})
if summary.get("unique_skills", 0) < 20:
    fail(f"expected at least 20 unique skills, got {summary}")
if summary.get("duplicate_skill_names", 0) < 1:
    fail(f"expected duplicate skill names, got {summary}")
if summary.get("active_drift_risk_names") != 0:
    fail(f"active duplicate drift risk must stay zero: {summary}")
if gate.get("active_drift_risk_clear") is not True:
    fail(f"active drift gate should be clear: {gate}")
for required in ("duplicate_kinds", "copy_roles", "active_drift_risk_names", "intentional_variant_names", "archive_noise_names", "alias_or_system_noise_names"):
    if required not in duplicate_metadata:
        fail(f"missing duplicate metadata field: {required}")
if duplicate_metadata.get("active_drift_risk_names") != []:
    fail(f"active drift risk names should be empty: {duplicate_metadata.get('active_drift_risk_names')}")
if "intentional-variant" not in duplicate_metadata.get("duplicate_kinds", {}):
    fail(f"expected intentional variant duplicate kind: {duplicate_metadata.get('duplicate_kinds')}")
if "path-alias" not in duplicate_metadata.get("copy_roles", {}):
    fail(f"expected path-alias copy role: {duplicate_metadata.get('copy_roles')}")

skills = {skill.get("id"): skill for skill in data.get("skills", [])}
for required in ("test-harness", "analyze", "pr-review-guard"):
    if required not in skills:
        fail(f"missing skill library entry: {required}")
    entry = skills[required]
    for field in ("category", "purpose", "effect", "why_independent", "importance", "importance_score", "optimization", "consolidation", "sop", "usage", "frontmatter"):
        if field not in entry:
            fail(f"{required} missing field {field}")
    if not isinstance(entry.get("importance"), dict) or "score" not in entry["importance"]:
        fail(f"{required} importance should be structured: {entry.get('importance')}")

if not any(category.get("id") == "quality" for category in data.get("categories", [])):
    fail("missing quality category")

print("OK skill library fixture")
PY

python3 "$ROOT/scripts/skill-chain-dashboard.py" \
  --once \
  --state-dir "$STATE_DIR" \
  --trace-file "$TRACE_FILE" \
  --capabilities "$TMP_ROOT/missing-assistant-capabilities.json" \
  --out "$FALLBACK_OUT_DIR" >/tmp/dash-fixture-fallback.out

python3 - "$FALLBACK_OUT_DIR/data.json" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
registry = data.get("capability_registry", {})
if registry.get("missing") is not True:
    raise SystemExit(f"expected missing capability registry fallback, got {registry}")
if not data.get("assistants"):
    raise SystemExit("fallback capability mode did not produce assistants")
print("OK dashboard fallback")
PY

rg -n "renderPriorityRecommendations|scoreProjectPriority|todayPriority" "$DASHBOARD_APP" >/tmp/dash-fixture-priority-app.out
rg -n "completionStatus|completionBlock|taskStatus" "$DASHBOARD_APP" >/tmp/dash-fixture-completion-app.out
rg -n "traceExplorerView|renderTraceExplorer|traceExplorerTitle|traceProjectFilter" "$DASHBOARD_APP" >/tmp/dash-fixture-trace-explorer-app.out
rg -n "resetTraceFilters|traceProjectFilter = initialParams.get\\(\"trace_project\"\\) \\|\\| initialParams.get\\(\"project\"\\)|openProject" "$DASHBOARD_APP" >/tmp/dash-fixture-trace-explorer-url-app.out
rg -n "assistantDrawerOpen|renderAssistantDrawer|assistantDetailTitle|openAssistantDrawer" "$DASHBOARD_APP" >/tmp/dash-fixture-assistant-drawer-app.out
rg -n "wireDialogKeyboard|focusableIn|restoreDrawerFocus|aria-modal" "$DASHBOARD_APP" >/tmp/dash-fixture-keymap-drawer-app.out
rg -n "pr-review-guard|release-readiness-runner|zhValueTerms|displayGate|localValue\\(\"traceKind\"" "$DASHBOARD_APP" >/tmp/dash-fixture-l10n-app.out
rg -n "VALID_VIEWS|view=overview|url.searchParams.set\\(\"view\"|params.get\\(\"skill\"\\)|params.get\\(\"assistant\"\\)" "$DASHBOARD_APP" >/tmp/dash-fixture-url-view-app.out
rg -n "switchView\\(\"overview\"|switchView\\(\"dedupe\"|openChainDrawer" "$DASHBOARD_KPI_JS" >/tmp/dash-fixture-kpi-nav.out
rg -n "wireDialogKeyboard|focusableIn|lastFocus|aria-modal" "$DASHBOARD_CHAIN_DRAWER_JS" >/tmp/dash-fixture-chain-keymap.out
rg -n "function tr\\(|Skill SSOT 观察|观察数据不可用|最新快照详情" "$DASHBOARD_WATCH_DRAWER_JS" >/tmp/dash-fixture-watch-l10n.out
rg -n "function tr\\(|链路详情|项目使用情况|registry 原始 JSON|urlOpen" "$DASHBOARD_CHAIN_DRAWER_JS" >/tmp/dash-fixture-chain-l10n.out
rg -n "\"todayPriority\"" "$DASHBOARD_I18N_JSON" >/tmp/dash-fixture-priority-i18n-json.out
rg -n "\"todayPriority\"" "$DASHBOARD_I18N_JS" >/tmp/dash-fixture-priority-i18n-js.out
rg -n "\"taskStatus\"" "$DASHBOARD_I18N_JSON" >/tmp/dash-fixture-completion-i18n-json.out
rg -n "\"taskStatus\"" "$DASHBOARD_I18N_JS" >/tmp/dash-fixture-completion-i18n-js.out
rg -n "\"traceExplorerTitle\"|\"assistantDetailTitle\"|\"resetFilters\"|\"openProject\"" "$DASHBOARD_I18N_JSON" >/tmp/dash-fixture-g11-i18n-json.out
rg -n "\"traceExplorerTitle\"|\"assistantDetailTitle\"|\"resetFilters\"|\"openProject\"" "$DASHBOARD_I18N_JS" >/tmp/dash-fixture-g11-i18n-js.out

rg -n "expectedRedGatePassed|gateStatus\(|gateName\(|taskStateStale|progressSnapshotSource" "$DASHBOARD_APP" >/tmp/dash-fixture-g12-progress-app.out
rg -n "progressSnapshotSource|taskStateStale|expectedRedGate" "$DASHBOARD_I18N_JSON" >/tmp/dash-fixture-g12-progress-i18n-json.out
rg -n "progressSnapshotSource|taskStateStale|expectedRedGate" "$DASHBOARD_I18N_JS" >/tmp/dash-fixture-g12-progress-i18n-js.out

rg -n "traceActionBar|traceTargetChips|openTraceProject|openTraceChain|traceFilterChip|traceActiveFilters" "$DASHBOARD_APP" >/tmp/dash-fixture-g13-trace-app.out
rg -n "trace-action-bar|trace-target-chips|trace-filter-chip|trace-open-actions" "$ROOT/runtime/skill-chains/dashboard/styles.css" >/tmp/dash-fixture-g13-trace-css.out
rg -n "openChain|activeFilters|noMatchingEvents|tryWideningFilter|eventTarget" "$DASHBOARD_I18N_JSON" >/tmp/dash-fixture-g13-trace-i18n-json.out
rg -n "openChain|activeFilters|noMatchingEvents|tryWideningFilter|eventTarget" "$DASHBOARD_I18N_JS" >/tmp/dash-fixture-g13-trace-i18n-js.out

rg -n "goalRunFor|goalStatusLabel|goalLifecycle|goal_run_id|goalRuns" "$DASHBOARD_APP" >/tmp/dash-fixture-g14-goal-app.out
rg -n "goalStatus|goalQueued|goalRunning|goalDone|goalBlocked|goalNotStarted" "$DASHBOARD_I18N_JSON" >/tmp/dash-fixture-g14-goal-i18n-json.out
rg -n "goalStatus|goalQueued|goalRunning|goalDone|goalBlocked|goalNotStarted" "$DASHBOARD_I18N_JS" >/tmp/dash-fixture-g14-goal-i18n-js.out
rg -n "goal\)" "$ROOT/scripts/ai-trace.sh" >/tmp/dash-fixture-g14-ai-trace.out
rg -n "goal_run_id|goal_status" "$ROOT/workspace-guides/skill-chains/state-schema.json" >/tmp/dash-fixture-g14-schema.out

rg -n "g9b-alias-grid|g9b-alias-path|g9b-alias-status|g9b-skill-hash" "$DASHBOARD_WATCH_DRAWER_JS" >/tmp/dash-fixture-g9b-alias-layout-js.out
rg -n "g9b-alias-grid|grid-template-columns: minmax\(0, 1fr\) 104px|g9b-alias-path|g9b-alias-status|text-overflow: ellipsis|justify-self: end|width: 86px" "$ROOT/runtime/skill-chains/dashboard/modules/g9b-watch-drawer.css" >/tmp/dash-fixture-g9b-alias-layout-css.out

rg -n "assistant-card[^{]*\{|grid-template-rows: auto auto 1fr auto auto|assistant-actions[^{]*\{|margin-top: auto|min-height: 38px" "$ROOT/runtime/skill-chains/dashboard/styles.css" >/tmp/dash-fixture-assistant-card-align-css.out
