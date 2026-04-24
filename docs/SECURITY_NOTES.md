# Security Notes

## Current npm advisory

- Advisory: `GHSA-qx2v-qp2m-jg93`
- Package: `postcss <8.5.10`
- Severity: moderate
- Current path: `next@16.2.4 -> postcss@8.4.31`

`npm audit fix` cannot currently remediate this without forcing `next@9.3.3`, which is a breaking downgrade and is not a valid fix for this Next.js 16 application. The project already pins the direct PostCSS dependency used by Tailwind/autoprefixer to `8.5.10`; the remaining advisory is inside Next's published dependency graph.

Mitigation until Next publishes a patched dependency:

- Keep direct `postcss` pinned to `8.5.10`.
- Keep CI on `npm run audit:security`, which fails on high or critical advisories while this moderate transitive false-actionable advisory remains open.
- Keep Dependabot enabled for npm, pip, and GitHub Actions so the repository receives a PR when a patched Next.js release is available.
- Re-run `npm audit` after each Next.js upgrade and remove this note once `next` no longer vendors `postcss <8.5.10`.

## Python dependency audit

CI runs `npm run audit:python`, which delegates to `python -m pip_audit -r apps/api/requirements.txt` after API dependencies are installed.

The API dependency set intentionally pins patched versions for currently known transitive advisories:

- `fastapi==0.121.0` with explicit `starlette==0.49.1` to avoid Starlette advisories affecting older `0.41.x` releases.
- `pdfplumber==0.11.9` to pull `pdfminer.six==20251230`, which remediates the known `pdfminer-six` advisories affecting `20231228`.
