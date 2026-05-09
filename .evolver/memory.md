# Evolver Memory

## Current Contract

- Keep the maintenance pipeline reviewable and low risk.
- Prefer daily read-only audits over autonomous mutation.
- Store raw runtime truth under local runtime directories, not `.evolver/`.
- Treat Obsidian as a local metadata sink unless a privacy review explicitly
  promotes content.
- Keep `.evolver/` small enough to review in a normal pull request.

## Next Candidate Work

- Convert recurring audit findings into bounded issues or local task packets.
- Add tests before expanding `.evolver/` schema fields.
- Keep provider routing, cooldown, and model health state in runtime dashboards,
  not in public metadata.
