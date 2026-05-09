#!/usr/bin/env python3
"""Decision-only AI assistant router for the local resource governor."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_REGISTRY = ROOT / "config/ai-assistants.registry.yaml"
DEFAULT_PROBE = ROOT / "runtime/ai-resource/ai-resource-probe.json"
PROBE_SCRIPT = ROOT / "scripts/ai_resource_probe.py"
RESTRICTED_CAPABILITIES = {
    "secrets",
    "production_deploy",
    "delete_files",
    "broad_refactor",
    "large_scale_refactor",
}
FREE_DYNAMIC_COST_MODELS = {"free_dynamic", "free_or_low_cost", "low_cost_dynamic"}
FREE_DYNAMIC_PROVIDERS = {"openrouter", "google", "moonshot", "alibaba"}
PRIVACY_RANK = {
    "public": 0,
    "no_secrets": 1,
    "local_only": 2,
    "project_code_allowed": 3,
    "secrets_allowed": 4,
}
COMPLEXITY_LANES = {
    "low": ["summary", "classification", "low_risk_docs", "fast_patch", "explanation"],
    "medium": ["small_coding", "tests", "task_packet", "code_review", "fast_patch"],
    "high": ["complex_coding", "complex_refactor", "architecture", "repo_refactor", "reasoning_review", "long_context"],
}


def _load_probe_module():
    spec = importlib.util.spec_from_file_location("ai_resource_probe_for_router", PROBE_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_probe_module = _load_probe_module()
load_registry = _probe_module.load_registry


def normalize_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return [str(value)]


def is_free_dynamic(assistant: Dict[str, Any]) -> bool:
    return assistant.get("cost_model") in FREE_DYNAMIC_COST_MODELS or assistant.get("provider") in FREE_DYNAMIC_PROVIDERS


def privacy_allows(assistant_privacy: str, requested_privacy: str) -> bool:
    return PRIVACY_RANK.get(assistant_privacy, -1) >= PRIVACY_RANK.get(requested_privacy, 99)


def quota_value(assistant_id: str, quota_remaining: Dict[str, Any]) -> Any:
    if assistant_id in quota_remaining:
        return quota_remaining[assistant_id]
    return quota_remaining.get("*", "unknown")


def quota_allows(value: Any, estimated_tokens: int) -> tuple[bool, str]:
    if value in {None, "unknown", ""}:
        return True, "estimated"
    try:
        remaining = int(value)
    except (TypeError, ValueError):
        return True, "estimated"
    return remaining >= estimated_tokens, "exact"


def capability_match(assistant: Dict[str, Any], required: Sequence[str], complexity: str) -> tuple[bool, List[str]]:
    lanes = set(normalize_list(assistant.get("task_lanes")))
    desired = set(COMPLEXITY_LANES.get(complexity, [])) | set(required)
    matched = sorted(lanes & desired)
    if required and not set(required) <= lanes:
        return False, matched
    return bool(matched), matched


def safety_blocks(assistant: Dict[str, Any], required: Sequence[str], risk_class: str, privacy_class: str) -> List[str]:
    blocks: List[str] = []
    restricted = sorted(set(required) & RESTRICTED_CAPABILITIES)
    if is_free_dynamic(assistant) and (restricted or privacy_class == "secrets_allowed"):
        details = list(restricted)
        if privacy_class == "secrets_allowed":
            details.append("secrets_allowed")
        blocks.append(f"free_dynamic_restricted_task:{','.join(sorted(set(details)))}")
    if assistant.get("lifecycle") in {"retired", "deprecated"}:
        blocks.append(f"lifecycle_{assistant.get('lifecycle')}")
    if risk_class == "high_risk" and is_free_dynamic(assistant):
        blocks.append("free_dynamic_high_risk:high_risk_requires_non_dynamic_assistant")
    return blocks


def score_assistant(
    assistant: Dict[str, Any],
    *,
    matched_lanes: Sequence[str],
    quota_confidence: str,
    cost_sensitivity: str,
) -> float:
    score = float(assistant.get("quality_score", 0)) * 0.55
    score += float(assistant.get("reliability_score", 0)) * 0.35
    score += min(len(matched_lanes), 4) * 0.03
    if assistant.get("lifecycle") == "core_pinned":
        score += 0.08
    if quota_confidence == "exact":
        score += 0.03
    if cost_sensitivity == "high" and is_free_dynamic(assistant):
        score += 0.10
    if cost_sensitivity == "low" and is_free_dynamic(assistant):
        score -= 0.08
    return round(score, 4)


def route_task(
    request: Dict[str, Any],
    *,
    registry_path: Path = DEFAULT_REGISTRY,
    quota_remaining: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    registry = load_registry(registry_path)
    complexity = str(request.get("task_complexity", "medium"))
    risk_class = str(request.get("risk_class", "low_risk"))
    required = normalize_list(request.get("required_capabilities"))
    privacy_class = str(request.get("privacy_class", "project_code_allowed"))
    estimated_tokens = int(request.get("estimated_tokens", 0) or 0)
    cost_sensitivity = str(request.get("cost_sensitivity", "medium"))
    quota_map = quota_remaining or request.get("quota_remaining") or {}

    candidates: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []
    for assistant in registry["assistants"]:
        reasons: List[str] = []
        if not privacy_allows(str(assistant.get("privacy_class")), privacy_class):
            reasons.append("privacy_class_insufficient")
        matched_ok, matched_lanes = capability_match(assistant, required, complexity)
        if not matched_ok:
            reasons.append("capability_mismatch")
        reasons.extend(safety_blocks(assistant, required, risk_class, privacy_class))
        quota_ok, confidence = quota_allows(quota_value(assistant["id"], quota_map), estimated_tokens)
        if not quota_ok:
            reasons.append("quota_insufficient")
        if reasons:
            rejected.append({"id": assistant["id"], "reasons": reasons})
            continue
        score = score_assistant(
            assistant,
            matched_lanes=matched_lanes,
            quota_confidence=confidence,
            cost_sensitivity=cost_sensitivity,
        )
        candidates.append(
            {
                "assistant": assistant,
                "score": score,
                "matched_lanes": matched_lanes,
                "quota_confidence": confidence,
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    requires_human_approval = risk_class == "high_risk"
    if not candidates:
        return {
            "ok": False,
            "assistant": None,
            "requires_human_approval": requires_human_approval,
            "confidence": "none",
            "reason": "no assistant satisfied privacy, capability, quota, and safety constraints",
            "rejected": rejected,
        }

    winner = candidates[0]
    assistant = winner["assistant"]
    confidence = winner["quota_confidence"]
    reason = (
        f"selected {assistant['id']} for {complexity}/{risk_class}; "
        f"matched lanes: {', '.join(winner['matched_lanes'])}; "
        f"quota confidence: {confidence}"
    )
    if requires_human_approval:
        reason += "; high_risk requires human approval before execution"
    return {
        "ok": True,
        "assistant": assistant["id"],
        "provider": assistant["provider"],
        "lifecycle": assistant["lifecycle"],
        "requires_human_approval": requires_human_approval,
        "confidence": confidence,
        "score": winner["score"],
        "reason": reason,
        "fallback_assistants": [item["assistant"]["id"] for item in candidates[1:]],
        "rejected": rejected,
    }


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--task-complexity", default="medium")
    parser.add_argument("--risk-class", default="low_risk")
    parser.add_argument("--required-capabilities", default="")
    parser.add_argument("--privacy-class", default="project_code_allowed")
    parser.add_argument("--estimated-tokens", type=int, default=0)
    parser.add_argument("--quota-remaining", default="unknown")
    parser.add_argument("--cost-sensitivity", default="medium")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    request = {
        "task_complexity": args.task_complexity,
        "risk_class": args.risk_class,
        "required_capabilities": normalize_list(args.required_capabilities),
        "privacy_class": args.privacy_class,
        "estimated_tokens": args.estimated_tokens,
        "quota_remaining": {"*": args.quota_remaining},
        "cost_sensitivity": args.cost_sensitivity,
    }
    decision = route_task(request, registry_path=args.registry)
    if args.json:
        print(json.dumps(decision, ensure_ascii=True, indent=2, sort_keys=True))
    else:
        print(f"{decision.get('assistant')}: {decision['reason']}")
    return 0 if decision["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
