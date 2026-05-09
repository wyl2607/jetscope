#!/usr/bin/env python3
"""opencode-model-resolver.py

Return the first available preferred model from ~/.config/opencode/opencode.json.
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent

_CONFIG_PATH = Path.home() / ".config" / "opencode" / "opencode.json"

_DEFAULT_PREFER = "codex-relay-backup/gpt-5.5-medium"


def _parse_providers(config_data: dict) -> set[str]:
    """Extract registered provider/model identifiers from config."""
    registered: set[str] = set()
    providers = config_data.get("provider", {})
    for provider_name, provider_cfg in providers.items():
        if not isinstance(provider_cfg, dict):
            continue
        models = provider_cfg.get("models", {})
        if not isinstance(models, dict):
            continue
        for model_name in models:
            registered.add(f"{provider_name}/{model_name}")
    return registered


def resolve(prefer: list[str], config_path: Path, quiet: bool = False) -> str | None:
    """Return the first preferred model found in config, or None."""
    if not config_path.exists():
        if not quiet:
            print(f"Config not found: {config_path}", file=sys.stderr)
        return None

    try:
        with config_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        if not quiet:
            print(f"Failed to read config: {exc}", file=sys.stderr)
        return None

    registered = _parse_providers(data)
    for candidate in prefer:
        if candidate in registered:
            return candidate
    return None


def _self_test() -> int:
    """Run embedded self-test and return exit code."""
    fixture = {
        "provider": {
            "codex-relay-backup": {
                "models": {
                    "gpt-5.5-medium": {"name": "GPT-5.5 Medium (nf.video backup)"}
                }
            }
        }
    }

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_config = Path(tmpdir) / "opencode.json"
        with tmp_config.open("w", encoding="utf-8") as f:
            json.dump(fixture, f)

        result = resolve(
            prefer=["codex-relay-backup/gpt-5.5-medium"],
            config_path=tmp_config,
            quiet=True,
        )

        expected = "codex-relay-backup/gpt-5.5-medium"
        if result != expected:
            print(
                f"FAIL self-test: expected {expected!r}, got {result!r}",
                file=sys.stderr,
            )
            return 3

    print("OK opencode-model-resolver self-test passed")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Resolve the first available preferred OpenCode model."
    )
    parser.add_argument(
        "--prefer",
        default=_DEFAULT_PREFER,
        help=f'Comma-separated preferred models (default: "{_DEFAULT_PREFER}")',
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress diagnostic messages to stderr.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run embedded self-test and exit.",
    )
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    prefer_list = [p.strip() for p in args.prefer.split(",") if p.strip()]
    if not prefer_list:
        if not args.quiet:
            print("Empty --prefer list.", file=sys.stderr)
        return 2

    result = resolve(prefer_list, _CONFIG_PATH, quiet=args.quiet)
    if result is None:
        if not args.quiet:
            print("No preferred model found in config.", file=sys.stderr)
        # Distinguish missing config from no match
        return 1 if not _CONFIG_PATH.exists() else 2

    print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
