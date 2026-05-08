#!/usr/bin/env python3
"""Pure decision router for local AI model lanes."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Sequence


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_STATE = ROOT / "runtime/ai-model-router/state.json"
COOLDOWN_SECONDS = 600
DEFAULT_TIMEOUT_SECONDS = 45
MAX_CAPTURE_CHARS = 8000
OPENCODE_HELPER = Path("/Users/yumei/vibecoding/.codex/skills/opencode-model-router/scripts/opencode-model-call")
COPILOT_HELPER = Path("/Users/yumei/vibecoding/.codex/skills/opencode-model-router/scripts/copilot-call")
TASK_ROUTES: Dict[str, Dict[str, Any]] = {
    "fast_probe": {
        "purpose": "fast probes, summaries, and simple bug triage",
        "models": [
            "opencode-go/deepseek-v4-flash",
            "opencode-go/deepseek-v4-pro",
            "cmd/deepseek-v4-pro",
            "gpt-5.4-mini",
        ],
        "reasoning_effort": "medium",
    },
    "structured_check": {
        "purpose": "cheap structured code checks",
        "models": [
            "opencode-go/minimax-m2.5",
            "opencode-go/deepseek-v4-flash",
            "opencode-go/mimo-v2.5",
            "gpt-5.4-mini",
        ],
        "reasoning_effort": "medium",
    },
    "hard_review": {
        "purpose": "architecture, debugging, security, and difficult review",
        "models": [
            "opencode-go/deepseek-v4-pro",
            "cmd/deepseek-v4-pro",
            "opencode-go/qwen3.6-plus",
            "gpt-5.5",
            "gpt-5.3-codex",
        ],
        "reasoning_effort": "high",
    },
    "large_implementation": {
        "purpose": "larger implementation or long-context coding support",
        "models": [
            "opencode-go/kimi-k2.6",
            "gpt-5.5",
            "gpt-5.3-codex",
            "opencode-go/deepseek-v4-pro",
        ],
        "reasoning_effort": "high",
    },
    "chinese_reasoning": {
        "purpose": "Chinese structured reasoning and second opinion",
        "models": [
            "opencode-go/qwen3.6-plus",
            "opencode-go/deepseek-v4-pro",
            "cmd/deepseek-v4-pro",
            "gpt-5.5",
        ],
        "reasoning_effort": "high",
    },
    "codex_execution": {
        "purpose": "bounded Codex CLI goal execution",
        "models": [
            "gpt-5.5",
            "gpt-5.4",
            "gpt-5.3-codex",
            "gpt-5.4-mini",
        ],
        "reasoning_effort": "high",
    },
}
FATAL_MARKERS = ("unauthorized", "forbidden", "permission", "invalid api key", "authentication")
SECRET_PATTERNS: Sequence[tuple[re.Pattern[str], str]] = (
    (re.compile(r"(?i)\b(OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*([^\s]+)"), r"\1=<redacted:\1>"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b"), "<redacted:api-key>"),
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._-]{12,}\b"), r"\1 <redacted:bearer>"),
)
READ_ONLY_EXECUTION_PREFIX = (
    "Read-only support call. Do not request or reveal secrets. Do not modify files, "
    "run destructive commands, push, deploy, sync, open PRs, or mutate remote/local project state. "
    "Return concise findings or an answer only.\n\n"
)


def lane_for(model: str) -> str:
    if model.startswith("opencode-go/"):
        return "opencode-go"
    if model.startswith("cmd/"):
        return "command-code"
    if model.startswith("gpt-"):
        return "codex-cli"
    if model.startswith("copilot/"):
        return "copilot-cli"
    return "external"


def command_template(model: str) -> str:
    lane = lane_for(model)
    if lane == "opencode-go":
        return f"OPENCODE_MODEL={model} OPENCODE_VARIANT=high /Users/yumei/vibecoding/.codex/skills/opencode-model-router/scripts/opencode-model-call <prompt>"
    if lane == "command-code":
        return "cmd -p <prompt> --skip-onboarding"
    if lane == "codex-cli":
        return f"codex exec -m {model} --sandbox read-only --skip-git-repo-check <prompt>"
    if lane == "copilot-cli":
        return f"COPILOT_MODEL={model.removeprefix('copilot/')} /Users/yumei/vibecoding/.codex/skills/opencode-model-router/scripts/copilot-call <prompt>"
    return "<manual-call> <prompt>"


def redact_text(text: str) -> str:
    redacted = text
    for pattern, replacement in SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def truncate_text(text: str, limit: int = MAX_CAPTURE_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n<truncated {len(text) - limit} chars>"


def prepare_prompt(prompt: str) -> str:
    return READ_ONLY_EXECUTION_PREFIX + redact_text(prompt)


def argv_for(model: str, prompt: str) -> List[str]:
    lane = lane_for(model)
    prepared = prepare_prompt(prompt)
    if lane == "opencode-go":
        return [str(OPENCODE_HELPER), prepared]
    if lane == "command-code":
        return ["cmd", "-p", prepared, "--skip-onboarding"]
    if lane == "codex-cli":
        return ["codex", "exec", "-m", model, "--sandbox", "read-only", "--skip-git-repo-check", prepared]
    if lane == "copilot-cli":
        return [str(COPILOT_HELPER), prepared]
    raise ValueError(f"unsupported executable lane for model: {model}")


def env_for(model: str) -> Dict[str, str]:
    env = os.environ.copy()
    lane = lane_for(model)
    if lane == "opencode-go":
        env["OPENCODE_MODEL"] = model
        env.setdefault("OPENCODE_VARIANT", "high")
    elif lane == "copilot-cli":
        env["COPILOT_MODEL"] = model.removeprefix("copilot/")
    return env


def preview_argv(argv: List[str]) -> List[str]:
    if not argv:
        return []
    result = list(argv)
    result[-1] = redact_text(truncate_text(result[-1], 500))
    return result


def load_state(path: Path = DEFAULT_STATE) -> Dict[str, Any]:
    if not path.exists():
        return {"models": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"models": {}}
    return data if isinstance(data, dict) else {"models": {}}


def save_state(state: Dict[str, Any], path: Path = DEFAULT_STATE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=True, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def is_fatal(reason: str) -> bool:
    lowered = reason.lower()
    return any(marker in lowered for marker in FATAL_MARKERS)


def record_result(model: str, ok: bool, reason: str = "", state_path: Path = DEFAULT_STATE) -> None:
    state = load_state(state_path)
    entry = state.setdefault("models", {}).setdefault(model, {})
    now = int(time.time())
    entry["last_seen"] = now
    if ok:
        entry["last_success"] = now
        entry["failure_count"] = 0
        entry.pop("cooldown_until", None)
        entry.pop("fatal", None)
        entry.pop("last_failure_reason", None)
    else:
        entry["last_failure"] = now
        entry["last_failure_reason"] = reason[:300]
        entry["failure_count"] = int(entry.get("failure_count") or 0) + 1
        if is_fatal(reason):
            entry["fatal"] = True
        else:
            entry["cooldown_until"] = now + COOLDOWN_SECONDS
    save_state(state, state_path)


def available_models(models: List[str], state: Dict[str, Any], now: int | None = None) -> List[str]:
    now = now or int(time.time())
    ready: List[str] = []
    cooled: List[str] = []
    for model in models:
        entry = (state.get("models") or {}).get(model) or {}
        if entry.get("fatal"):
            continue
        cooldown_until = int(entry.get("cooldown_until") or 0)
        if cooldown_until > now:
            cooled.append(model)
        else:
            ready.append(model)
    return ready + cooled


def route_task(request: Dict[str, Any], state_path: Path = DEFAULT_STATE) -> Dict[str, Any]:
    task = str(request.get("task") or "hard_review")
    route = TASK_ROUTES.get(task) or TASK_ROUTES["hard_review"]
    state = load_state(state_path)
    ordered = available_models(list(route["models"]), state)
    if not ordered:
        ordered = list(route["models"])
    model = ordered[0]
    fallbacks = ordered[1:]
    return {
        "task": task,
        "purpose": route["purpose"],
        "lane": lane_for(model),
        "model": model,
        "fallback_models": fallbacks,
        "reasoning_effort": route["reasoning_effort"],
        "command_template": command_template(model),
        "dry_run": True,
        "notes": [
            "Decision only unless --execute is explicitly passed.",
            "Do not send secrets, auth files, .env files, or private runtime dumps.",
            "Remote, push, PR, deploy, and sync actions remain forbidden without explicit approval.",
        ],
    }


def execute_request(request: Dict[str, Any], state_path: Path = DEFAULT_STATE) -> Dict[str, Any]:
    prompt = str(request.get("prompt") or "")
    execute = bool(request.get("execute"))
    timeout_seconds = int(request.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS)
    decision = route_task(request, state_path=state_path)
    model = decision["model"]
    argv = argv_for(model, prompt)
    result: Dict[str, Any] = {
        "ok": False,
        "executed": False,
        "dry_run": not execute,
        "task": decision["task"],
        "lane": decision["lane"],
        "model": model,
        "fallback_models": decision["fallback_models"],
        "timeout_seconds": timeout_seconds,
        "redacted_prompt_preview": redact_text(truncate_text(prompt, 1000)),
        "argv_preview": preview_argv(argv),
        "read_only_prefix": True,
    }
    if not prompt:
        result["error"] = "prompt is required for execution wrapper"
        return result
    if not execute:
        result["ok"] = True
        result["notes"] = [
            "Dry run only; subprocess was not called.",
            "Pass --execute to call the selected external lane.",
        ]
        return result

    try:
        completed = subprocess.run(
            argv,
            env=env_for(model),
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        reason = f"timeout after {timeout_seconds}s"
        record_result(model, False, reason, state_path=state_path)
        result.update(
            {
                "executed": True,
                "timed_out": True,
                "error": reason,
                "stdout": redact_text(truncate_text(exc.stdout or "")),
                "stderr": redact_text(truncate_text(exc.stderr or "")),
            }
        )
        return result
    except OSError as exc:
        reason = f"os error: {exc}"
        record_result(model, False, reason, state_path=state_path)
        result.update({"executed": True, "timed_out": False, "error": reason})
        return result

    stdout = redact_text(truncate_text(completed.stdout or ""))
    stderr = redact_text(truncate_text(completed.stderr or ""))
    ok = completed.returncode == 0
    if ok:
        record_result(model, True, state_path=state_path)
    else:
        record_result(model, False, stderr or stdout or f"returncode {completed.returncode}", state_path=state_path)
    result.update(
        {
            "ok": ok,
            "executed": True,
            "timed_out": False,
            "returncode": completed.returncode,
            "stdout": stdout,
            "stderr": stderr,
        }
    )
    return result


def self_test() -> int:
    assert route_task({"task": "fast_probe"})["model"] == "opencode-go/deepseek-v4-flash"
    assert route_task({"task": "hard_review"})["model"] == "opencode-go/deepseek-v4-pro"
    assert route_task({"task": "codex_execution"})["model"] == "gpt-5.5"
    dry_run = execute_request({"task": "fast_probe", "prompt": "OPENAI_API_KEY=sk-testsecret", "execute": False})
    assert dry_run["dry_run"] is True
    assert "<redacted:OPENAI_API_KEY>" in dry_run["redacted_prompt_preview"]
    print("OK ai-model-router self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Choose and optionally execute a local AI model lane")
    parser.add_argument("--task", default="hard_review", choices=sorted(TASK_ROUTES))
    parser.add_argument("--prompt", default="")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--state", default=str(DEFAULT_STATE))
    parser.add_argument("--record-success", default="")
    parser.add_argument("--record-failure", default="")
    parser.add_argument("--reason", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    state_path = Path(args.state)
    if args.self_test:
        return self_test()
    if args.record_success:
        record_result(args.record_success, True, state_path=state_path)
        return 0
    if args.record_failure:
        record_result(args.record_failure, False, args.reason, state_path=state_path)
        return 0

    if args.prompt or args.execute:
        decision = execute_request(
            {
                "task": args.task,
                "prompt": args.prompt,
                "execute": args.execute,
                "timeout_seconds": args.timeout_seconds,
            },
            state_path=state_path,
        )
    else:
        decision = route_task({"task": args.task}, state_path=state_path)
    if args.json:
        print(json.dumps(decision, ensure_ascii=False, indent=2))
    else:
        print(decision["model"])
        if "command_template" in decision:
            print(decision["command_template"])
        else:
            print(json.dumps(decision["argv_preview"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
