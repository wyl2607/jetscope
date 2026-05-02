# JetScope Refactoring Strategy

JetScope refactoring should reduce maintenance risk without changing product behavior, public API contracts, release semantics, or deployment safety boundaries. The default rhythm is a weekly or biweekly structural audit followed by small, evidence-ranked refactors. Do not refactor by calendar pressure or by trying to reduce file count for its own sake.

## Operating Principles

- Start from evidence: file size, mixed responsibilities, repeated contracts, brittle tests, compatibility layers, and recent defect history.
- Change one subsystem per PR or task. Keep product features, behavioral changes, and broad style cleanup out of the same refactor.
- Preserve API behavior, generated OpenAPI output, release scripts, sync scripts, and legacy compatibility until there is a documented retirement path.
- Prefer repository patterns that already exist: domain services, read models, schema modules, focused fixtures, and route-level tests.
- Treat `.venv`, `.next`, `__pycache__`, `node_modules`, logs, and local runtime outputs as environment noise, not refactoring targets.

## Candidate Backlog

Use this list as the first recurring audit surface. Re-rank it with current evidence before editing.

| Area | Current Signal | Preferred Direction |
| --- | --- | --- |
| `apps/api/app/services/market.py` | Large service with source refresh, fallback, and market-contract responsibilities | Extract by domain responsibility while preserving API and test entrypoints |
| `apps/web/lib/product-read-model.ts` | Read-model breadth across product surfaces | Split around stable product/read-model boundaries, not loose utility buckets |
| Large UI components | Presentation, fetching, fallback copy, and provenance display can drift together | Move transport/read-model work out of components and keep UI components focused |
| Release and sync scripts | High-risk operational scripts with safety gates and shared exclusions | Refactor only behind syntax checks, security gates, and explicit impact notes |
| `source_details` compatibility | Historical snapshot bridge still appears in some flows and tests | Prefer canonical `/v1/sources/coverage` metrics and mark legacy bridges for staged retirement |
| `SAFVSOIL_*` compatibility | Legacy environment names remain for deployed compatibility | Keep compatibility, prefer `JETSCOPE_*` in new code, and document retirement before removal |
| Scenario and preference legacy paths | Older route and persistence surfaces can create duplicated contracts | Consolidate only when route, schema, service, and test ownership are clear |
| Source coverage and fallback display | Provenance, fallback, error, and confidence presentation repeats across surfaces | Reuse read-model contracts and focused fixtures |

## Merge Rules

Merge files only when all of these are true:

- They describe the same domain concept.
- They share the same lifecycle and ownership.
- They use the same test entrypoint or can be validated together without widening risk.
- The merge removes duplicated contracts or improves discoverability.

Do not merge natural boundaries such as API routes, schema definitions, domain services, UI components, release scripts, and sync scripts just because they are small. A small file with a clear boundary is acceptable.

## Split Rules

Split a file when it is roughly above 400-500 lines and has multiple responsibilities, or when tests and reviews repeatedly need unrelated context to change one behavior.

Prefer splits by stable boundaries:

- Domain calculation or policy logic
- Service orchestration
- API schema or route contract
- Web read model
- UI presentation component
- Test fixture or contract fixture

Avoid creating generic helper modules unless they remove real duplication across stable call sites. A vague utility module usually moves complexity instead of reducing it.

## Deletion Rules

Before deleting code or documentation:

- Use `rg` and import or route checks to confirm references.
- Run the narrowest relevant tests before broad gates.
- For public API fields, docs, release/sync scripts, legacy environment variables, and compatibility aliases, document a retirement path before removal.
- Do not use `.gitignore` as proof that a path is safe for node sync; check `scripts/sync-excludes.sh` when local or sensitive paths are involved.

## Validation Matrix

Use the narrowest row that covers the changed surface, then broaden when risk justifies it.

| Changed Surface | Focused Validation | Broader Gate |
| --- | --- | --- |
| Web read models or product fixtures | `npm test -- --test-name-pattern=<area>` or the matching Node test file | `npm test`, `npm run web:typecheck` |
| API services or contracts | `npm run api:check`, `npm run api:test` | `npm run api:openapi:check`, `npm run preflight` |
| OpenAPI-visible API shape | `npm run api:openapi:check` | `npm run preflight` |
| Release, sync, or security scripts | `bash -n scripts/*.sh`, `./scripts/security_check.sh`, `./scripts/review_push_guard.sh origin/main` | `npm run preflight` |
| Documentation-only strategy updates | `git diff --check -- <changed-files>` | No runtime gate unless examples or commands changed |

Release, deploy, publish, sync, SSH, rsync, and VPS actions are not part of a refactor validation run unless explicitly approved for that operation.

## Recurring Audit Checklist

1. Review recent incidents, progress notes, and trace-ledger entries for repeated maintenance pain.
2. Rank candidates by current risk, not by age.
3. Pick one subsystem and define its allowed paths before editing.
4. State the intended structural outcome and the compatibility boundary.
5. Run focused validation first, then broaden only as needed.
6. Record any stable new refactoring pattern in the shared trace ledger.

## Non-Goals

- Reducing file count as a standalone goal.
- Rewriting stable modules without a measurable maintenance problem.
- Combining unrelated route, schema, service, UI, and script boundaries.
- Removing legacy public behavior without compatibility notes and tests.
- Connecting a refactor directly to deploy, sync, or release work.
