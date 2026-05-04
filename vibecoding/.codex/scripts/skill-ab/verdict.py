#!/usr/bin/env python3
"""skill-ab/verdict.py — read results-*.csv from runner.sh and print A/B verdicts.

Quality criteria (must pass for cleaned skills to be usable):
  1. all NEW tasks exit 0
  2. stop_signal hit rate >= 90% on NEW and at least baseline on OLD
  3. artifact_present rate on NEW >= OLD

Efficiency criteria (separate optimization gate):
  1. mean total_tokens dropped >= 15% (NEW vs OLD)
  2. mean tool_calls dropped >= 20%
"""
from __future__ import annotations
import csv, statistics, sys
from collections import defaultdict
from pathlib import Path

THRESH_TOKEN_DROP_PCT = 15.0
THRESH_TOOL_DROP_PCT  = 20.0
THRESH_NEW_STOP_RATE  = 0.90

def load(path: Path):
    rows = list(csv.DictReader(path.open()))
    by = defaultdict(list)
    for r in rows:
        if r.get("invalid_reason", ""):
            continue
        by[r["variant"]].append(r)
    return by

def invalid_counts(path: Path):
    counts = defaultdict(int)
    for r in csv.DictReader(path.open()):
        reason = r.get("invalid_reason", "")
        if reason:
            counts[reason] += 1
    return counts

def num(rows, key):
    out = []
    for r in rows:
        try: out.append(float(r[key]))
        except (ValueError, KeyError): pass
    return out

def rate(rows, key):
    n = len(rows)
    return sum(1 for r in rows if r.get(key) == "1") / n if n else 0.0

def exit_ok(rows):
    return all(r.get("exit_code") == "0" for r in rows)

def main(argv):
    if len(argv) != 2:
        print("usage: verdict.py <results.csv>", file=sys.stderr); return 2
    p = Path(argv[1])
    if not p.exists():
        print(f"missing: {p}", file=sys.stderr); return 2
    invalid = invalid_counts(p)
    by = load(p)
    if "NEW" not in by or "OLD" not in by:
        print(f"need both NEW and OLD rows; got {list(by)}", file=sys.stderr); return 2

    new_tok = num(by["NEW"], "total_tokens"); old_tok = num(by["OLD"], "total_tokens")
    new_tc  = num(by["NEW"], "tool_calls");   old_tc  = num(by["OLD"], "tool_calls")
    new_stop = rate(by["NEW"], "stop_signal_hit"); old_stop = rate(by["OLD"], "stop_signal_hit")
    new_art  = rate(by["NEW"], "artifact_present"); old_art = rate(by["OLD"], "artifact_present")
    new_exit_ok = exit_ok(by["NEW"]); old_exit_ok = exit_ok(by["OLD"])

    def safe_mean(xs): return statistics.mean(xs) if xs else 0.0
    def pct_drop(new, old): return ((old - new) / old * 100.0) if old > 0 else 0.0

    tok_drop = pct_drop(safe_mean(new_tok), safe_mean(old_tok))
    tc_drop  = pct_drop(safe_mean(new_tc),  safe_mean(old_tc))

    print(f"tasks: NEW={len(by['NEW'])}  OLD={len(by['OLD'])}")
    if invalid:
        details = ", ".join(f"{reason}={count}" for reason, count in sorted(invalid.items()))
        print(f"invalid rows excluded: {details}")
    print(f"mean tokens   NEW={safe_mean(new_tok):,.0f}  OLD={safe_mean(old_tok):,.0f}  drop={tok_drop:5.1f}%  (need >={THRESH_TOKEN_DROP_PCT}%)")
    print(f"mean toolcalls NEW={safe_mean(new_tc):.1f}  OLD={safe_mean(old_tc):.1f}  drop={tc_drop:5.1f}%  (need >={THRESH_TOOL_DROP_PCT}%)")
    print(f"stop hit rate  NEW={new_stop:.0%}  OLD={old_stop:.0%}  (need NEW >= {THRESH_NEW_STOP_RATE:.0%} and NEW >= OLD)")
    print(f"artifact rate  NEW={new_art:.0%}  OLD={old_art:.0%}  (need NEW >= OLD)")
    print(f"exit clean     NEW={new_exit_ok}  OLD={old_exit_ok}  (need NEW=True)")

    quality_fails = []
    if not new_exit_ok:                  quality_fails.append("new-exit-code")
    if new_stop < THRESH_NEW_STOP_RATE:  quality_fails.append("stop-hit-rate")
    if new_stop < old_stop:              quality_fails.append("stop-hit-regression")
    if new_art  < old_art:               quality_fails.append("artifact-regression")

    efficiency_fails = []
    if tok_drop < THRESH_TOKEN_DROP_PCT: efficiency_fails.append("token-drop")
    if tc_drop  < THRESH_TOOL_DROP_PCT:  efficiency_fails.append("tool-call-drop")

    if quality_fails:
        print(f"\nQUALITY VERDICT: FAIL  ({', '.join(quality_fails)})")
    else:
        print("\nQUALITY VERDICT: PASS")

    if efficiency_fails:
        print(f"EFFICIENCY VERDICT: FAIL  ({', '.join(efficiency_fails)})")
    else:
        print("EFFICIENCY VERDICT: PASS")

    return 1 if quality_fails or efficiency_fails else 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
