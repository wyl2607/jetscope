# Task packets

A task packet is the unit of delegated work in this repository: a bounded
instruction set handed to a coding agent, with an explicit allowlist, explicit
verification commands, and explicit done criteria.

`page-conversion-constraints.md` is the reusable half of the packet used for the
P1.5 page conversion. It carries the constraints that do not change between
batches. To run a new batch, write a short **this batch** section and append it:

```bash
codex exec --cd <worktree> -s workspace-write \
  "$(cat docs/task-packets/page-conversion-constraints.md this-batch.md)"
```

## Writing the batch section

Four things belong in it and nothing else.

1. **The files.** Named exactly, with line counts. Anything not named is out of
   scope, and the packet says so.
2. **The traps.** The specific hazards in these specific files, quoted from the
   source with line numbers. This is where most of the value is: a hazard named
   in advance has not been walked into once. A hazard left for the agent to
   notice has been walked into repeatedly.
3. **The decision questions.** A suggestion per page, and permission to disagree
   and report rather than pick silently.
4. **Done criteria.** Checkable, including which assertions to add and a
   requirement to prove each new guard fails before it passes.

## What makes them work

**Give an exact table, not a rule to reason from.** The one batch that came back
with zero review findings was the one where the mapping table was copied
verbatim out of the CSS compatibility layer. The batches with findings were the
ones that asked the agent to decide what a colour meant.

**State facts you are not certain of as facts anyway, and leave room to check.**
A packet once claimed a component had already been stripped of its card chrome
when it had not. The agent verified, reported the inconsistency, fixed it, and
added a regression test. A wrong fact is recoverable; an instruction that says
"you do not need to check" is not.

**Ask for what was unclear.** Every packet requires a section listing mappings
the agent was unsure about and contract gaps it found. Those sections are where
the contract's own missing rules have come from.

**Require reverse-red proof.** A new guard must be watched failing on the defect
it was written for, then passing. A ratchet nobody has seen fail is a ratchet
nobody knows is connected.

## Review

A packet's output gets an independent review pass before the final review. Give
the reviewer the defect classes as an explicit checklist, ask for
`file:line | which rule | one sentence why`, and require a separate section for
findings it is unsure about — reviewers over-report, and the uncertain section
is what makes the rest quick to filter.
