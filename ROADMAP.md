# Roadmap

This roadmap is intentionally conservative. It is limited to the product surfaces and maintenance posture already visible in the repository.

## v0.1.x

- include grid parity, grid history, and grid LCOE sensitivity slices in local demoable product scope
- include heat parity and heat sensitivity slices in analysis surface
- add protected workspace preference/scenario contract tests (token gating + workspace isolation)
- make local setup and demo reproduction clear for outside reviewers
- stabilize the current API contract for market snapshots, source coverage, and analysis endpoints
- keep source provenance, freshness, confidence, and fallback state visible
- keep the AI research pipeline mock-first by default and explicit about live-mode boundaries
- publish contributor-facing docs, templates, and maintenance evidence

## v0.2.x

- prioritize browser proxy/UI QA for SAF + grid + heat pages
- harden public data-source handling and fallback semantics
- reduce API/doc contract drift (routes, auth, workspace contracts, readiness semantics)
- add data pipeline E2E coverage for history seed, snapshot refresh, and analysis paths
- document source-aware assumptions used by grid/heat calculations

## v0.3.x

- improve external contributor workflow for issues, PRs, and review evidence
- add a public sample scenario library for repeatable demos and comparisons
- expand release artifacts with clearer validation, changelog, and risk notes
- improve source provenance across public inputs and derived metrics
- expand sample/localized scenario support for external contributors

## Directional Themes

- SAF tipping-point analysis remains the center of the product
- EU ETS and related carbon exposure should stay explicit and source-aware
- source provenance is a product feature, not an implementation detail
- public documentation should make the repository easy to review without overstating readiness
