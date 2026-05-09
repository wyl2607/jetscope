#!/usr/bin/env python3
"""
project-scanner.py — 扫描所有项目，生成 Codex 任务候选列表
输出: candidates.json（按优先级排序）
"""
import argparse
import json
import os
import subprocess
import re
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Sequence, Tuple

# 所有受管理的项目
PROJECTS = {
    "jetscope":              {"dir": "~/projects/jetscope",              "stack": ["node", "python"], "model": "gpt-5.4-mini"},
    "tools/automation":      {"dir": "~/tools/automation",               "stack": ["python"], "model": "gpt-5.4-mini"},
    "sustainos":             {"dir": "~/projects/sustainos",             "stack": ["python"], "model": "gpt-5.4-mini"},
    "home-lab-app":          {"dir": "~/projects/home-lab-app",          "stack": ["node"],   "model": "gpt-5.4-mini"},
    "esg-research-toolkit":  {"dir": "~/projects/esg-research-toolkit",  "stack": ["python", "node"], "model": "gpt-5.4-mini"},
    "meichen-web":           {"dir": "~/projects/meichen-web",           "stack": ["node"],   "model": "gpt-5.4-mini"},
    "obsidian-knowledge-pipeline": {"dir": "~/projects/obsidian-knowledge-pipeline", "stack": ["python"], "model": "gpt-5.4-mini"},
    "career-ops":            {"dir": "~/projects/career-ops",            "stack": ["node"], "model": "gpt-5.4-mini"},
}

PROJECT_BOUNDARIES = {
    "jetscope": {
        "risk_class": "repo-gate",
        "profiles": ["safe-local", "repo-gate", "pr-analysis"],
        "allowed_files": ["apps/", "packages/", "scripts/", "tests/", "docs/", "package.json", "package-lock.json"],
        "blocked_actions": ["push", "publish", "deploy", "sync-to-nodes", "vps deploy"],
        "validation_cmd": "npm run preflight",
    },
    "tools/automation": {
        "risk_class": "safe-local",
        "profiles": ["safe-local", "repo-gate", "control-plane-readonly"],
        "allowed_files": ["auto-refactor-loop/", "scripts/", "workspace-guides/", "templates/", "README.md", "PROJECT_PROGRESS.md", "AGENTS.md"],
        "blocked_actions": ["push", "publish", "deploy", "sync-to-nodes", "remote-mutating", "remote sync", "vps cleanup", "launchd mutation"],
        "validation_cmd": "bash /Users/yumei/tools/automation/scripts/validate-workspace-automation.sh",
    },
    "sustainos": {
        "risk_class": "control-plane-readonly",
        "profiles": ["control-plane-readonly"],
        "allowed_files": ["core/", "job_hunter/", "lca_engine/", "esg_reporter/", "api_gateway/", "ops_dashboard/", "scripts/ops/", "tests/", "docs/"],
        "blocked_actions": ["remote sync", "rollout", "pullback", "vps mutation", "control-plane mutation", "push"],
        "validation_cmd": "python3 -m pytest tests -q",
    },
    "home-lab-app": {
        "risk_class": "private-local",
        "profiles": ["private-classification", "control-plane-readonly"],
        "allowed_files": ["app/", "api/", "lib/", "tests/", "scripts/", "docs/", "types/"],
        "blocked_actions": ["device mutation", "remote sync", "publish", "push"],
        "validation_cmd": "npm run test:build && npm run build",
    },
    "esg-research-toolkit": {
        "risk_class": "safe-local",
        "profiles": ["safe-local", "pr-analysis"],
        "allowed_files": ["apps/", "packages/", "scripts/", "tests/", "docs/", "package.json", "pyproject.toml"],
        "blocked_actions": ["push", "merge", "publish"],
        "validation_cmd": "bash scripts/security_check.sh && bash scripts/consistency_check.sh",
    },
    "meichen-web": {
        "risk_class": "private-local",
        "profiles": ["private-classification"],
        "allowed_files": ["src/", "docs/", "deploy/", "scripts/"],
        "blocked_actions": ["queue mutation", "remote sync", "publish", "push"],
        "validation_cmd": "npm run build",
    },
    "obsidian-knowledge-pipeline": {
        "risk_class": "private-local",
        "profiles": ["private-classification"],
        "allowed_files": ["scripts/", "docs/"],
        "blocked_actions": ["vault mutation", "publish", "push"],
        "validation_cmd": "python3 -m pytest tests -q",
    },
    "career-ops": {
        "risk_class": "private-local",
        "profiles": ["private-classification"],
        "allowed_files": ["scripts/", "docs/", "batch/", "*.mjs", "package.json", ".gitignore"],
        "blocked_actions": ["publish", "push", "submit application", "print personal artifacts"],
        "validation_cmd": "npm run verify",
    },
}

