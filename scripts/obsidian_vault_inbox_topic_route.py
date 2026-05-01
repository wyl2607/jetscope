#!/usr/bin/env python3
"""Route high-confidence 0-INBOX notes into topic folders.

This script is intentionally rule-based and conservative. It moves files only
when filename/content keywords strongly indicate a destination. Everything else
stays in 0-INBOX for later human or higher-context review.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import re
import shutil
from pathlib import Path


FRONTMATTER_RE = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)
DEFAULT_RULES_FILE = Path("/Users/yumei/obsidian-audit-output/inbox-topic-route-rules.json")


@dataclasses.dataclass
class Route:
    source_rel: str
    target_rel: str
    topic: str
    matched_rule: str
    confidence: str


Rule = tuple[str, str, tuple[str, ...]]


def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def extract_title(text: str, fallback: str) -> str:
    match = re.search(r'^title:\s*"?([^"\n]+)"?\s*$', text, re.MULTILINE)
    if match:
        return match.group(1).strip()
    heading = re.search(r"^#\s+(.+?)\s*$", text, re.MULTILINE)
    if heading:
        return heading.group(1).strip()
    return fallback


def body_without_frontmatter(text: str) -> str:
    previous = None
    body = text
    while previous != body:
        previous = body
        body = FRONTMATTER_RE.sub("", body)
    return body


def normalize(value: str) -> str:
    return value.casefold().replace("_", " ")


def has_cjk(value: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in value)


def keyword_matches(haystack: str, keyword: str) -> bool:
    normalized_keyword = normalize(keyword)
    if not normalized_keyword:
        return False
    if has_cjk(normalized_keyword):
        return normalized_keyword in haystack
    pattern = r"(?<![a-z0-9])" + re.escape(normalized_keyword) + r"(?![a-z0-9])"
    return re.search(pattern, haystack) is not None


def load_rules(path: Path) -> list[Rule]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rules: list[Rule] = []
    for item in data.get("rules", []):
        topic = str(item.get("topic") or "").strip()
        target_dir = str(item.get("target_dir") or "").strip()
        keywords = tuple(str(keyword).strip() for keyword in item.get("keywords", []) if str(keyword).strip())
        if topic and target_dir and keywords:
            rules.append((topic, target_dir, keywords))
    return rules


def choose_route(path: Path, text: str, title: str, rules: list[Rule]) -> tuple[str, str, str] | None:
    _ = text
    haystack = normalize(" ".join([path.name, title]))
    for topic, target_dir, keywords in rules:
        for keyword in keywords:
            if keyword_matches(haystack, keyword):
                return topic, target_dir, keyword
    return None


def unique_target(vault: Path, rel: str) -> str:
    target = vault / rel
    if not target.exists():
        return rel
    parent = target.parent
    stem = target.stem
    suffix = target.suffix
    index = 2
    while True:
        candidate = parent / f"{stem}__{index}{suffix}"
        if not candidate.exists():
            return candidate.relative_to(vault).as_posix()
        index += 1


def collect_routes(vault: Path, rules: list[Rule]) -> list[Route]:
    routes: list[Route] = []
    inbox = vault / "0-INBOX"
    for path in sorted(inbox.glob("*.md")):
        text = read_text(path)
        title = extract_title(text, path.stem)
        decision = choose_route(path, text, title, rules)
        if not decision:
            continue
        topic, target_dir, keyword = decision
        source_rel = path.relative_to(vault).as_posix()
        target_rel = f"{target_dir}/{path.name}"
        routes.append(
            Route(
                source_rel=source_rel,
                target_rel=target_rel,
                topic=topic,
                matched_rule=keyword,
                confidence="high",
            )
        )
    return routes


def write_header(manifest: Path, vault: Path, stamp: str, dry_run: bool, routes: list[Route]) -> None:
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(
        json.dumps(
            {
                "type": "header",
                "stamp": stamp,
                "vault_name": vault.name,
                "dry_run": dry_run,
                "route_count": len(routes),
                "created_at": dt.datetime.now().isoformat(timespec="seconds"),
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )


def append_manifest(manifest: Path, row: dict) -> None:
    with manifest.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def apply_routes(vault: Path, manifest: Path, routes: list[Route], dry_run: bool) -> tuple[int, int]:
    moved = 0
    skipped = 0
    for route in routes:
        source = vault / route.source_rel
        if not source.exists():
            skipped += 1
            append_manifest(manifest, {"type": "move", "status": "skipped-missing-source", **dataclasses.asdict(route)})
            continue
        target_rel = unique_target(vault, route.target_rel)
        target = vault / target_rel
        append_manifest(
            manifest,
            {
                "type": "move",
                "status": "planned" if dry_run else "moved",
                **dataclasses.asdict(route),
                "target_rel": target_rel,
            },
        )
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
        moved += 1
    return moved, skipped


def write_summary(path: Path, stamp: str, dry_run: bool, routes: list[Route], moved: int, skipped: int) -> None:
    counts: dict[str, int] = {}
    for route in routes:
        counts[route.topic] = counts.get(route.topic, 0) + 1
    lines = [
        "# Inbox Topic Routing Summary",
        "",
        f"- stamp: `{stamp}`",
        f"- dry_run: `{dry_run}`",
        f"- planned_or_moved: `{moved}`",
        f"- skipped: `{skipped}`",
        "",
        "## Topic Counts",
        "",
    ]
    for topic, count in sorted(counts.items()):
        lines.append(f"- {topic}: {count}")
    lines.extend(["", "## Routes", ""])
    for route in routes:
        lines.append(f"- {route.topic}: `{route.source_rel}` -> `{route.target_rel}`; rule=`{route.matched_rule}`")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vault", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("/Users/yumei/obsidian-audit-output"))
    parser.add_argument("--rules", type=Path, default=DEFAULT_RULES_FILE)
    parser.add_argument("--stamp", default=now_stamp())
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    vault = args.vault.expanduser().resolve()
    rules_path = args.rules.expanduser().resolve()
    if not rules_path.exists():
        raise SystemExit(f"Rules file not found: {rules_path}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    dry_run = not args.apply
    routes = collect_routes(vault, load_rules(rules_path))
    manifest = args.output_dir / f"inbox-topic-route-manifest-{args.stamp}.jsonl"
    summary = args.output_dir / f"inbox-topic-route-summary-{args.stamp}.md"
    write_header(manifest, vault, args.stamp, dry_run, routes)
    moved, skipped = apply_routes(vault, manifest, routes, dry_run)
    write_summary(summary, args.stamp, dry_run, routes, moved, skipped)
    print(f"Manifest: {manifest}")
    print(f"Summary: {summary}")
    print(f"Routes planned/executed: {moved}; skipped: {skipped}; dry_run={dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
