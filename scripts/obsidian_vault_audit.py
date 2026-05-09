#!/usr/bin/env python3
"""Read-only audit for an Obsidian vault.

The script intentionally does not modify, rename, or move notes. It writes a
small JSON report plus a human-readable Markdown report into the chosen output
directory.
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as dt
import hashlib
import json
import os
import re
import statistics
from pathlib import Path
from typing import Iterable


WIKILINK_RE = re.compile(r"!\[\[[^\]]+\]\]|\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
TAG_RE = re.compile(r"(?<![\w/])#([A-Za-z0-9_\-/\u4e00-\u9fff]+)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
SENTENCE_HINT_RE = re.compile(r"[\u3002\uff01\uff1f.!?]\s*")

DEFAULT_EXCLUDES = {
    ".obsidian",
    ".obsidian-repair-backups",
    ".trash",
    ".omx",
    ".git",
    "__pycache__",
    "venv",
    "output",
}


@dataclasses.dataclass
class Note:
    path: Path
    rel: str
    folder: str
    name: str
    size: int
    mtime: float
    text: str
    sha: str
    normalized_sha: str
    title: str | None
    h1: str | None
    tags: list[str]
    links: list[str]
    headings: int
    has_frontmatter: bool
    words_approx: int
    language_hint: str


def iter_markdown_files(vault: Path, excludes: set[str]) -> Iterable[Path]:
    for root, dirs, files in os.walk(vault):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if d not in excludes and not d.startswith("_Trash_")]
        for filename in files:
            if filename.endswith(".md"):
                yield root_path / filename


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def normalize_text(text: str) -> str:
    text = FRONTMATTER_RE.sub("", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def approx_words(text: str) -> int:
    latin_words = re.findall(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?", text)
    cjk_chars = re.findall(r"[\u4e00-\u9fff]", text)
    return len(latin_words) + len(cjk_chars)


def language_hint(text: str) -> str:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if cjk and latin:
        ratio = cjk / max(1, cjk + latin)
        if ratio > 0.65:
            return "mostly-zh"
        if ratio < 0.25:
            return "mostly-en"
        return "mixed-zh-en"
    if cjk:
        return "zh"
    if latin:
        return "en"
    return "other"


def first_title(text: str) -> tuple[str | None, str | None, int]:
    headings = [(len(m.group(1)), m.group(2).strip()) for m in HEADING_RE.finditer(text)]
    h1 = next((title for level, title in headings if level == 1), None)
    any_heading = headings[0][1] if headings else None
    return any_heading, h1, len(headings)


def parse_note(path: Path, vault: Path) -> Note:
    text = read_text(path)
    stat = path.stat()
    rel = path.relative_to(vault).as_posix()
    folder = str(Path(rel).parent)
    if folder == ".":
        folder = "(root)"
    title, h1, heading_count = first_title(text)
    tags = sorted(set(TAG_RE.findall(text)))
    links = sorted(set(link.strip() for link in WIKILINK_RE.findall(text) if link.strip()))
    raw = text.encode("utf-8", errors="replace")
    normalized = normalize_text(text).encode("utf-8", errors="replace")
    return Note(
        path=path,
        rel=rel,
        folder=folder,
        name=path.stem,
        size=stat.st_size,
        mtime=stat.st_mtime,
        text=text,
        sha=hashlib.sha256(raw).hexdigest(),
        normalized_sha=hashlib.sha256(normalized).hexdigest(),
        title=title,
        h1=h1,
        tags=tags,
        links=links,
        headings=heading_count,
        has_frontmatter=bool(FRONTMATTER_RE.match(text)),
        words_approx=approx_words(text),
        language_hint=language_hint(text),
    )


def top(counter: collections.Counter, n: int = 30) -> list[tuple[str, int]]:
    return counter.most_common(n)


def percentile(values: list[int], p: float) -> float:
    if not values:
        return 0
    values = sorted(values)
    k = (len(values) - 1) * p
    low = int(k)
    high = min(low + 1, len(values) - 1)
    if low == high:
        return values[low]
    return values[low] * (high - k) + values[high] * (k - low)


def sample_notes(notes: list[Note], limit: int) -> list[dict[str, object]]:
    samples: list[Note] = []
    by_folder: dict[str, list[Note]] = collections.defaultdict(list)
    for note in notes:
        by_folder[note.folder].append(note)
    for folder_notes in sorted(by_folder.values(), key=len, reverse=True):
        samples.extend(sorted(folder_notes, key=lambda n: n.mtime, reverse=True)[:2])
    deduped: list[Note] = []
    seen: set[str] = set()
    for note in samples:
        if note.rel not in seen:
            deduped.append(note)
            seen.add(note.rel)
        if len(deduped) >= limit:
            break
    return [
        {
            "path": note.rel,
            "folder": note.folder,
            "title_or_first_heading": note.title,
            "size": note.size,
            "words_approx": note.words_approx,
            "tags": note.tags[:12],
            "links_count": len(note.links),
            "language": note.language_hint,
            "mtime": dt.datetime.fromtimestamp(note.mtime).isoformat(timespec="seconds"),
            "excerpt": " ".join(note.text.strip().split())[:420],
        }
        for note in deduped
    ]


def build_report(vault: Path, notes: list[Note], skipped: list[dict[str, str]]) -> dict[str, object]:
    folder_counts = collections.Counter(note.folder.split("/")[0] for note in notes)
    full_folder_counts = collections.Counter(note.folder for note in notes)
    tag_counts = collections.Counter(tag for note in notes for tag in note.tags)
    link_counts = collections.Counter(link for note in notes for link in note.links)
    lang_counts = collections.Counter(note.language_hint for note in notes)
    no_frontmatter = [note.rel for note in notes if not note.has_frontmatter]
    no_headings = [note.rel for note in notes if note.headings == 0]
    no_links = [note.rel for note in notes if not note.links]
    long_names = [note.rel for note in notes if len(Path(note.rel).name) > 120]
    possible_daily_suffixes = [
        note.rel for note in notes if re.search(r" \d{1,3}\.md$", Path(note.rel).name)
    ]
    duplicate_exact = {
        sha: [note.rel for note in group]
        for sha, group in group_by(notes, "sha").items()
        if len(group) > 1
    }
    duplicate_normalized = {
        sha: [note.rel for note in group]
        for sha, group in group_by(notes, "normalized_sha").items()
        if len(group) > 1
    }
    sizes = [note.size for note in notes]
    words = [note.words_approx for note in notes]
    dates = [note.mtime for note in notes]
    imported_like = [
        note.rel
        for note in notes
        if any(token.lower() in note.rel.lower() for token in ("import", "notion", "desktop", "downloads", "inbox"))
    ]
    orphanish = [
        note.rel
        for note in notes
        if not note.links and note.folder not in {"Templates", "Attachments"}
    ]
    return {
        "vault": str(vault),
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "summary": {
            "markdown_files": len(notes),
            "skipped_unreadable": len(skipped),
            "folders_top_level": len(folder_counts),
            "tags_unique": len(tag_counts),
            "wikilinks_unique": len(link_counts),
            "frontmatter_missing": len(no_frontmatter),
            "heading_missing": len(no_headings),
            "wikilinks_missing": len(no_links),
            "long_filenames_over_120_chars": len(long_names),
            "possible_numbered_duplicates": len(possible_daily_suffixes),
            "exact_duplicate_groups": len(duplicate_exact),
            "normalized_duplicate_groups": len(duplicate_normalized),
            "imported_like_paths": len(imported_like),
        },
        "size_stats": {
            "bytes_total": sum(sizes),
            "bytes_median": statistics.median(sizes) if sizes else 0,
            "bytes_p90": percentile(sizes, 0.9),
            "words_median": statistics.median(words) if words else 0,
            "words_p90": percentile(words, 0.9),
            "oldest_mtime": dt.datetime.fromtimestamp(min(dates)).isoformat(timespec="seconds") if dates else None,
            "newest_mtime": dt.datetime.fromtimestamp(max(dates)).isoformat(timespec="seconds") if dates else None,
        },
        "top_level_folders": top(folder_counts, 60),
        "deep_folders": top(full_folder_counts, 80),
        "languages": top(lang_counts, 10),
        "top_tags": top(tag_counts, 80),
        "top_links": top(link_counts, 80),
        "issue_samples": {
            "long_filenames": long_names[:80],
            "possible_numbered_duplicates": possible_daily_suffixes[:120],
            "no_headings": no_headings[:120],
            "no_links": no_links[:120],
            "imported_like": imported_like[:120],
            "orphanish": orphanish[:120],
        },
        "duplicate_exact": dict(list(duplicate_exact.items())[:80]),
        "duplicate_normalized": dict(list(duplicate_normalized.items())[:80]),
        "representative_samples": sample_notes(notes, 80),
        "skipped": skipped[:200],
    }


def group_by(notes: list[Note], attr: str) -> dict[str, list[Note]]:
    groups: dict[str, list[Note]] = collections.defaultdict(list)
    for note in notes:
        groups[getattr(note, attr)].append(note)
    return groups


def markdown_report(data: dict[str, object]) -> str:
    summary = data["summary"]
    size_stats = data["size_stats"]
    lines = [
        "# Obsidian Vault Audit",
        "",
        f"- Vault: `{data['vault']}`",
        f"- Generated: `{data['generated_at']}`",
        "",
        "## Summary",
        "",
    ]
    for key, value in summary.items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Size / Time", ""])
    for key, value in size_stats.items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Top-Level Folders", ""])
    for folder, count in data["top_level_folders"]:
        lines.append(f"- `{folder}`: {count}")
    lines.extend(["", "## Languages", ""])
    for lang, count in data["languages"]:
        lines.append(f"- `{lang}`: {count}")
    lines.extend(["", "## Top Tags", ""])
    for tag, count in data["top_tags"][:40]:
        lines.append(f"- `#{tag}`: {count}")
    lines.extend(["", "## Top Links", ""])
    for link, count in data["top_links"][:40]:
        lines.append(f"- `[[{link}]]`: {count}")
    lines.extend(["", "## Issue Samples", ""])
    for bucket, paths in data["issue_samples"].items():
        lines.extend(["", f"### {bucket}", ""])
        for path in paths[:40]:
            lines.append(f"- `{path}`")
    lines.extend(["", "## Representative Samples", ""])
    for sample in data["representative_samples"][:30]:
        title = sample["title_or_first_heading"] or "(no heading)"
        lines.append(f"- `{sample['path']}` — {title}; tags={sample['tags']}; links={sample['links_count']}; lang={sample['language']}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vault", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path.cwd() / "obsidian-audit-output")
    parser.add_argument("--exclude", action="append", default=[])
    args = parser.parse_args()

    vault = args.vault.expanduser().resolve()
    if not vault.exists():
        raise SystemExit(f"Vault does not exist: {vault}")

    excludes = DEFAULT_EXCLUDES | set(args.exclude)
    notes: list[Note] = []
    skipped: list[dict[str, str]] = []
    for path in iter_markdown_files(vault, excludes):
        try:
            notes.append(parse_note(path, vault))
        except (FileNotFoundError, PermissionError, OSError) as exc:
            try:
                rel = path.relative_to(vault).as_posix()
            except ValueError:
                rel = str(path)
            skipped.append({"path": rel, "error": f"{type(exc).__name__}: {exc}"})
    data = build_report(vault, notes, skipped)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "obsidian_vault_audit.json"
    md_path = args.output_dir / "obsidian_vault_audit.md"
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(markdown_report(data), encoding="utf-8")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
