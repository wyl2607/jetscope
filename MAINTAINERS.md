# Maintainers

## Primary Maintainer

- Yilin Wang (`wyl2607`)

## Responsibility Scope

JetScope is maintained as a single-product repository. The primary maintainer is responsible for keeping the public contract coherent across the architecture, triage, review, release readiness, CI health, and security reporting process.

### Architecture

- keep the repository focused on the implemented product surface
- preserve source provenance, fallback visibility, and contract clarity
- ensure documentation matches the current API, data, and AI pipeline behavior

### Triage

- classify issues by user impact, data quality, release readiness, or documentation gap
- separate security concerns from normal feature requests
- keep public issue reports free of secrets and private operational detail

### PR Review

- review for correctness, clarity, and bounded scope
- check whether changed files match the stated purpose
- require validation evidence for behavior changes
- reject claims that are not supported by the repository

### Release

- coordinate reviewable release preparation
- ensure changelog and maintenance evidence are updated when public surfaces change
- keep release work aligned with the repo's documented gates

### CI

- watch for failing validation gates and contract drift
- prefer small, targeted fixes over broad rebuilds
- keep automation outputs public-safe and reviewable

### Security

- route vulnerability reports through `SECURITY.md`
- avoid exposing secrets or runtime-only details in public threads
- confirm that public docs do not overstate security coverage or operational guarantees

## Maintainer Notes

This repository does not claim a multi-person maintainer team unless that is explicitly reflected in the repo history or governance documents. Additional maintainers may be added later through a documented process.
