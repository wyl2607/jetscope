# .evolver

`.evolver/` is the small, public-safe metadata layer for the repository
maintenance pipeline. It is not an autonomous agent runtime.

Allowed here:

- Stable policy contracts.
- Public-safe maintenance metadata.
- Small schemas that describe reviewable automation outputs.
- Human-readable memory summaries that are safe to publish.

Forbidden here:

- Secrets, credentials, tokens, API keys, private endpoints, or `.env` data.
- Runtime queues, logs, generated reports, model transcripts, or raw agent
  memory.
- Obsidian vault excerpts or vault-derived reports.
- Approval state for push, deploy, sync, remote mutation, or destructive
  operations.

The intended loop is:

```text
read-only scan -> candidate summary -> human review -> bounded local task -> gates
```

Anything beyond that needs a separate approval gate.