# token 估算权重（粗略）
TASK_TOKEN_ESTIMATES = {
    "dep-update":   1500,
    "lint-fix":     3000,
    "todo-resolve": 2500,
    "refactor":     5000,
    "perf":         4000,
    "security-fix": 3500,
    "test-fix":     3000,
}

PROFILE_CONFIGS = {
    "legacy": {
        "projects": list(PROJECTS.keys()),
        "risk_classes": ["safe-local", "private-local", "repo-gate", "control-plane-readonly"],
        "task_types": list(TASK_TOKEN_ESTIMATES.keys()),
    },
    "safe-local": {
        "projects": ["jetscope", "tools/automation", "esg-research-toolkit"],
        "risk_classes": ["safe-local", "repo-gate"],
        "task_types": ["lint-fix", "test-fix", "todo-resolve"],
    },
    "repo-gate": {
        "projects": ["jetscope", "tools/automation"],
        "risk_classes": ["repo-gate", "safe-local"],
        "task_types": ["lint-fix", "test-fix", "todo-resolve"],
    },
    "private-classification": {
        "projects": ["career-ops", "meichen-web", "home-lab-app", "obsidian-knowledge-pipeline"],
        "risk_classes": ["private-local"],
        "task_types": ["test-fix"],
    },
    "control-plane-readonly": {
        "projects": ["sustainos", "home-lab-app", "tools/automation"],
        "risk_classes": ["control-plane-readonly", "safe-local"],
        "task_types": ["lint-fix", "test-fix"],
    },
}

SKIP_DIR_NAMES = {
    ".git",
    ".automation",
    "node_modules",
    ".next",
    "dist",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    "site-packages",
    "vendor",
    "build",
    "runtime",
    "reports",
}
CODE_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx"}
TODO_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b")
TODO_SCANNER_META_PATTERNS = (
    "TODO_RE",
    "TODO|FIXME",
    "TODO/FIXME",
    "TODOs",
    "todo-resolve",
    "TODO 标记",
    "FIXME 标记",
)
RUNTIME_PATH_PARTS = {
    ".automation",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "public",
    "static",
    "storybook-static",
    "vendor",
    "runtime",
    "reports",
}


def rel_parts(path: str) -> Tuple[str, ...]:
    return tuple(part for part in Path(path).parts if part not in (".", ""))


def is_runtime_or_generated_path(rel_path: str) -> bool:
    parts = rel_parts(rel_path)
    return any(part in RUNTIME_PATH_PARTS for part in parts)


def is_refactor_candidate_path(rel_path: str) -> bool:
    parts = rel_parts(rel_path)
    if not parts:
        return False
    if is_runtime_or_generated_path(rel_path):
        return False
    if parts[0] in {"tests", "test", "__tests__", "fixtures", "examples", "getting-started"}:
        return False
    return True


def is_actionable_todo_line(raw: str) -> bool:
    if not TODO_RE.search(raw):
        return False
    return not any(pattern in raw for pattern in TODO_SCANNER_META_PATTERNS)


