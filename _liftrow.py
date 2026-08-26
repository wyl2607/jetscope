"""Finish a page-template-adoption.test.mjs merge: keep the table, add one row.

Usage: python _liftrow.py <Component> <i18nKey>

Every remaining branch in this batch conflicts the same three ways in this file
(prose header, the dictionary-key lookup, the assertion using it) and cleanly
appends its own special case to implementationOf(). Ours is the SHARED_VIEWS
table, which is a strict superset of any single branch's lookup, so all conflict
hunks resolve to ours and the appended case becomes a row.

The i18n key is passed in rather than inferred: each branch spells its lookup
differently, and guessing the key from the route is exactly the kind of thing
that silently stops asserting anything.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PATH = Path("test/page-template-adoption.test.mjs")
CONFLICT = re.compile(
    r"^<<<<<<< [^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>> [^\n]*\n",
    re.MULTILINE | re.DOTALL,
)
STRAY = re.compile(
    r"\n  if \((?P<route>/[^)]+?/)\.test\(path\) && source\.includes\('<(?P<component>\w+)'\)\) \{\n"
    r"    return read\('(?P<source>[^']+)'\);\n  \}\n"
)


def main() -> None:
    component, i18n_key = sys.argv[1], sys.argv[2]
    text = PATH.read_text(encoding="utf-8")

    hunks = CONFLICT.findall(text)
    text = CONFLICT.sub(lambda m: m.group("ours"), text)
    if "<<<<<<<" in text:
        raise SystemExit("unresolved markers remain")

    m = next((s for s in STRAY.finditer(text) if s.group("component") == component), None)
    if m is None:
        raise SystemExit(f"no appended case for <{component}> — look at the file")

    row = (
        "  {\n"
        f"    route: {m.group('route')},\n"
        f"    component: '{component}',\n"
        f"    source: '{m.group('source')}',\n"
        f"    i18nKey: {'null' if i18n_key == 'null' else repr(i18n_key).replace(chr(34), chr(39))},\n"
        "  },\n"
    )
    text = text[: m.start()] + "\n" + text[m.end():]
    text = text.replace("];\n\nfunction sharedViewFor", row + "];\n\nfunction sharedViewFor", 1)
    PATH.write_text(text, encoding="utf-8", newline="\n")
    print(f"{len(hunks)} hunk(s) -> ours; {component} lifted to a row (i18nKey {i18n_key})")


if __name__ == "__main__":
    main()
