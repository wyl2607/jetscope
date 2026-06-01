# Security Policy

## Reporting Vulnerabilities

If you believe you have found a security issue in JetScope, do not open a public issue with exploit details. Use GitHub private vulnerability reporting if it is available for this repository. If it is not available, contact `wyl2607` through GitHub and ask for a private reporting channel before sharing exploit details.

Include only the minimum information needed to understand the problem:

- affected surface
- reproduction steps
- impact description
- whether the report is time-sensitive

Do not include secrets, tokens, private dataset contents, internal hostnames, or runtime logs that are not already public-safe.

## No-Secrets Policy

Never commit or disclose:

- API keys or tokens
- `.env` files or local configuration secrets
- database dumps or local runtime snapshots
- logs, caches, or operator notes that are not intended for public release

If a secret is suspected to be exposed in a public file, rotate it outside the repository and remove it from the public history only through the project's normal maintainership process.

## Local-Only Boundary

JetScope distinguishes public product files from local runtime state.

- public docs, API contracts, and source code belong in the repository
- runtime data, caches, logs, and machine-specific state do not
- contributor-facing documentation should avoid naming private operator paths or workspace-only automation details

## Supported Versions

Security fixes are tracked against the current repository state and the currently supported public release line. At this stage, that is the pre-1.0 product line documented in this repository.

## Safe Disclosure Expectations

Security reports are handled with confidentiality until they are reviewed and a disclosure decision is made. If a fix ships, public writeups should describe the issue at a high level, the affected surface, and the remediation, without publishing exploit details that would create additional risk.
