# Maintenance Gates Policy

Last updated: 2026-05-09

## Purpose

Maintenance gates should block new issues introduced by the current pull
request. Repository-wide historical debt remains visible through local runtime
reports and follow-up maintenance tasks, but it should not block an unrelated
feature or governance PR.

## Semgrep

Pull request Semgrep checks use the PR base SHA as the baseline and scan only
changed code targets. Push checks use the previous pushed SHA as the baseline.

Security findings in changed files must be fixed when they are real. A finding
may be suppressed only with a narrow inline rationale when it is a scanner false
positive or when the code already constrains the risk in a way Semgrep cannot
infer. Suppressions must name the rule and the reason.

Historical Semgrep findings outside the changed-file set are classified in
`runtime/maintenance-gates/semgrep-triage-latest.json` and should be handled in
separate security or maintenance PRs.

## Markdown

Pull request prose gates lint changed Markdown files, then fail only for
markdownlint findings on lines added by the current comparison. The root
`.markdownlint-cli2.yaml` intentionally avoids global `globs` so explicit
changed-file arguments do not expand back into a full repository scan.

Full markdown cleanup is a separate maintenance task. Broad markdownlint debt,
including table formatting and heading/list spacing in older docs, should be
reported separately instead of being mixed into feature PRs.

## Reports

Runtime reports under `runtime/maintenance-gates/` are generated local evidence
and are not committed. They may include:

- `semgrep-current.json`
- `semgrep-triage-latest.json`
- focused changed-file lint output

The durable policy lives in this document; JSON reports are disposable evidence.
