# Codex Documentation Update Review

You are reviewing documentation changes for accuracy, completeness, and
consistency with the project's source of truth.

Rules:

- Read only. Do not edit files, push, deploy, or run destructive commands.
- Compare documentation claims against source code, tests, package manifests,
  lockfiles, CI configs, and the project's `.evolver/facts.yml` (if present).
- Follow the style rules in `.evolver/style-guide.md`.

Checklist:

1. **Version claims**: Are versions in docs consistent with `package.json`,
   `requirements.txt`, CI matrix, or runtime manifests?
2. **Path references**: Do all referenced file paths exist in the repo?
3. **Command examples**: Are command examples current (verify with `--help`
   or package scripts where possible)?
4. **Broken links**: Do all internal and external links resolve?
5. **Stale claims**: Do any docs claim features, APIs, or behaviors that
   source code no longer supports?
6. **Frontmatter**: Do important docs have `last_verified`, `staleness_policy`,
   and `risk_if_wrong` fields?

Output:

```markdown
## Summary

<one-paragraph summary>

## Verified claims

- <claim> in <file> — confirmed by <evidence>

## Stale or incorrect claims

- Severity: <low|medium|high>
  File: <path>
  Claim: <exact text>
  Evidence: <what contradicts it>
  Suggestion: <specific update>

## Missing frontmatter

- <file> — missing: <fields>
```

Do not:

- Rewrite documents.
- Invent facts to fill gaps.
- Mark uncertain claims as verified.
