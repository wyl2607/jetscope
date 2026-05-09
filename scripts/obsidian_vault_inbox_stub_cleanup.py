#!/usr/bin/env python3
"""Move low-content imported 0-INBOX stubs out of the visible vault.

This is intentionally narrower than a general Inbox cleanup. It only targets
files that look imported from Notion/backup tooling and have almost no body
after removing metadata, headings, sync banners, and unsupported-block markers.
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
ANY_FRONTMATTER_RE = re.compile(r"---\n.*?\n---\n", re.DOTALL)
WORD_RE = re.compile(r"[A-Za-z0-9]+|[\u4e00-\u9fff]")


@dataclasses.dataclass
class Candidate:
    source_rel: str
    target_rel: str
    reason: str
    signal_words: int


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


def stripped_body(text: str, title: str) -> str:
    body = text
    previous = None
    while previous != body:
        previous = body
        body = FRONTMATTER_RE.sub("", body)
    body = ANY_FRONTMATTER_RE.sub("", body)
    body = re.sub(r"^#\s+.*$", "", body, flags=re.MULTILINE)
    body = re.sub(r"^>\s*Synced from Notion.*$", "", body, flags=re.MULTILINE)
    body = re.sub(r"<!--\s*Unsupported block type:[^>]+-->", "", body, flags=re.IGNORECASE)
    body = body.replace(title, "")
    return body.strip()


def signal_word_count(text: str) -> int:
    return len(WORD_RE.findall(text))


def is_imported(text: str) -> bool:
    return (
        "source_path:" in text
        and "imported_at:" in text
        and ("tags: [inbox, imported]" in text or "notion_page_id:" in text or "notion_url:" in text)
    )


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


def collect_candidates(vault: Path, stamp: str, threshold: int) -> list[Candidate]:
    inbox = vault / "0-INBOX"
    cleanup_root = f".obsidian-repair-backups/cleanup-{stamp}/inbox-import-stubs"
    candidates: list[Candidate] = []
    for path in sorted(inbox.glob("*.md")):
        text = read_text(path)
        if not is_imported(text):
            continue
        title = extract_title(text, path.stem)
        body = stripped_body(text, title)
        words = signal_word_count(body)
        opaque_name = path.name.startswith("Page_")
        unsupported_only = "Unsupported block type" in text and words <= threshold
        empty_import = words <= threshold and (opaque_name or unsupported_only or path.name.endswith("-2.md"))
        if empty_import:
            rel = path.relative_to(vault).as_posix()
            candidates.append(
                Candidate(
                    source_rel=rel,
                    target_rel=f"{cleanup_root}/{rel}",
                    reason="empty-import-stub",
                    signal_words=words,
                )
            )
    return candidates


def write_header(manifest: Path, vault: Path, stamp: str, dry_run: bool, candidates: list[Candidate]) -> None:
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(
        json.dumps(
            {
                "type": "header",
                "stamp": stamp,
                "vault_name": vault.name,
                "dry_run": dry_run,
                "candidate_count": len(candidates),
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


def apply(candidates: list[Candidate], vault: Path, manifest: Path, dry_run: bool) -> tuple[int, int]:
    moved = 0
    skipped = 0
    for candidate in candidates:
        source = vault / candidate.source_rel
        if not source.exists():
            skipped += 1
            append_manifest(manifest, {"type": "move", "status": "skipped-missing-source", **dataclasses.asdict(candidate)})
            continue
        target_rel = unique_target(vault, candidate.target_rel)
        target = vault / target_rel
        append_manifest(
            manifest,
            {
                "type": "move",
                "status": "planned" if dry_run else "moved",
                **dataclasses.asdict(candidate),
                "target_rel": target_rel,
            },
        )
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
        moved += 1
    return moved, skipped


def write_summary(path: Path, stamp: str, dry_run: bool, candidates: list[Candidate], moved: int, skipped: int) -> None:
    lines = [
        "# Inbox Stub Cleanup Summary",
        "",
        f"- stamp: `{stamp}`",
        f"- dry_run: `{dry_run}`",
        f"- planned_or_moved: `{moved}`",
        f"- skipped: `{skipped}`",
        "",
        "## Candidates",
        "",
    ]
    for candidate in candidates[:120]:
        lines.append(f"- `{candidate.source_rel}` -> `{candidate.target_rel}`; words={candidate.signal_words}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vault", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("/Users/yumei/obsidian-audit-output"))
    parser.add_argument("--stamp", default=now_stamp())
    parser.add_argument("--threshold", type=int, default=20)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    vault = args.vault.expanduser().resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidates = collect_candidates(vault, args.stamp, args.threshold)
    dry_run = not args.apply
    manifest = args.output_dir / f"inbox-stub-cleanup-manifest-{args.stamp}.jsonl"
    summary = args.output_dir / f"inbox-stub-cleanup-summary-{args.stamp}.md"
    write_header(manifest, vault, args.stamp, dry_run, candidates)
    moved, skipped = apply(candidates, vault, manifest, dry_run)
    write_summary(summary, args.stamp, dry_run, candidates, moved, skipped)
    print(f"Manifest: {manifest}")
    print(f"Summary: {summary}")
    print(f"Moves planned/executed: {moved}; skipped: {skipped}; dry_run={dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
