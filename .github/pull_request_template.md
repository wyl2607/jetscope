## Summary

- 

## Verification

- [ ] `npm test`
- [ ] `npm run api:check`
- [ ] `npm run api:openapi:check`
- [ ] `npm --prefix apps/web run typecheck`
- [ ] `npm --prefix apps/web run build`
- [ ] `cd apps/api && python -m pytest`
- [ ] Not applicable, docs/config only

## Risk

- Risk level: low / medium / high
- Scope:
- Rollback:

## Automation Safety

- [ ] No `.env*`, secrets, local databases, logs, build outputs, `.automation/`, or `.omx/` files are included.
- [ ] No VPS, deploy, sync, rollout, pullback, SSH, rsync, install, uninstall, or cleanup command was run.
- [ ] Changed files match the task scope.
- [ ] Generated artifacts, if any, are expected and verified.

## UI Evidence

- Screenshots or notes, if UI changed:
