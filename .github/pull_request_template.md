## Summary

- What changed:
- Why it changed:
- Scope:

## Triage

- Area: `web` / `api` / `docs` / `data-contract` / `ai-pipeline` / `release` / `other`
- Change type: `docs-only` / `test-only` / `behavior` / `maintenance` / `security-sensitive`
- Risk level: `low` / `medium` / `high`
- Release impact: `none` / `possible` / `required`

## Verification

- [ ] `npm test`
- [ ] `npm run api:check`
- [ ] `npm run api:openapi:check`
- [ ] `npm --prefix apps/web run typecheck`
- [ ] `npm --prefix apps/web run build`
- [ ] `cd apps/api && python -m pytest`
- [ ] `git diff --check`
- [ ] `scripts/security_check.sh`
- [ ] Not applicable, docs/config only

Evidence:

## Risk

- Rollback plan:
- Known follow-up:
- Data/source impact:

## Automation Safety

- [ ] No `.env*`, secrets, local databases, logs, build outputs, `.automation/`, or `.omx/` files are included.
- [ ] No VPS, deploy, sync, rollout, pullback, SSH, rsync, install, uninstall, or cleanup command was run.
- [ ] Changed files match the task scope.
- [ ] Generated artifacts, if any, are expected and verified.
- [ ] Public claims are supported by repository evidence.

## UI Evidence

- Screenshots or notes, if UI changed:
