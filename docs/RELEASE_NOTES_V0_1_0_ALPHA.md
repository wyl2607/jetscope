# JetScope v0.1.0-alpha Release Notes Draft

Title:

```text
JetScope v0.1.0-alpha - SAF transition intelligence baseline
```

Summary:

JetScope v0.1.0-alpha establishes the public baseline for European aviation
fuel transition intelligence. It focuses on reproducibility, source
provenance, SAF tipping-point analysis, and a mock-first AI research path.

Included:

- Public API contract for market snapshot, tipping point, source coverage, and
  research signals.
- Local Next.js and FastAPI development workflow.
- Source provenance, freshness, confidence, and fallback-state model.
- Mock-first AI research pipeline with clear live-mode boundaries.
- Security and preflight maintenance gates.
- Initial OSS contributor, maintainer, security, roadmap, changelog, issue, and
  PR documentation.

Validation before release:

- `npm run preflight`
- `scripts/security_check.sh`
- `scripts/review_push_guard.sh origin/main`
- `git diff --check`

Release boundaries:

- Do not publish, deploy, SSH, rsync, or create GitHub releases from this draft
  without explicit maintainer approval.
- Keep release notes grounded in public repository evidence only.
