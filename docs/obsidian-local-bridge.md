# Obsidian Local Bridge

This workspace can publish a local project index into Obsidian without making the
vault part of any GitHub or remote-sync surface.

## Boundary

- Obsidian vaults, Obsidian config, ingest output, local state, logs, and backups
  are local-only.
- Project repositories may link to the local Obsidian index path, but must not
  copy vault notes, `.obsidian/` config, generated ingest notes, or vault exports
  into tracked source.
- The bridge is one-way by default: workspace metadata is written to the local
  vault, and no vault content is read back into project source.
- Remote operations, publication, and sync scripts must treat Obsidian paths as
  excluded private data.

## Default Vault

The default local vault path is:

```text
/Users/yumei/Obsidian/MyKnowledgeVault
```

The default generated index is:

```text
/Users/yumei/Obsidian/MyKnowledgeVault/30-AI-Ingest/workspace-project-index.md
```

Override these with:

```bash
OBSIDIAN_VAULT="/path/to/vault" python3 scripts/obsidian_workspace_bridge.py
OBSIDIAN_INDEX_PATH="/path/to/index.md" python3 scripts/obsidian_workspace_bridge.py
```

## Safe Use

Generate or refresh the local index:

```bash
python3 scripts/obsidian_workspace_bridge.py
```

Preview without writing:

```bash
python3 scripts/obsidian_workspace_bridge.py --dry-run
```

The generated note contains project names, local paths, git status summaries, and
links to local progress files when present. It intentionally does not include
Obsidian note bodies, secrets, environment files, logs, or runtime output.

## Git Guardrail

Root and project `.gitignore` files exclude common Obsidian/vault/ingest paths,
including:

- `Obsidian/`
- `Documents/Obsidian*/`
- `.obsidian/`
- `obsidian-*.md`
- `obsidian-*.json`
- `obsidian-*.log`
- `30-AI-Ingest/`
- `workspace-project-index.md`

If a new bridge output path is added, update the nearest `.gitignore` before
generating files.
