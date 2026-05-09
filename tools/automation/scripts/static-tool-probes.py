#!/usr/bin/env python3
"""Read-only availability probe for optional static analysis tools."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON = ROOT / "runtime/self-evolution/static-tool-probes.json"
DEFAULT_MD = ROOT / "runtime/self-evolution/static-tool-probes.md"
TOOLS = [
    {
        "name": "lychee",
        "purpose": "Markdown/HTML link rot checks.",
        "command_template": "lychee --no-progress README.md workspace-guides/**/*.md",
        "probe_argv": ["lychee", "--no-progress", "--offline", "README.md"],
    },
    {
        "name": "semgrep",
        "purpose": "Security and risky-pattern static analysis.",
        "command_template": "semgrep scan --config auto --error --exclude runtime .",
        "probe_argv": ["semgrep", "scan", "--metrics=off", "--disable-version-check", "--config", "p/python", "--exclude", "runtime", "scripts/static-tool-probes.py"],
    },
    {
        "name": "ast-grep",
        "purpose": "AST-aware code search and mechanical rewrite probes.",
        "command_template": "ast-grep scan --config sgconfig.yml .",
        "fallback_binaries": ["sg"],
        "probe_argv": ["ast-grep", "run", "--pattern", "$A or {}", "--selector", "boolean_operator", "--lang", "python", "scripts", "tests", "--json=stream"],
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def tail(value: str, limit: int = 2000) -> str:
    return value[-limit:]


def run_scan(tool: dict[str, Any], binary: str) -> dict[str, Any]:
    argv = list(tool["probe_argv"])
    argv[0] = binary
    try:
        proc = subprocess.run(argv, cwd=str(ROOT), text=True, capture_output=True, check=False, timeout=30)
    except subprocess.TimeoutExpired as exc:
        return {
            "executed": True,
            "status": "failed",
            "returncode": "timeout",
            "argv": argv,
            "stdout_tail": tail(exc.stdout or ""),
            "stderr_tail": tail(exc.stderr or "timeout"),
        }
    ok_returncodes = {0, 1} if tool["name"] in {"lychee", "ast-grep"} else {0}
    return {
        "executed": True,
        "status": "passed" if proc.returncode in ok_returncodes else "failed",
        "returncode": proc.returncode,
        "argv": argv,
        "stdout_tail": tail(proc.stdout),
        "stderr_tail": tail(proc.stderr),
    }


def probe_tool(tool: dict[str, Any], run_checks: bool = True) -> dict[str, Any]:
    candidates = [tool["name"]] + list(tool.get("fallback_binaries") or [])
    binary = ""
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            binary = found
            break
    status = "available" if binary else "missing"
    scan = {"executed": False, "status": "not-run", "returncode": None, "argv": []}
    if binary and run_checks:
        scan = run_scan(tool, binary)
    return {
        "name": tool["name"],
        "status": status,
        "mode": "ready" if binary and scan["status"] == "passed" else "warning",
        "binary": binary,
        "purpose": tool["purpose"],
        "command_template": tool["command_template"],
        "installs_or_network": False,
        "scan": scan,
    }


def build_report(run_checks: bool = True) -> dict[str, Any]:
    tools = [probe_tool(tool, run_checks=run_checks) for tool in TOOLS]
    available = [tool for tool in tools if tool["status"] == "available"]
    missing = [tool for tool in tools if tool["status"] == "missing"]
    executed = [tool for tool in tools if tool["scan"]["executed"]]
    failed = [tool for tool in executed if tool["scan"]["status"] != "passed"]
    return {
        "ok": True,
        "generated_at": utc_now(),
        "scanner": "static-tool-probes",
        "summary": {
            "tool_count": len(tools),
            "available_count": len(available),
            "missing_count": len(missing),
            "executed_count": len(executed),
            "failed_scan_count": len(failed),
        },
        "tools": tools,
        "safety": {
            "read_only": True,
            "installs_tools": False,
            "uses_network": False,
            "missing_tools_fail_daily": False,
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Static Tool Probes",
        "",
        f"- available: `{summary['available_count']}`",
        f"- missing: `{summary['missing_count']}`",
        f"- executed: `{summary['executed_count']}`",
        f"- failed scans: `{summary['failed_scan_count']}`",
        "",
        "Missing or locally broken tools are warnings only. This probe never installs packages and never uses network.",
        "",
        "## Tools",
    ]
    for tool in report["tools"]:
        scan = tool.get("scan") or {}
        lines.append(f"- `{tool['name']}` `{tool['status']}` scan=`{scan.get('status')}` rc=`{scan.get('returncode')}`: {tool['purpose']} Command: `{tool['command_template']}`")
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(report), encoding="utf-8")


def self_test() -> None:
    report = build_report(run_checks=False)
    assert report["ok"] is True
    assert {tool["name"] for tool in report["tools"]} == {"lychee", "semgrep", "ast-grep"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MD)
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--no-run", action="store_true", help="Only detect binaries; do not run read-only tool probes.")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print(json.dumps({"ok": True, "script": "static-tool-probes"}, indent=2))
        return 0
    report = build_report(run_checks=not args.no_run)
    if not args.no_write:
        write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