def run(cmd: Sequence[str], cwd: Optional[str] = None, timeout: int = 30) -> Tuple[int, str]:
    try:
        r = subprocess.run(cmd, shell=False, capture_output=True, text=True, cwd=cwd, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:
        return 1, str(e)


def csv_set(value: str) -> set:
    return {item.strip() for item in value.split(",") if item.strip()}


def profile_config(profile: str) -> dict:
    return PROFILE_CONFIGS.get(profile, PROFILE_CONFIGS["legacy"])


def project_allowed(profile: str, proj: str, include_projects: set, exclude_projects: set) -> bool:
    if include_projects and proj not in include_projects:
        return False
    if proj in exclude_projects:
        return False
    cfg = profile_config(profile)
    boundary = PROJECT_BOUNDARIES.get(proj, {})
    return proj in cfg["projects"] and profile in boundary.get("profiles", ["legacy"])


def enrich_candidate(candidate: dict, profile: str) -> dict:
    project = candidate.get("project", "")
    boundary = PROJECT_BOUNDARIES.get(project, {})
    enriched = dict(candidate)
    enriched["risk_class"] = boundary.get("risk_class", "safe-local")
    enriched["loop_profile"] = profile
    enriched["allowed_files"] = boundary.get("allowed_files", [])
    enriched["blocked_actions"] = boundary.get("blocked_actions", ["push", "publish", "deploy"])
    enriched["validation_cmd"] = boundary.get("validation_cmd", "")
    enriched["review_target"] = "changed-files-only"
    enriched["done_criteria"] = [
        "allowed file set respected",
        "validation command passed or blocker recorded",
        "changed-files review completed when files changed",
        "no push/publish/deploy performed",
    ]
    return enriched


def candidate_allowed(candidate: dict, profile: str) -> bool:
    cfg = profile_config(profile)
    boundary = PROJECT_BOUNDARIES.get(candidate.get("project", ""), {})
    risk_class = boundary.get("risk_class", "safe-local")
    task_type = candidate.get("type")
    return risk_class in cfg["risk_classes"] and task_type in cfg["task_types"]


def scan_outdated_deps(proj: str, proj_dir: str, stack: List[str]) -> list:
    """依赖扫描 → dep-update 任务"""
    candidates = []

    if "node" in stack:
        pkg_json = os.path.join(proj_dir, "package.json")
        if os.path.exists(pkg_json):
            code, out = run(["npm", "outdated", "--json"], cwd=proj_dir, timeout=60)
            try:
                outdated = json.loads(out) if out else {}
                if outdated:
                    pkgs = list(outdated.keys())[:8]  # 最多 8 个包
                    candidates.append({
                        "project": proj,
                        "type": "dep-update",
                        "priority": 1,
                        "est_tokens": TASK_TOKEN_ESTIMATES["dep-update"],
                        "model": PROJECTS[proj]["model"],
                        "prompt": (
                            f"在 {proj_dir} 项目中，以下 npm 依赖有新版本可用：{', '.join(pkgs)}。"
                            f"先只检查项目内真实使用的 package.json（含 workspace 子包），确认这些依赖实际声明在哪些文件里。"
                            f"不要做无关的 relay/Codex/网络探测，不要做额外环境诊断，不要查询与当前任务无关的依赖。"
                            f"只做最小正确修改：更新真正需要更新的 package.json，运行 npm install。"
                            f"验证时优先执行最小必要命令：先运行项目已有的轻量检查命令；仅当轻量检查通过且该依赖确实影响前端构建时，再运行 npm run build 或对应 workspace build。"
                            f"如果存在高风险大版本升级（例如样式框架/构建链迁移），不要顺手升级全部依赖；先完成低风险依赖，明确记录剩余高风险升级。"
                            f"最后输出改了哪些文件、执行了哪些命令、哪些通过或失败；不要提交或推送。"
                        ),
                    })
            except json.JSONDecodeError:
                pass

    if "python" in stack:
        req_files = list(Path(proj_dir).glob("requirements*.txt")) + list(Path(proj_dir).glob("pyproject.toml"))
        if req_files:
            code, out = run(["pip", "list", "--outdated", "--format=json"], cwd=proj_dir, timeout=60)
            try:
                outdated = json.loads(out) if out else []
                if outdated:
                    pkgs = [p["name"] for p in outdated[:6]]
                    candidates.append({
                        "project": proj,
                        "type": "dep-update",
                        "priority": 1,
                        "est_tokens": TASK_TOKEN_ESTIMATES["dep-update"],
                        "model": PROJECTS[proj]["model"],
                        "prompt": (
                            f"在 {proj_dir} 项目中，以下 Python 依赖有新版本：{', '.join(pkgs)}。"
                            f"请更新 requirements.txt 中的版本，运行 pip install -r requirements.txt，"
                            f"修复因升级引起的 API 变更，确保 pytest 通过（如果有测试）；不要提交或推送。"
                        ),
                    })
            except json.JSONDecodeError:
                pass

    return candidates


def scan_lint_issues(proj: str, proj_dir: str, stack: List[str]) -> list:
    """Lint 扫描 → lint-fix 任务"""
    candidates = []

    if "node" in stack:
        eslint_cfg = any(
            os.path.exists(os.path.join(proj_dir, f))
            for f in [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs"]
        )
        if eslint_cfg:
            code, out = run(
                ["npx", "eslint", ".", "--format", "json", "--max-warnings", "0"],
                cwd=proj_dir, timeout=60
            )
            try:
                results = json.loads(out) if out.startswith("[") else []
                errors = sum(r.get("errorCount", 0) for r in results)
                warnings = sum(r.get("warningCount", 0) for r in results)
                if errors + warnings > 0:
                    candidates.append({
                        "project": proj,
                        "type": "lint-fix",
                        "priority": 2,
                        "est_tokens": TASK_TOKEN_ESTIMATES["lint-fix"],
                        "model": PROJECTS[proj]["model"],
                        "prompt": (
                            f"在 {proj_dir} 中，ESLint 报告 {errors} 个错误和 {warnings} 个警告。"
                            f"请运行 npx eslint . --fix 自动修复可修复的问题，"
                            f"对无法自动修复的问题手动处理，确保 npx eslint . 零报错；不要提交或推送。"
                        ),
                    })
            except (json.JSONDecodeError, TypeError):
                pass

    if "python" in stack:
        code, out = run(
            ["python3", "-m", "pylint", ".", "--exit-zero", "--output-format=json"],
            cwd=proj_dir, timeout=60
        )
        try:
            msgs = json.loads(out) if out.startswith("[") else []
            errors = [m for m in msgs if m.get("type") in ("error", "fatal")]
            if len(errors) > 0:
                files = list(set(m["path"] for m in errors[:5]))
                candidates.append({
                    "project": proj,
                    "type": "lint-fix",
                    "priority": 2,
                    "est_tokens": TASK_TOKEN_ESTIMATES["lint-fix"],
                    "model": PROJECTS[proj]["model"],
                    "prompt": (
                        f"在 {proj_dir} 中，pylint 报告 {len(errors)} 个错误，"
                        f"集中在文件: {', '.join(files)}。"
                        f"请修复所有 E 级别（error）和 F 级别（fatal）问题，"
                            f"运行 python3 -m pylint . 确认错误归零；不要提交或推送。"
                    ),
                })
        except (json.JSONDecodeError, TypeError):
            pass

    return candidates


def scan_todos(proj: str, proj_dir: str) -> list:
    """扫描 TODO/FIXME → todo-resolve 任务"""
    lines = []
    for root, dirs, files in os.walk(proj_dir):
        rel_root = os.path.relpath(root, proj_dir)
        # 跳过虚拟环境和第三方目录
        dirs[:] = [
            d for d in dirs
            if d not in SKIP_DIR_NAMES and not d.startswith(".venv") and d != "venv"
        ]
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in CODE_EXTS:
                continue
            if fn.endswith(".min.js"):
                continue
            fp = os.path.join(root, fn)
            # 跳过超大文件，避免把压缩产物塞进 prompt
            try:
                if os.path.getsize(fp) > 2 * 1024 * 1024:
                    continue
            except OSError:
                continue
            rel = os.path.relpath(fp, proj_dir)
            if is_runtime_or_generated_path(rel):
                continue
            try:
                with open(fp, encoding="utf-8", errors="ignore") as f:
                    for i, raw in enumerate(f, start=1):
                        if not is_actionable_todo_line(raw):
                            continue
                        snippet = raw.strip()
                        if len(snippet) > 180:
                            snippet = snippet[:177] + "..."
                        lines.append(f"./{rel}:{i}: {snippet}")
                        if len(lines) >= 20:
                            break
            except OSError:
                continue
            if len(lines) >= 20:
                break
        if len(lines) >= 20:
            break

    if len(lines) >= 5:
        sample = "\n".join(lines[:8])
        return [{
            "project": proj,
            "type": "todo-resolve",
            "priority": 3,
            "est_tokens": TASK_TOKEN_ESTIMATES["todo-resolve"],
            "model": PROJECTS[proj]["model"],
            "prompt": (
                f"在 {proj_dir} 中发现 {len(lines)} 处 TODO/FIXME 标记。"
                f"样本（前8条）:\n{sample}\n\n"
                f"请解决其中优先级最高的 3-5 个 TODO/FIXME，"
                f"将代码补全或记录为已知限制（加注释说明原因）；不要提交或推送。"
            ),
        }]
    return []


def scan_large_functions(proj: str, proj_dir: str, stack: List[str]) -> list:
    """找超过 80 行的函数 → refactor 任务"""
    candidates = []

    if "python" in stack:
        py_big = []
        for root, dirs, files in os.walk(proj_dir):
            dirs[:] = [
                d for d in dirs
                if d not in SKIP_DIR_NAMES and not d.startswith(".venv") and d != "venv"
            ]
            for fn in files:
                if not fn.endswith(".py"):
                    continue
                fp = os.path.join(root, fn)
                rel = os.path.relpath(fp, proj_dir)
                if not is_refactor_candidate_path(rel):
                    continue
                try:
                    with open(fp, encoding="utf-8", errors="ignore") as f:
                        line_count = sum(1 for _ in f)
                except OSError:
                    continue
                if line_count > 150:
                    py_big.append((line_count, rel))
        py_big.sort(reverse=True)
        if py_big:
            big = "\n".join(f"./{path}: {count} lines" for count, path in py_big[:5])
            candidates.append({
                "project": proj,
                "type": "refactor",
                "priority": 4,
                "est_tokens": TASK_TOKEN_ESTIMATES["refactor"],
                "model": PROJECTS[proj]["model"],
                "prompt": (
                    f"在 {proj_dir} 中，以下 Python 文件较大，可能包含过长函数：\n{big}\n\n"
                    f"请找出其中超过 80 行的函数，将其拆分为更小的函数或类，"
                    f"保持行为不变，并确保所有测试通过；不要提交或推送。"
                ),
            })

    if "node" in stack:
        js_big = []
        for root, dirs, files in os.walk(proj_dir):
            dirs[:] = [
                d for d in dirs
                if d not in SKIP_DIR_NAMES and not d.startswith(".venv") and d != "venv"
            ]
            for fn in files:
                if not (fn.endswith(".ts") or fn.endswith(".tsx") or fn.endswith(".js") or fn.endswith(".jsx")):
                    continue
                if fn.endswith(".min.js"):
                    continue
                fp = os.path.join(root, fn)
                rel = os.path.relpath(fp, proj_dir)
                if not is_refactor_candidate_path(rel):
                    continue
                try:
                    with open(fp, encoding="utf-8", errors="ignore") as f:
                        line_count = sum(1 for _ in f)
                except OSError:
                    continue
                if line_count > 200:
                    js_big.append((line_count, rel))
        js_big.sort(reverse=True)
        if js_big:
            big = "\n".join(f"./{path}: {count} lines" for count, path in js_big[:5])
            candidates.append({
                "project": proj,
                "type": "refactor",
                "priority": 4,
                "est_tokens": TASK_TOKEN_ESTIMATES["refactor"],
                "model": PROJECTS[proj]["model"],
                "prompt": (
                    f"在 {proj_dir} 中，以下 TypeScript/JS 文件体积较大：\n{big}\n\n"
                    f"请重构其中最大的文件：提取公共逻辑到 utils/ 或 hooks/，"
                    f"拆分大组件，保持行为不变，运行 npm run build 确认；不要提交或推送。"
                ),
            })

    return candidates


def scan_progress_issues(proj: str, proj_dir: str) -> list:
    """读 PROJECT_PROGRESS.md 中的红色状态 → fix 任务"""
    progress_file = os.path.join(proj_dir, "PROJECT_PROGRESS.md")
    if not os.path.exists(progress_file):
        return []

    with open(progress_file, encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # 找 🔴 开头的行
    red_lines = [l.strip() for l in content.splitlines() if "🔴" in l]
    if not red_lines:
        return []

    sample = "\n".join(red_lines[:5])
    return [{
        "project": proj,
        "type": "test-fix",
        "priority": 2,
        "est_tokens": TASK_TOKEN_ESTIMATES["test-fix"],
        "model": PROJECTS[proj]["model"],
        "prompt": (
            f"在 {proj_dir}/PROJECT_PROGRESS.md 中，以下项目标记为 🔴（待修复）：\n{sample}\n\n"
            f"请针对其中第一条红色问题，找到根本原因并修复，"
            f"修复后运行相关测试确认通过，将 PROJECT_PROGRESS.md 中对应条目更新为 ✅；不要提交或推送。"
        ),
    }]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=os.path.expanduser(
        "~/tools/automation/runtime/auto-refactor/candidates.json"))
    parser.add_argument("--profile", default=os.environ.get("AUTO_REF_LOOP_PROFILE", "legacy"))
    parser.add_argument("--projects", default=os.environ.get("AUTO_REF_LOOP_PROJECTS", ""))
    parser.add_argument("--exclude-projects", default=os.environ.get("AUTO_REF_LOOP_EXCLUDE_PROJECTS", ""))
    args = parser.parse_args()

    all_candidates = []
    profile = args.profile if args.profile in PROFILE_CONFIGS else "legacy"
    include_projects = csv_set(args.projects)
    exclude_projects = csv_set(args.exclude_projects)

    for proj, cfg in PROJECTS.items():
        if not project_allowed(profile, proj, include_projects, exclude_projects):
            print(f"  ⏭️  {proj}: profile={profile} 不允许，跳过")
            continue
        proj_dir = os.path.expanduser(cfg["dir"])
        if not os.path.isdir(proj_dir):
            print(f"  ⚠️  {proj}: 目录不存在 ({proj_dir})，跳过")
            continue

        print(f"  🔍 扫描 {proj} ...")
        stack = cfg["stack"]

        all_candidates.extend(scan_outdated_deps(proj, proj_dir, stack))
        all_candidates.extend(scan_lint_issues(proj, proj_dir, stack))
        all_candidates.extend(scan_todos(proj, proj_dir))
        all_candidates.extend(scan_large_functions(proj, proj_dir, stack))
        all_candidates.extend(scan_progress_issues(proj, proj_dir))

    # 去重（同 project+type 只保留一条），按优先级排序
    seen = set()
    unique = []
    for c in sorted(all_candidates, key=lambda x: x["priority"]):
        if not candidate_allowed(c, profile):
            continue
        key = f"{c['project']}:{c['type']}"
        if key not in seen:
            seen.add(key)
            c["scanned_at"] = datetime.now().isoformat()
            unique.append(enrich_candidate(c, profile))

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, indent=2)

    total_est = sum(c["est_tokens"] for c in unique)
    print(f"  📋 profile={profile} 共发现 {len(unique)} 个候选任务，预估 {total_est:,} tokens")
    print(f"  💾 写入: {args.output}")


if __name__ == "__main__":
    main()
