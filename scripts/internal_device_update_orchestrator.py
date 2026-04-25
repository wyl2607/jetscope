#!/usr/bin/env python3
"""Parallel internal-device AI tool updater.

Purpose:
- Reuse one command to run cross-device AI tool update lanes.
- Run per-device lanes in parallel to reduce total runtime.
- Persist structured run reports for audit/replay.

This script intentionally updates only the AI development tools tracked by the
daily inventory: codex, claude, omx, opencode, and copilot. It does not run
full-system package-manager upgrades by default.

Default targets:
- local
- mac-mini
- coco
- windows-pc
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shlex
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT", "/Users/yumei")).expanduser().resolve()
AUTOMATION = WORKSPACE_ROOT / "tools" / "automation"
OUT_ROOT = AUTOMATION / "runtime" / "internal-device-updates"

DEFAULT_TARGETS = ["local", "mac-mini", "coco", "windows-pc"]

NPM_CORE_AI_PACKAGES = [
    "@anthropic-ai/claude-code@latest",
    "@openai/codex@latest",
    "oh-my-codex@latest",
]

NPM_AI_PACKAGES = [
    *NPM_CORE_AI_PACKAGES,
    "opencode-ai@latest",
]


@dataclass
class StepResult:
    name: str
    ok: bool
    skipped: bool
    returncode: int
    stdout: str
    stderr: str
    started_at: str
    finished_at: str
    duration_sec: float


@dataclass
class NodeResult:
    node: str
    ok: bool
    started_at: str
    finished_at: str
    duration_sec: float
    steps: list[StepResult] = field(default_factory=list)
    error: str | None = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def decode_output(data: bytes | None) -> str:
    if not data:
        return ""
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(enc, errors="replace")
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def run_cmd(args: list[str], timeout: int) -> tuple[int, str, str]:
    proc = subprocess.run(args, capture_output=True, timeout=timeout, check=False)
    return proc.returncode, decode_output(proc.stdout).strip(), decode_output(proc.stderr).strip()


def run_ssh_bash(target: str, command: str, timeout: int) -> tuple[int, str, str]:
    return run_cmd(["ssh", "-o", "ConnectTimeout=20", target, "bash", "-lc", shlex.quote(command)], timeout)


def powershell_encoded(script: str) -> str:
    return base64.b64encode(script.encode("utf-16le")).decode("ascii")


def run_ssh_powershell(target: str, script: str, timeout: int) -> tuple[int, str, str]:
    encoded = powershell_encoded(script)
    return run_cmd(["ssh", "-o", "ConnectTimeout=20", target, "powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], timeout)


def shell_join(items: list[str]) -> str:
    return " ".join(shlex.quote(item) for item in items)


def run_step(
    name: str,
    runner: Callable[[], tuple[int, str, str]],
    *,
    skip_condition: Callable[[int, str, str], bool] | None = None,
    skip_reason: str | None = None,
    allow_skip_rc: set[int] | None = None,
    max_attempts: int = 1,
    retry_backoff_sec: float = 0.0,
) -> StepResult:
    started = now_utc()
    rc = 1
    out = ""
    err = ""
    skipped = False
    for attempt in range(1, max_attempts + 1):
        rc, out, err = runner()
        if skip_condition and skip_condition(rc, out, err):
            skipped = True
            break
        if rc == 0 or (allow_skip_rc and rc in allow_skip_rc):
            break
        if attempt < max_attempts and retry_backoff_sec:
            time.sleep(retry_backoff_sec)
    if skipped and skip_reason and not out:
        out = skip_reason
    finished = now_utc()
    ok = rc == 0 or skipped or bool(allow_skip_rc and rc in allow_skip_rc)
    return StepResult(
        name=name,
        ok=ok,
        skipped=skipped,
        returncode=rc,
        stdout=out,
        stderr=err,
        started_at=started.isoformat(),
        finished_at=finished.isoformat(),
        duration_sec=(finished - started).total_seconds(),
    )


def local_steps(args: argparse.Namespace) -> list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]]:
    npm_cmd = ["npm", "install", "-g", *NPM_AI_PACKAGES]
    return [
        ("npm_ai_tools_update", lambda: run_cmd(npm_cmd, args.timeout_local_tools), {}),
        ("copilot_cask_update", lambda: run_cmd(["brew", "upgrade", "--cask", "copilot-cli"], args.timeout_local_tools), {"allow_skip_rc": {0}}),
    ]


def remote_npm_ai_update(target: str, timeout: int, *, prefix: str | None = None, include_opencode: bool = True) -> tuple[int, str, str]:
    packages = NPM_AI_PACKAGES if include_opencode else NPM_CORE_AI_PACKAGES
    prefix_part = f" --prefix {prefix}" if prefix else ""
    cmd = f"npm install -g{prefix_part} {shell_join(packages)}"
    return run_ssh_bash(target, cmd, timeout)


def brew_ok_or_noop(rc: int, out: str, err: str) -> bool:
    combined = f"{out}\n{err}".lower()
    return rc != 0 and ("already installed" in combined or "not installed" in combined or "no available upgrade" in combined)


def softwareupdate_ok_or_noop(rc: int, out: str, err: str) -> bool:
    combined = f"{out}\n{err}".lower()
    return rc != 0 and ("no new software available" in combined or "no updates are available" in combined or "usage: softwareupdate" in combined)


def winget_ok_or_noop(rc: int, out: str, err: str) -> bool:
    combined = f"{out}\n{err}".lower()
    return rc != 0 and (
        "no available upgrade found" in combined
        or "no newer package versions are available" in combined
        or "kein verfügbares upgrade gefunden" in combined
        or "keine neueren paketversionen verfügbar" in combined
    )


def mac_mini_steps(args: argparse.Namespace) -> list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]]:
    opencode_shim_cmd = (
        "mkdir -p /Users/yilinwang/.opencode/bin/archived && "
        "if [ -x /opt/homebrew/bin/opencode ] && [ -e /Users/yilinwang/.opencode/bin/opencode ] && "
        "[ ! /Users/yilinwang/.opencode/bin/opencode -ef /opt/homebrew/bin/opencode ]; then "
        "old_ver=$(/Users/yilinwang/.opencode/bin/opencode --version 2>/dev/null | tr -c 'A-Za-z0-9._-' '_' | sed 's/_$//'); "
        "mv /Users/yilinwang/.opencode/bin/opencode /Users/yilinwang/.opencode/bin/archived/opencode-${old_ver:-old}-$(date -u +%Y%m%d%H%M%S); "
        "ln -s /opt/homebrew/bin/opencode /Users/yilinwang/.opencode/bin/opencode; "
        "else true; fi"
    )
    steps: list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]] = [
        ("npm_ai_tools_update", lambda: remote_npm_ai_update("mac-mini", args.timeout_mac_tools, include_opencode=False), {"max_attempts": 1}),
        ("opencode_brew_update", lambda: run_ssh_bash("mac-mini", "brew upgrade opencode", args.timeout_mac_tools), {"skip_condition": brew_ok_or_noop}),
        ("opencode_legacy_shim_repoint", lambda: run_ssh_bash("mac-mini", opencode_shim_cmd, args.timeout_mac_tools), {}),
        ("copilot_cask_update", lambda: run_ssh_bash("mac-mini", "brew upgrade --cask copilot-cli", args.timeout_mac_tools), {"skip_condition": brew_ok_or_noop}),
        ("copilot_self_update", lambda: run_ssh_bash("mac-mini", "copilot update", args.timeout_mac_tools), {}),
        ("macos_updates_list", lambda: run_ssh_bash("mac-mini", "softwareupdate --list", args.timeout_macos_updates), {"skip_condition": softwareupdate_ok_or_noop}),
    ]
    if args.install_macos_system_updates:
        steps.append(("macos_updates_install_all", lambda: run_ssh_bash("mac-mini", "softwareupdate -i -a --verbose", args.timeout_macos_updates), {}))
    return steps


def coco_steps(args: argparse.Namespace) -> list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]]:
    steps: list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]] = [
        (
            "npm_ai_tools_update_user_prefix",
            lambda: remote_npm_ai_update("coco", args.timeout_linux_tools, prefix="$HOME/.local"),
            {},
        )
    ]
    if args.install_coco_system_updates:
        apt_cmd = (
            "if sudo -n true >/dev/null 2>&1; then "
            "sudo apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get -y upgrade && "
            "sudo DEBIAN_FRONTEND=noninteractive apt-get -y autoremove && sudo apt-get -y autoclean; "
            "else echo '__SKIP__:sudo_password_required'; exit 10; fi"
        )
        steps.append(("coco_apt_upgrade", lambda: run_ssh_bash("coco", apt_cmd, args.timeout_linux_updates), {"allow_skip_rc": {10}, "skip_condition": lambda rc, out, err: rc == 10 and "__SKIP__" in out}))
    else:
        steps.append(("coco_apt_upgrade", lambda: (10, "Skipped: --install-coco-system-updates not enabled", ""), {"allow_skip_rc": {10}, "skip_condition": lambda rc, out, err: rc == 10}))
    return steps


def windows_steps(args: argparse.Namespace) -> list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]]:
    npm_script = "npm install -g " + " ".join(NPM_AI_PACKAGES)
    npm_script = "Get-Process opencode -ErrorAction SilentlyContinue | Stop-Process -Force; " + npm_script
    copilot_script = "winget source update; winget upgrade --id GitHub.Copilot --accept-source-agreements --accept-package-agreements --silent --force"
    return [
        ("npm_ai_tools_update", lambda: run_ssh_powershell("windows-pc", npm_script, args.timeout_windows_tools), {}),
        ("copilot_winget_update", lambda: run_ssh_powershell("windows-pc", copilot_script, args.timeout_windows_updates), {"skip_condition": winget_ok_or_noop}),
    ]


NODE_BUILDERS: dict[str, Callable[[argparse.Namespace], list[tuple[str, Callable[[], tuple[int, str, str]], dict[str, Any]]]]] = {
    "local": local_steps,
    "mac-mini": mac_mini_steps,
    "coco": coco_steps,
    "windows-pc": windows_steps,
}


def run_node(node: str, args: argparse.Namespace) -> NodeResult:
    started = now_utc()
    result = NodeResult(node=node, ok=False, started_at=started.isoformat(), finished_at="", duration_sec=0.0)
    try:
        builder = NODE_BUILDERS[node]
    except KeyError:
        raise ValueError(f"Unsupported node: {node}")
    try:
        for name, runner, kwargs in builder(args):
            if args.dry_run:
                step_started = now_utc()
                step_finished = now_utc()
                result.steps.append(StepResult(name, True, True, 0, "Dry-run: command not executed", "", step_started.isoformat(), step_finished.isoformat(), 0.0))
                continue
            result.steps.append(run_step(name, runner, **kwargs))
        result.ok = all(step.ok for step in result.steps)
    except Exception as exc:
        result.error = str(exc)
        result.ok = False
    finished = now_utc()
    result.finished_at = finished.isoformat()
    result.duration_sec = (finished - started).total_seconds()
    return result


def write_reports(run_id: str, summary: dict[str, Any]) -> tuple[Path, Path]:
    out_dir = OUT_ROOT / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "report.json"
    md_path = out_dir / "report.md"
    latest_json = OUT_ROOT / "latest-report.json"
    latest_md = OUT_ROOT / "latest-report.md"
    json_payload = json.dumps(summary, ensure_ascii=False, indent=2)
    json_path.write_text(json_payload + "\n", encoding="utf-8")
    latest_json.write_text(json_payload + "\n", encoding="utf-8")

    lines = [
        f"# Internal Device Update Report — {run_id}",
        "",
        f"- started_at: `{summary['started_at']}`",
        f"- finished_at: `{summary['finished_at']}`",
        f"- dry_run: `{summary['dry_run']}`",
        f"- verify: `{summary['verify_after']}`",
        f"- overall_ok: `{summary['overall_ok']}`",
        "",
        "| node | ok | duration_sec |",
        "|---|---:|---:|",
    ]
    for item in summary["results"]:
        lines.append(f"| {item['node']} | {item['ok']} | {item['duration_sec']:.2f} |")
    for item in summary["results"]:
        lines.extend(["", f"## {item['node']}", ""])
        if item.get("error"):
            lines.append(f"- error: `{item['error']}`")
        for step in item.get("steps", []):
            lines.append(f"- {step['name']}: ok={step['ok']} skipped={step['skipped']} rc={step['returncode']} duration={step['duration_sec']:.2f}s")
    if summary.get("verify_report"):
        lines.extend(["", "## verify_after", "", f"- report: `{summary['verify_report']}`"])
    md_payload = "\n".join(lines).rstrip() + "\n"
    md_path.write_text(md_payload, encoding="utf-8")
    latest_md.write_text(md_payload, encoding="utf-8")
    return json_path, md_path


def run_verify(run_id: str, args: argparse.Namespace) -> str:
    out_dir = OUT_ROOT / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    verify_path = out_dir / f"verify-{run_id}.log"
    cmd = [
        "python3",
        str(WORKSPACE_ROOT / "scripts" / "daily_ai_tools_update_check.py"),
        "--required-nodes",
        "local,usa-vps,france-vps",
        "--optional-nodes",
        "mac-mini,windows-pc,coco",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=args.timeout_verify, check=False)
    verify_path.write_text((proc.stdout or "") + ("\n--- STDERR ---\n" + proc.stderr if proc.stderr else ""), encoding="utf-8")
    return str(verify_path)


def truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parallel internal-device AI tool updater")
    parser.add_argument("--targets", default=",".join(DEFAULT_TARGETS), help="Comma-separated targets (local,mac-mini,coco,windows-pc)")
    parser.add_argument("--max-workers", type=int, default=3, help="Parallel worker count")
    parser.add_argument("--agent-lanes", type=int, help="Alias of --max-workers (for multi-agent lane wording)")
    parser.add_argument("--dry-run", action="store_true", help="Plan only, execute nothing")
    parser.add_argument("--verify-after", action="store_true", help="Run daily_ai_tools_update_check.py after updates")
    parser.add_argument("--install-macos-system-updates", action="store_true", help="Install all pending macOS system updates on mac-mini")
    parser.add_argument("--install-coco-system-updates", action="store_true", help="Run apt full-upgrade on coco (requires passwordless sudo)")
    parser.add_argument("--include-vps", action="store_true", help="Reserved safety gate; VPS targets remain unsupported unless ALLOW_VPS_AI_TOOL_INSTALL=1")
    parser.add_argument("--timeout-mac-tools", type=int, default=1800)
    parser.add_argument("--timeout-local-tools", type=int, default=1800)
    parser.add_argument("--timeout-macos-updates", type=int, default=3600)
    parser.add_argument("--timeout-linux-tools", type=int, default=600)
    parser.add_argument("--timeout-linux-updates", type=int, default=3600)
    parser.add_argument("--timeout-windows-tools", type=int, default=600)
    parser.add_argument("--timeout-windows-updates", type=int, default=3600)
    parser.add_argument("--timeout-verify", type=int, default=300)
    parser.add_argument("--print-json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.agent_lanes:
        args.max_workers = args.agent_lanes
    targets = [target.strip() for target in args.targets.split(",") if target.strip()]
    vps_targets = [target for target in targets if target.endswith("-vps")]
    if vps_targets and not (args.include_vps and truthy_env("ALLOW_VPS_AI_TOOL_INSTALL")):
        raise SystemExit("VPS AI tool updates are blocked by policy; set --include-vps and ALLOW_VPS_AI_TOOL_INSTALL=1 only after explicit approval")
    unknown = [target for target in targets if target not in NODE_BUILDERS]
    if unknown:
        raise SystemExit(f"Unsupported target(s): {', '.join(unknown)}")
    run_id = now_utc().strftime("%Y%m%d-%H%M%S")
    started = now_utc()
    results: list[NodeResult] = []
    with ThreadPoolExecutor(max_workers=max(1, args.max_workers)) as pool:
        futures = {pool.submit(run_node, target, args): target for target in targets}
        for future in as_completed(futures):
            results.append(future.result())
    order = {target: idx for idx, target in enumerate(targets)}
    results.sort(key=lambda item: order.get(item.node, 999))
    finished = now_utc()
    summary: dict[str, Any] = {
        "run_id": run_id,
        "started_at": started.isoformat(),
        "finished_at": finished.isoformat(),
        "dry_run": args.dry_run,
        "verify_after": args.verify_after,
        "targets": targets,
        "overall_ok": all(item.ok for item in results),
        "results": [asdict(item) for item in results],
    }
    if args.verify_after and not args.dry_run:
        summary["verify_report"] = run_verify(run_id, args)
    json_path, md_path = write_reports(run_id, summary)
    if args.print_json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        print(f"report_json={json_path}")
        print(f"report_md={md_path}")
        print(f"overall_ok={summary['overall_ok']}")
    return 0 if summary["overall_ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
