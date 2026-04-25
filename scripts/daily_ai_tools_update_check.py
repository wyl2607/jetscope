#!/usr/bin/env python3
"""Generate a read-only daily AI tools and node health report.

This script intentionally performs probes only. It does not install, update,
remove, sync, deploy, or clean remote state.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import base64
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path("/Users/yumei")
RUNTIME = ROOT / "tools" / "automation" / "runtime" / "ai-tools-update-check"
ALERT_DIR = RUNTIME / "alerts"
VPS_PLAN_DIR = RUNTIME / "vps-remediation-plans"
REGISTRY = ROOT / "tools" / "automation" / "workspace-guides" / "ai-systems-registry.json"

TOOLS = {
    "codex": [["codex", "--version"], ["codex", "-v"]],
    "claude": [["claude", "--version"], ["claude", "-v"]],
    "omx": [["omx", "--version"], ["omx", "-v"]],
    "opencode": [["opencode", "--version"], ["opencode", "-v"]],
    "copilot": [["copilot", "version"], ["copilot", "--version"]],
}

NODES = ["local", "mac-mini", "windows-pc", "coco", "usa-vps", "france-vps"]
REQUIRED_CONTROL_NODES = ["local"]
REQUIRED_AI_WORKER_NODES = ["coco"]
OPTIONAL_AI_WORKER_NODES = ["mac-mini", "windows-pc"]
REQUIRED_INFRA_NODES = ["usa-vps"]
OPTIONAL_INFRA_NODES = ["france-vps"]
REQUIRED_NODES = REQUIRED_CONTROL_NODES + REQUIRED_AI_WORKER_NODES + REQUIRED_INFRA_NODES
OPTIONAL_NODES = OPTIONAL_AI_WORKER_NODES + OPTIONAL_INFRA_NODES
VPS_NODES = {"usa-vps", "france-vps"}
VPS_FORBIDDEN_TOOLS = ["claude", "codex", "omx", "opencode"]
REMOTE_TIMEOUT = 15
ALERT_TIMEOUT = 10


def run(args: list[str], timeout: int = 8) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )


def first_line(text: str | None) -> str | None:
    if not text:
        return None
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line
    return None


def semver(text: str | None) -> str | None:
    if not text:
        return None
    m = re.search(r"\d+\.\d+\.\d+", text)
    return m.group(0) if m else None


def compare_semver(left: str | None, right: str | None) -> int | None:
    if not left or not right:
        return None
    try:
        left_parts = [int(part) for part in left.split(".")]
        right_parts = [int(part) for part in right.split(".")]
    except ValueError:
        return None
    if left_parts == right_parts:
        return 0
    return 1 if left_parts > right_parts else -1


def local_tool_version(tool: str) -> str | None:
    if shutil.which(tool) is None:
        return None
    for args in TOOLS[tool]:
        try:
            proc = run(args)
        except Exception:
            continue
        out = first_line((proc.stdout or "") + "\n" + (proc.stderr or ""))
        if proc.returncode == 0 and out:
            return out
        if out and "version" in " ".join(args).lower():
            return out
    return None


def normalize_remote_version(value: Any) -> str | None:
    if isinstance(value, dict):
        raw = value.get("version")
        return str(raw) if raw else None
    if value is None:
        return None
    return str(value)


def load_latest_versions(local_tools: dict[str, dict[str, Any]]) -> dict[str, str | None]:
    latest: dict[str, str | None] = {name: data.get("current_semver") for name, data in local_tools.items()}
    if REGISTRY.exists():
        try:
            raw = json.loads(REGISTRY.read_text(encoding="utf-8"))
            cli = (((raw.get("runtime_surfaces") or {}).get("cli") or {}))
            mapping = {
                "codex": "codex_cli",
                "claude": "claude_code_cli",
                "omx": "omx_cli",
                "opencode": "opencode_cli",
                "copilot": "copilot_cli",
            }
            for tool, key in mapping.items():
                version = semver((cli.get(key) or {}).get("version"))
                if version:
                    latest[tool] = version
        except Exception:
            pass
    return latest


def collect_tools(is_vps: bool = False, remote_versions: dict[str, str | None] | None = None) -> dict[str, Any]:
    tools: dict[str, Any] = {}
    for name in TOOLS:
        version = normalize_remote_version(remote_versions.get(name)) if remote_versions is not None else local_tool_version(name)
        current = semver(version)
        tools[name] = {
            "installed": bool(version),
            "version": version,
            "current_semver": current,
            "latest_semver": None,
            "status": "installed_latest_unknown" if version else "missing",
            "policy_violation": bool(is_vps and version and name in VPS_FORBIDDEN_TOOLS),
        }
    latest = load_latest_versions(tools)
    for name, info in tools.items():
        info["latest_semver"] = latest.get(name)
        if info["installed"] and info["current_semver"] and info["latest_semver"]:
            cmp = compare_semver(info["current_semver"], info["latest_semver"])
            if cmp == 0:
                info["status"] = "current"
            elif cmp and cmp > 0:
                info["status"] = "ahead_of_registry"
            else:
                info["status"] = "outdated"
    return tools


def local_system() -> dict[str, Any]:
    disk = shutil.disk_usage("/")
    used = round(((disk.total - disk.free) / disk.total) * 100, 2) if disk.total else None
    return {
        "memory_used_percent": None,
        "disk_root_used_percent": used,
        "disk_max_used_percent": used,
        "disk_hot_mounts": [],
        "top_memory_processes": [],
    }


def local_result() -> dict[str, Any]:
    return {
        "node": "local",
        "ok": True,
        "data": {
            "hostname": platform.node(),
            "os": platform.system(),
            "kernel": platform.release(),
            "tools": collect_tools(False),
            "apt_upgradable_count": None,
            "brew_outdated_count": None,
            "system": local_system(),
        },
    }


REMOTE_PROBE = r'''
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
python3 - <<'PY'
import json, os, platform, re, shutil, subprocess
TOOLS = {
 "codex": [["codex","--version"],["codex","-v"]],
 "claude": [["claude","--version"],["claude","-v"]],
 "omx": [["omx","--version"],["omx","-v"]],
 "opencode": [["opencode","--version"],["opencode","-v"]],
 "copilot": [["copilot","version"],["copilot","--version"]],
}
def first_line(s):
  for line in (s or '').splitlines():
    line=line.strip()
    if line: return line
  return None
out={"hostname": platform.node(), "os": platform.system(), "kernel": platform.release(), "tools": {}, "apt_upgradable_count": None, "brew_outdated_count": None, "system": {"memory_used_percent": None, "disk_root_used_percent": None, "disk_max_used_percent": None, "disk_hot_mounts": [], "top_memory_processes": []}}
for name, matrix in TOOLS.items():
  version=None
  source=None
  path=shutil.which(name)
  if path:
    for args in matrix:
      try:
        p=subprocess.run(args, capture_output=True, text=True, timeout=5)
      except Exception:
        continue
      line=first_line((p.stdout or '')+'\n'+(p.stderr or ''))
      if line:
        version=line
        source=path
        break
  out["tools"][name]={"version": version, "source": source}
try:
  disk=shutil.disk_usage('/')
  used=round(((disk.total-disk.free)/disk.total)*100,2) if disk.total else None
  out["system"]["disk_root_used_percent"]=used
  out["system"]["disk_max_used_percent"]=used
except Exception:
  pass
print(json.dumps(out, ensure_ascii=False))
PY
'''


WINDOWS_PROBE = r'''
$ErrorActionPreference = 'SilentlyContinue'
function FirstLine($value) {
  if ($null -eq $value) { return $null }
  foreach ($line in (($value | Out-String) -split "`r?`n")) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -gt 0) { return $trimmed }
  }
  return $null
}
function ToolVersion($name, $argSets) {
  if ($null -eq (Get-Command $name -ErrorAction SilentlyContinue)) { return $null }
  foreach ($args in $argSets) {
    try {
      $output = & $name @args 2>&1
      $line = FirstLine $output
      if ($line) { return $line }
    } catch {}
  }
  return $null
}
$osInfo = Get-CimInstance Win32_OperatingSystem
$drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$diskUsed = $null
if ($drive -and $drive.Size -and [double]$drive.Size -gt 0) {
  $diskUsed = [math]::Round((( [double]$drive.Size - [double]$drive.FreeSpace) / [double]$drive.Size) * 100, 2)
}
$memoryUsed = $null
if ($osInfo -and $osInfo.TotalVisibleMemorySize -and [double]$osInfo.TotalVisibleMemorySize -gt 0) {
  $memoryUsed = [math]::Round((( [double]$osInfo.TotalVisibleMemorySize - [double]$osInfo.FreePhysicalMemory) / [double]$osInfo.TotalVisibleMemorySize) * 100, 2)
}
$tools = [ordered]@{
  codex = ToolVersion 'codex' @(@('--version'), @('-v'))
  claude = ToolVersion 'claude' @(@('--version'), @('-v'))
  omx = ToolVersion 'omx' @(@('--version'), @('-v'))
  opencode = ToolVersion 'opencode' @(@('--version'), @('-v'))
  copilot = ToolVersion 'copilot' @(@('version'), @('--version'))
}
$result = [ordered]@{
  hostname = $env:COMPUTERNAME
  os = 'Windows'
  kernel = if ($osInfo) { $osInfo.Version } else { $null }
  tools = $tools
  apt_upgradable_count = $null
  brew_outdated_count = $null
  system = [ordered]@{
    memory_used_percent = $memoryUsed
    disk_root_used_percent = $diskUsed
    disk_max_used_percent = $diskUsed
    disk_hot_mounts = @()
    top_memory_processes = @()
  }
}
$result | ConvertTo-Json -Depth 6 -Compress
'''


def windows_probe_command() -> list[str]:
    encoded = base64.b64encode(WINDOWS_PROBE.encode("utf-16le")).decode("ascii")
    return ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]


def remote_result(node: str) -> dict[str, Any]:
    if node == "windows-pc":
        command = windows_probe_command()
    else:
        command = [REMOTE_PROBE]
    try:
        proc = run(["ssh", "-o", "BatchMode=yes", "-o", f"ConnectTimeout={REMOTE_TIMEOUT}", node, *command], timeout=REMOTE_TIMEOUT + 10)
    except subprocess.TimeoutExpired:
        return {"node": node, "ok": False, "error": "timeout", "error_kind": "timeout"}
    except Exception as exc:
        return {"node": node, "ok": False, "error": str(exc), "error_kind": "exception"}
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "ssh failed").strip().splitlines()
        return {"node": node, "ok": False, "error": err[-1] if err else "ssh failed", "error_kind": "ssh"}
    try:
        data = json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        return {"node": node, "ok": False, "error": "invalid remote probe output", "error_kind": "parse"}
    tools = collect_tools(node in VPS_NODES, data.get("tools") or {})
    data["tools"] = tools
    return {"node": node, "ok": True, "data": data}


def attach_policy_and_health(item: dict[str, Any]) -> dict[str, Any]:
    node = item["node"]
    required = node in REQUIRED_NODES
    if node in REQUIRED_CONTROL_NODES:
        tier = "required_control"
    elif node in REQUIRED_AI_WORKER_NODES:
        tier = "required_ai_worker"
    elif node in OPTIONAL_AI_WORKER_NODES:
        tier = "optional_ai_worker"
    elif node in REQUIRED_INFRA_NODES:
        tier = "required_infra"
    elif node in OPTIONAL_INFRA_NODES:
        tier = "optional_infra"
    else:
        tier = "required" if required else "optional"
    item["node_policy"] = {"tier": tier, "required": required}
    issues: list[str] = []
    severity = "ok"
    if not item.get("ok"):
        issues.append("offline_required" if required else "offline_optional")
        severity = "critical" if required else "warning"
    else:
        tools = (((item.get("data") or {}).get("tools") or {}))
        violations = [name for name, data in tools.items() if data.get("policy_violation")]
        if violations:
            issues.append("policy_violation:" + ",".join(violations))
            severity = "critical" if required else "warning"
    system = ((item.get("data") or {}).get("system") or {})
    item["health"] = {
        "severity": severity,
        "issues": issues,
        "memory_used_percent": system.get("memory_used_percent"),
        "disk_used_percent": system.get("disk_max_used_percent"),
        "disk_hot_mounts": system.get("disk_hot_mounts") or [],
    }
    return item


def alert_config() -> dict[str, Any]:
    webhook = bool(os.environ.get("AI_ALERT_WEBHOOK_URL"))
    telegram_token = bool(os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("AI_ALERT_TELEGRAM_TOKEN"))
    telegram_chat = bool(os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("AI_ALERT_TELEGRAM_CHAT_ID"))
    local_file = os.environ.get("AI_ALERT_LOCAL_FILE", "1") != "0"
    configured_channels: list[str] = []
    detected_external_channels = []
    if webhook:
        detected_external_channels.append("webhook")
        configured_channels.append("webhook")
    if telegram_token and telegram_chat:
        detected_external_channels.append("telegram")
        configured_channels.append("telegram")
    fallback_channels = ["local-file"] if local_file else []
    accept_local_only = os.environ.get("AI_ALERT_ACCEPT_LOCAL_FILE_ONLY", "1") != "0"
    issues = [] if configured_channels or (local_file and accept_local_only) else ["external_alert_delivery_unimplemented"]
    severity = "ok" if configured_channels or (local_file and accept_local_only) else "critical"
    return {
        "severity": severity,
        "issues": issues,
        "configured_channels": configured_channels,
        "detected_external_channels": detected_external_channels,
        "fallback_channels": fallback_channels,
        "webhook_configured": webhook,
        "local_file_only_accepted": accept_local_only,
        "local_file_configured": local_file,
        "local_file_path": str(ALERT_DIR / "latest-alert.md") if local_file else None,
        "telegram_configured": telegram_token and telegram_chat,
        "telegram_token_present": telegram_token,
        "telegram_chat_id_present": telegram_chat,
    }


def alert_body(summary: dict[str, Any]) -> str:
    lines = [
        f"AI tools daily check: {summary['overall']}",
        f"checked_at={summary['checked_at']}",
    ]
    if summary["critical_global_issues"]:
        lines.append("critical_global=" + ";".join(summary["critical_global_issues"]))
    if summary["critical_nodes"]:
        nodes = [f"{item['node']}({','.join(item['issues'])})" for item in summary["critical_nodes"]]
        lines.append("critical_nodes=" + ";".join(nodes))
    if summary["warning_nodes"]:
        nodes = [f"{item['node']}({','.join(item['issues'])})" for item in summary["warning_nodes"]]
        lines.append("warning_nodes=" + ";".join(nodes))
    return "\n".join(lines)


def post_json(url: str, payload: dict[str, Any]) -> tuple[bool, str]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        return False, "invalid_https_url"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "yumei-ai-tools-check/1"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=ALERT_TIMEOUT) as response:
            return 200 <= response.status < 300, f"http_{response.status}"
    except urllib.error.HTTPError as exc:
        return False, f"http_{exc.code}"
    except Exception as exc:
        return False, exc.__class__.__name__


def validate_alert_channels(config: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if config.get("webhook_configured"):
        url = os.environ.get("AI_ALERT_WEBHOOK_URL") or ""
        parsed = urllib.parse.urlparse(url)
        ok = parsed.scheme == "https" and bool(parsed.netloc)
        results.append({"channel": "webhook", "ok": ok, "status": "configured" if ok else "invalid_https_url"})
    if config.get("telegram_configured"):
        results.append({"channel": "telegram", "ok": True, "status": "configured_unverified"})
    return results


def send_webhook_alert(summary: dict[str, Any]) -> dict[str, Any]:
    url = os.environ.get("AI_ALERT_WEBHOOK_URL")
    if not url:
        return {"channel": "webhook", "attempted": False, "ok": False, "status": "not_configured"}
    payload = {
        "source": "daily_ai_tools_update_check",
        "checked_at": summary["checked_at"],
        "overall": summary["overall"],
        "text": alert_body(summary),
        "summary": summary,
    }
    ok, status = post_json(url, payload)
    return {"channel": "webhook", "attempted": True, "ok": ok, "status": status}


def send_telegram_alert(summary: dict[str, Any]) -> dict[str, Any]:
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("AI_ALERT_TELEGRAM_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("AI_ALERT_TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return {"channel": "telegram", "attempted": False, "ok": False, "status": "not_configured"}
    url = "https://api.telegram.org/bot" + urllib.parse.quote(token, safe="") + "/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": alert_body(summary),
        "disable_web_page_preview": True,
    }
    ok, status = post_json(url, payload)
    return {"channel": "telegram", "attempted": True, "ok": ok, "status": status}


def send_external_alerts(run_dir: Path, report: dict[str, Any], summary: dict[str, Any]) -> list[dict[str, Any]]:
    ALERT_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = validate_alert_channels(report["alert_config"])
    should_send = summary["overall"] != "ok" or os.environ.get("AI_ALERT_SEND_OK") == "1"
    if should_send:
        results = []
        if report["alert_config"].get("webhook_configured"):
            results.append(send_webhook_alert(summary))
        if report["alert_config"].get("telegram_configured"):
            results.append(send_telegram_alert(summary))
    out = json.dumps({"checked_at": summary["checked_at"], "results": results}, ensure_ascii=False, indent=2) + "\n"
    (run_dir / "external-alert-results.json").write_text(out, encoding="utf-8")
    (ALERT_DIR / "latest-external-alert-results.json").write_text(out, encoding="utf-8")
    return results


def render_alert_md(summary: dict[str, Any]) -> str:
    lines = [
        "# AI Tools Daily Alert",
        "",
        f"- Checked at (UTC): {summary['checked_at']}",
        f"- Overall: {summary['overall']}",
        "",
        "## Critical Global Issues",
        "",
    ]
    if summary["critical_global_issues"]:
        lines.extend(f"- {item}" for item in summary["critical_global_issues"])
    else:
        lines.append("- None")
    lines += ["", "## Critical Nodes", ""]
    if summary["critical_nodes"]:
        for item in summary["critical_nodes"]:
            lines.append(f"- {item['node']}: {', '.join(item['issues']) or 'unknown'}")
    else:
        lines.append("- None")
    lines += ["", "## Warning Nodes", ""]
    if summary["warning_nodes"]:
        for item in summary["warning_nodes"]:
            lines.append(f"- {item['node']}: {', '.join(item['issues']) or 'unknown'}")
    else:
        lines.append("- None")
    delivery = ((summary.get("alert_config") or {}).get("last_delivery") or [])
    delivered = [item["channel"] for item in delivery if item.get("ok")]
    if delivered:
        lines += ["", "External alert delivered via: " + ", ".join(delivered), ""]
    else:
        lines += ["", "Generated by local-file fallback; no external alert was sent.", ""]
    return "\n".join(lines)


def write_local_alert(run_dir: Path, summary: dict[str, Any]) -> None:
    ALERT_DIR.mkdir(parents=True, exist_ok=True)
    alert_json = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    alert_md = render_alert_md(summary)
    (run_dir / "alert.json").write_text(alert_json, encoding="utf-8")
    (run_dir / "alert.md").write_text(alert_md, encoding="utf-8")
    (ALERT_DIR / "latest-alert.json").write_text(alert_json, encoding="utf-8")
    (ALERT_DIR / "latest-alert.md").write_text(alert_md, encoding="utf-8")


def alert_health(report: dict[str, Any], delivery_results: list[dict[str, Any]]) -> dict[str, Any]:
    config = report["alert_config"]
    if not config.get("configured_channels"):
        updated = dict(config)
        updated["last_delivery"] = delivery_results
        updated["delivered_channels"] = []
        if config.get("local_file_configured") and config.get("local_file_only_accepted"):
            updated["severity"] = "ok"
            updated["issues"] = []
        return updated
    successful = [item["channel"] for item in delivery_results if item.get("ok") and item.get("status") != "configured_unverified"]
    failed = [item for item in delivery_results if item.get("attempted") and not item.get("ok")]
    invalid = [item for item in delivery_results if item.get("status") == "invalid_https_url"]
    updated = dict(config)
    updated["last_delivery"] = delivery_results
    if invalid:
        updated["severity"] = "critical"
        updated["issues"] = ["external_alert_channel_invalid"]
        updated["delivered_channels"] = []
    elif successful:
        updated["severity"] = "ok"
        updated["issues"] = []
        updated["delivered_channels"] = successful
    elif failed:
        updated["severity"] = "critical"
        updated["issues"] = ["external_alert_delivery_failed"]
        updated["delivered_channels"] = []
    return updated


def critical_summary(report: dict[str, Any]) -> dict[str, Any]:
    offline = [r["node"] for r in report["results"] if not r.get("ok")]
    offline_required = [r["node"] for r in report["results"] if not r.get("ok") and r["node_policy"]["required"]]
    offline_optional = [r["node"] for r in report["results"] if not r.get("ok") and not r["node_policy"]["required"]]
    critical_nodes = []
    warning_nodes = []
    for r in report["results"]:
        h = r.get("health") or {}
        entry = {
            "node": r["node"],
            "tier": r["node_policy"]["tier"],
            "severity": h.get("severity"),
            "issues": h.get("issues") or [],
            "memory_used_percent": h.get("memory_used_percent"),
            "disk_used_percent": h.get("disk_used_percent"),
        }
        if h.get("severity") == "critical":
            critical_nodes.append(entry)
        elif h.get("severity") == "warning":
            warning_nodes.append(entry)
    global_critical = [f"alert_preflight:{i}" for i in report["alert_config"].get("issues", [])]
    overall = "critical" if critical_nodes or global_critical else ("warning" if warning_nodes else "ok")
    return {
        "checked_at": report["checked_at"],
        "overall": overall,
        "offline_nodes": offline,
        "offline_required_nodes": offline_required,
        "offline_optional_nodes": offline_optional,
        "probe_blocked_nodes": [],
        "required_nodes": REQUIRED_NODES,
        "optional_nodes": OPTIONAL_NODES,
        "required_control_nodes": REQUIRED_CONTROL_NODES,
        "required_ai_worker_nodes": REQUIRED_AI_WORKER_NODES,
        "optional_ai_worker_nodes": OPTIONAL_AI_WORKER_NODES,
        "required_infra_nodes": REQUIRED_INFRA_NODES,
        "optional_infra_nodes": OPTIONAL_INFRA_NODES,
        "critical_nodes": critical_nodes,
        "warning_nodes": warning_nodes,
        "critical_global_issues": global_critical,
        "warning_global_issues": [],
        "alert_config": report["alert_config"],
        "memory_leak_suspected_nodes": [],
        "preventive_actions": [],
    }


def render_status(tool: dict[str, Any]) -> str:
    cur = tool.get("current_semver") or "-"
    latest = tool.get("latest_semver") or "?"
    if tool.get("policy_violation"):
        return f"POLICY {cur}/{latest}"
    if not tool.get("installed"):
        return f"-/{latest}"
    return f"{cur}/{latest}"


def render_md(report: dict[str, Any]) -> str:
    lines = [
        "# AI Tools Daily Check Report",
        "",
        f"- Checked at (UTC): {report['checked_at']}",
        f"- Scope: {', '.join(NODES)}",
        "- Policy: VPS forbidden tools = " + ", ".join(VPS_FORBIDDEN_TOOLS),
        f"- Tiering: required_control={', '.join(REQUIRED_CONTROL_NODES)}; required_ai_workers={', '.join(REQUIRED_AI_WORKER_NODES)}; optional_ai_workers={', '.join(OPTIONAL_AI_WORKER_NODES)}; required_infra={', '.join(REQUIRED_INFRA_NODES)}; optional_infra={', '.join(OPTIONAL_INFRA_NODES)}",
        f"- Alert preflight: severity={report['alert_config']['severity']}; channels={','.join(report['alert_config']['configured_channels']) or 'none'}; fallback={','.join(report['alert_config'].get('fallback_channels') or []) or 'none'}",
        "",
        "## Latest references",
        "",
    ]
    for tool, version in report["latest_versions"].items():
        lines.append(f"- {tool}: {version or 'unknown'}")
    lines += [
        "",
        "## Node status",
        "",
        "| Node | OS | codex | claude | omx | opencode | copilot | Notes |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for item in report["results"]:
        node = item["node"]
        notes = [f"tier={item['node_policy']['tier']}"]
        if not item.get("ok"):
            notes.append(item.get("error_kind") or "error")
            notes.append(item.get("error") or "")
            lines.append(f"| {node} | n/a | n/a | n/a | n/a | n/a | n/a | {'; '.join(n for n in notes if n)} |")
            continue
        data = item["data"]
        tools = data["tools"]
        issues = item.get("health", {}).get("issues") or []
        notes.extend(issues)
        system = data.get("system") or {}
        if system.get("disk_max_used_percent") is not None:
            notes.append(f"disk={system['disk_max_used_percent']}%")
        lines.append(
            f"| {node} | {data.get('os') or 'n/a'} | {render_status(tools['codex'])} | {render_status(tools['claude'])} | {render_status(tools['omx'])} | {render_status(tools['opencode'])} | {render_status(tools['copilot'])} | {'; '.join(notes)} |"
        )
    lines += ["", "## Alert channel preflight", ""]
    if report["alert_config"]["issues"]:
        for issue in report["alert_config"]["issues"]:
            lines.append(f"- CRITICAL: {issue}")
    else:
        lines.append("- OK")
    lines += ["", "## Critical alerts", ""]
    summary = critical_summary(report)
    alerts = summary["critical_global_issues"] + [f"{n['node']}: {','.join(n['issues'])}" for n in summary["critical_nodes"]]
    if alerts:
        lines.extend(f"- {a}" for a in alerts)
    else:
        lines.append("- None")
    lines += [
        "",
        "## Actions",
        "",
        "- Daily check generated this report with read-only probes only.",
        "- Do not remediate VPS policy violations without explicit approval.",
        "- Refresh global registry with `python3 /Users/yumei/tools/automation/scripts/refresh_ai_systems_registry.py --write` if runtime inventory changed.",
        "",
    ]
    return "\n".join(lines)


def vps_policy_violations(report: dict[str, Any]) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    for item in report["results"]:
        node = item["node"]
        if node not in VPS_NODES or not item.get("ok"):
            continue
        tools = (((item.get("data") or {}).get("tools") or {}))
        bad = [name for name, data in tools.items() if data.get("policy_violation")]
        if bad:
            violations.append({
                "node": node,
                "tier": item["node_policy"]["tier"],
                "hostname": (item.get("data") or {}).get("hostname"),
                "violations": bad,
                "tools": {name: tools[name] for name in bad},
            })
    return violations


def render_vps_plan_md(report: dict[str, Any]) -> str:
    violations = vps_policy_violations(report)
    tools_pattern = "|".join(VPS_FORBIDDEN_TOOLS)
    tools_commands = "; ".join(f"command -v {tool} || true; {tool} --version 2>/dev/null || true" for tool in VPS_FORBIDDEN_TOOLS)
    dependency_checks = (
        f"crontab -l 2>/dev/null | grep -E \"{tools_pattern}\" || true; "
        f"systemctl list-timers --all 2>/dev/null | grep -E \"{tools_pattern}\" || true; "
        f"systemctl list-units --type=service --all 2>/dev/null | grep -E \"{tools_pattern}\" || true; "
        f"systemctl --user list-units --type=service --all 2>/dev/null | grep -E \"{tools_pattern}\" || true"
    )
    lines = [
        "# VPS AI Tool Policy Remediation Plan",
        "",
        f"- Generated at (UTC): {report['checked_at']}",
        "- Scope: usa-vps, france-vps",
        "- Mode: read-only plan; no cleanup, uninstall, sync, rollout, or remote mutation was performed.",
        "- Approval gate: every remediation command below requires explicit user approval before execution.",
        "",
        "## Current Findings",
        "",
    ]
    if not violations:
        lines.append("- No VPS policy violations found in the latest daily report.")
    else:
        for entry in violations:
            lines.append(f"- {entry['node']} ({entry['tier']}, hostname={entry.get('hostname') or 'unknown'}): {', '.join(entry['violations'])}")
            for tool, info in entry["tools"].items():
                lines.append(f"- {entry['node']} {tool}: {info.get('version') or 'unknown version'}")
    lines += [
        "",
        "## Read-Only Verification Before Cleanup",
        "",
        "Run only after confirming remote access is expected:",
        "",
        "```bash",
        f"ssh -o BatchMode=yes usa-vps '{tools_commands}'",
        f"ssh -o BatchMode=yes france-vps '{tools_commands}'",
        "```",
        "",
        "Also check whether any approved service or cron path references these tools before removal:",
        "",
        "```bash",
        f"ssh -o BatchMode=yes usa-vps '{dependency_checks}'",
        f"ssh -o BatchMode=yes france-vps '{dependency_checks}'",
        "```",
        "",
        "If the commands above show a candidate service, inspect only that unit before cleanup:",
        "",
        "```bash",
        "ssh -o BatchMode=yes usa-vps 'systemctl cat <unit-name>'",
        "ssh -o BatchMode=yes france-vps 'systemctl cat <unit-name>'",
        "```",
        "",
        "## Candidate Remediation After Approval",
        "",
        f"1. Confirm no active approved workflow depends on forbidden tools on VPS nodes: {', '.join(VPS_FORBIDDEN_TOOLS)}.",
        "2. Identify installation paths with `command -v` and package manager metadata where available.",
        "3. Remove only the confirmed policy-violating binaries/packages, preserving logs for audit.",
        "4. Rerun `/Users/yumei/scripts/daily_ai_tools_update_check.py` from the Mac controller.",
        "5. Verify VPS nodes no longer report `policy_violation:*` for any forbidden tool.",
        "",
        "## Rollback Requirement",
        "",
        "Before any approved cleanup, record exact binary paths and package source so the tool can be restored if a legitimate dependency is discovered.",
        "",
    ]
    return "\n".join(lines)


def write_vps_plan(run_dir: Path, report: dict[str, Any]) -> None:
    VPS_PLAN_DIR.mkdir(parents=True, exist_ok=True)
    plan = {
        "generated_at": report["checked_at"],
        "mode": "read-only-plan",
        "approval_required_before_remote_changes": True,
        "violations": vps_policy_violations(report),
    }
    plan_json = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    plan_md = render_vps_plan_md(report)
    (run_dir / "vps-remediation-plan.json").write_text(plan_json, encoding="utf-8")
    (run_dir / "vps-remediation-plan.md").write_text(plan_md, encoding="utf-8")
    (VPS_PLAN_DIR / "latest-plan.json").write_text(plan_json, encoding="utf-8")
    (VPS_PLAN_DIR / "latest-plan.md").write_text(plan_md, encoding="utf-8")


def main() -> int:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    checked_at = datetime.now(timezone.utc).isoformat()
    run_dir = RUNTIME / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    results = [local_result()]
    for node in NODES[1:]:
        results.append(remote_result(node))
    results = [attach_policy_and_health(item) for item in results]
    latest_versions = load_latest_versions(((results[0].get("data") or {}).get("tools") or {}))
    report = {
        "checked_at": checked_at,
        "latest_versions": latest_versions,
        "results": results,
        "alert_config": alert_config(),
        "policy": {
            "vps_forbidden_tools": VPS_FORBIDDEN_TOOLS,
            "required_nodes": REQUIRED_NODES,
            "optional_nodes": OPTIONAL_NODES,
            "required_control_nodes": REQUIRED_CONTROL_NODES,
            "required_ai_worker_nodes": REQUIRED_AI_WORKER_NODES,
            "optional_ai_worker_nodes": OPTIONAL_AI_WORKER_NODES,
            "required_infra_nodes": REQUIRED_INFRA_NODES,
            "optional_infra_nodes": OPTIONAL_INFRA_NODES,
        },
        "preventive_actions": [],
    }
    initial_summary = critical_summary(report)
    if report["alert_config"].get("local_file_configured"):
        write_local_alert(run_dir, initial_summary)
    delivery_results = send_external_alerts(run_dir, report, initial_summary)
    report["alert_config"] = alert_health(report, delivery_results)
    summary = critical_summary(report)
    if report["alert_config"].get("local_file_configured"):
        write_local_alert(run_dir, summary)
    report_json = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    summary_json = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    report_md = render_md(report)

    (run_dir / "report.json").write_text(report_json, encoding="utf-8")
    (run_dir / "report.md").write_text(report_md, encoding="utf-8")
    (run_dir / "critical-summary.json").write_text(summary_json, encoding="utf-8")
    (RUNTIME / "latest-report.json").write_text(report_json, encoding="utf-8")
    (RUNTIME / "latest-report.md").write_text(report_md, encoding="utf-8")
    (RUNTIME / "latest-critical-summary.json").write_text(summary_json, encoding="utf-8")
    write_vps_plan(run_dir, report)

    print(f"[ai-check] run_id={run_id}")
    print(f"[ai-check] json={run_dir / 'report.json'}")
    print(f"[ai-check] md={run_dir / 'report.md'}")
    print(f"[ai-check] overall={summary['overall']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
