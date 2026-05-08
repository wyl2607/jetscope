# Read-Only Daily Maintenance Audit

You are running in GitHub Actions for a scheduled maintenance audit.

Rules:

- Read only. Do not edit files, create commits, open PRs, push, deploy, sync, or
  run destructive commands.
- Do not print secrets, environment variables, tokens, credentials, or private
  runtime data.
- Prefer repository files and CI evidence over speculation.
- Produce concise findings with file paths and concrete next actions.

Audit scope:

1. Check whether `AGENTS.md`, `CLAUDE.md`, `.github/workflows/`, `.evolver/`,
   and docs describe a coherent maintenance pipeline.
2. Identify stale documentation, missing gates, duplicated AI instructions, or
   risky publish boundaries.
3. Prioritize only low-risk maintenance candidates that a human can review.

Output format:

```markdown
## Summary
<one paragraph>

## Findings
- Severity: <low|medium|high>
  Path: <path or n/a>
  Issue: <specific issue>
  Suggested next action: <bounded read-only or code-reviewable action>

## Do Not Automate
- <actions that still need explicit human approval>
```
