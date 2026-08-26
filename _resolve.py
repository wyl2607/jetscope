"""Resolve the conflicts this locale re-land batch produces, mechanically.

Every one of the ten PRs appends one page's keys to the same three locale JSON
files and adds one branch to the same page-template test, from the same base.
So every conflict is an "insert here" vs "insert here" collision, and the
correct resolution is always the union — never a choice between sides.

Doing that by hand ten times, in JSON, is how a key gets dropped silently.
This does it structurally instead:

  *.json  -> parse git stages 1/2/3, three-way merge the dicts, and fail loudly
             on a real semantic conflict (same key, changed differently on both
             sides). Formatting is re-emitted to the repo's 2-space style.
  *.mjs   -> union of both hunks, ours first, markers dropped.

Usage: python _resolve.py            (resolves every conflicted path)
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


def stage(path: str, n: int) -> str | None:
    """Content of a conflicted path at git stage n (1=base, 2=ours, 3=theirs)."""
    r = subprocess.run(["git", "show", f":{n}:{path}"], capture_output=True)
    return r.stdout.decode("utf-8") if r.returncode == 0 else None


def merge_dict(base: dict, ours: dict, theirs: dict, where: str) -> dict:
    """Three-way merge. Raises on a genuine both-sides-changed-differently key."""
    out = dict(ours)
    for key, tval in theirs.items():
        bval = base.get(key, ...)
        oval = ours.get(key, ...)
        if oval is ...:                       # added only by theirs
            out[key] = tval
        elif tval == oval:                    # same on both sides
            continue
        elif bval is not ... and tval == bval:  # only ours changed it
            continue
        elif bval is not ... and oval == bval:  # only theirs changed it
            out[key] = tval
        elif isinstance(oval, dict) and isinstance(tval, dict):
            out[key] = merge_dict(
                bval if isinstance(bval, dict) else {}, oval, tval, f"{where}.{key}"
            )
        else:
            raise SystemExit(
                f"REAL CONFLICT at {where}.{key}: both sides changed it differently.\n"
                f"  base:   {bval!r}\n  ours:   {oval!r}\n  theirs: {tval!r}\n"
                "Not resolving this mechanically — look at it."
            )
    return out


def resolve_json(path: str) -> str:
    base = json.loads(stage(path, 1) or "{}")
    ours = json.loads(stage(path, 2) or "{}")
    theirs = json.loads(stage(path, 3) or "{}")
    merged = merge_dict(base, ours, theirs, Path(path).stem)
    added = sorted(set(merged) - set(ours))
    kept = sorted(set(merged) & set(theirs) - set(base))
    print(f"  {path}: {len(ours)} ours + {len(added)} from theirs -> {len(merged)} keys"
          + (f"  (added: {', '.join(added)})" if added else ""))
    if not added and kept:
        print(f"    note: theirs added nothing new; already present: {', '.join(kept)}")
    text = json.dumps(merged, ensure_ascii=False, indent=2) + "\n"
    Path(path).write_text(text, encoding="utf-8", newline="\n")
    return text


CONFLICT = re.compile(
    r"^<<<<<<< [^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>> [^\n]*\n",
    re.MULTILINE | re.DOTALL,
)


def resolve_union(path: str) -> None:
    text = Path(path).read_text(encoding="utf-8")
    n = 0

    def both(m: re.Match) -> str:
        nonlocal n
        n += 1
        ours, theirs = m.group("ours"), m.group("theirs")
        # A prose/comment hunk has no code in it; keeping both copies would
        # duplicate a sentence, so keep ours and report it for a human read.
        if all(l.strip().startswith("*") or not l.strip() for l in ours.splitlines()):
            print(f"    hunk {n}: prose, kept ours (check the wording covers both pages)")
            return ours
        return ours + theirs

    out = CONFLICT.sub(both, text)
    if "<<<<<<<" in out:
        raise SystemExit(f"{path}: unresolved markers remain")
    print(f"  {path}: {n} hunk(s) unioned")
    Path(path).write_text(out, encoding="utf-8", newline="\n")


def main() -> None:
    conflicted = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=U"],
        capture_output=True, check=True,
    ).stdout.decode().split()
    if not conflicted:
        print("no conflicts")
        return
    for path in conflicted:
        if path.endswith(".json"):
            resolve_json(path)
        else:
            resolve_union(path)
        subprocess.run(["git", "add", path], check=True)
    # Nothing may be claimed resolved that still parses badly.
    for path in conflicted:
        if path.endswith(".json"):
            json.loads(Path(path).read_text(encoding="utf-8"))
    print("resolved:", len(conflicted), "file(s)")


if __name__ == "__main__":
    main()
