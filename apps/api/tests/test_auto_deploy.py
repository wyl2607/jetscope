import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
AUTO_DEPLOY = REPO_ROOT / "scripts" / "auto-deploy.sh"
LOCAL_COMMIT = "1" * 40
REMOTE_COMMIT = "2" * 40


def write_executable(path, content):
    path.write_text(content)
    path.chmod(0o755)


def make_harness(
    tmp_path,
    *,
    local=LOCAL_COMMIT,
    remote=REMOTE_COMMIT,
    dirty=False,
    readiness_ready=True,
    ledger_succeeds=True,
):
    deploy_dir = tmp_path / "deploy"
    state_dir = tmp_path / "state"
    bin_dir = tmp_path / "bin"
    script = tmp_path / "auto-deploy.sh"
    deploy_dir.mkdir()
    state_dir.mkdir()
    bin_dir.mkdir()
    (deploy_dir / "apps" / "web").mkdir(parents=True)
    (deploy_dir / "node_modules" / ".bin").mkdir(parents=True)
    head_file = tmp_path / "head"
    head_file.write_text(local)
    git_log = tmp_path / "git.log"

    patched = (
        AUTO_DEPLOY.read_text()
        .replace('DEPLOY_DIR="/opt/jetscope"', f'DEPLOY_DIR="{deploy_dir}"')
        .replace('LOG="/var/log/jetscope-deploy.log"', f'LOG="{tmp_path / "deploy.log"}"')
        .replace('BUILD_LOG="/var/log/jetscope-build.log"', f'BUILD_LOG="{tmp_path / "build.log"}"')
    )
    script.write_text(patched)
    script.chmod(0o755)

    write_executable(
        bin_dir / "git",
        f"""#!/bin/sh
set -eu
case "$1 $2" in
  "symbolic-ref --short") echo main ;;
  "rev-parse HEAD") cat "{head_file}" ;;
  "rev-parse origin/main") echo "{remote}" ;;
  "fetch origin") exit 0 ;;
  "status --porcelain") [ "{'1' if dirty else ''}" ] && echo " M local-file" || true ;;
  "merge-base --is-ancestor") exit 0 ;;
  "merge --ff-only") printf 'merge %s\\n' "$*" >> "{git_log}"; printf '%s\\n' "{remote}" > "{head_file}" ;;
  "reset --hard") printf 'reset %s\\n' "$*" >> "{git_log}"; printf '%s\\n' "$3" > "{head_file}" ;;
  *) echo "unexpected git $*" >&2; exit 99 ;;
esac
""",
    )
    write_executable(
        bin_dir / "curl",
        f"""#!/bin/sh
headers=""
url=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-D" ]; then headers="$2"; shift 2; continue; fi
  case "$1" in http://*|https://*) url="$1" ;; esac
  shift
done
[ -n "$headers" ] && printf 'content-type: text/html\\n' > "$headers"
if [ "$url" = "http://127.0.0.1:8000/v1/readiness" ]; then
  if [ "{'1' if readiness_ready else ''}" ]; then
    printf '{{"status":"ready","ready":true}}'
  else
    printf '{{"status":"not_ready","ready":false}}'
  fi
  exit 0
fi
printf '200'
""",
    )
    write_executable(bin_dir / "docker-compose", "#!/bin/sh\nexit 0\n")
    write_executable(
        bin_dir / "systemctl",
        """#!/bin/sh
[ "$1" = "is-active" ] && exit 3
exit 0
""",
    )
    write_executable(
        deploy_dir / "node_modules" / ".bin" / "next",
        "#!/bin/sh\nmkdir -p .next\nprintf ok > .next/BUILD_ID\n",
    )
    write_executable(
        tmp_path / "approval-token-ledger.sh",
        "#!/bin/sh\n"
        "approval_token_record_once() { return "
        f"{'0' if ledger_succeeds else '1'}; }}\n",
    )
    return script, deploy_dir, state_dir, bin_dir, git_log


def run_deploy(
    script,
    bin_dir,
    state_dir,
    *,
    expected=REMOTE_COMMIT,
    auto_restore=False,
):
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "APPROVE_JETSCOPE_DEPLOY": "token",
        "JETSCOPE_EXPECT_COMMIT": expected,
        "JETSCOPE_DEPLOY_STATE_DIR": str(state_dir),
        "JETSCOPE_HEALTH_TIMEOUT_SECONDS": "1",
        "JETSCOPE_HEALTH_INTERVAL_SECONDS": "1",
        "JETSCOPE_CURL_MAX_TIME_SECONDS": "1",
        "JETSCOPE_ENABLE_AUTO_RESTORE": "1" if auto_restore else "0",
    }
    return subprocess.run(
        ["bash", str(script), "--approval-token", "token"],
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=10,
    )


def test_same_commit_healthy_deploy_reconciles_success_and_clears_failure(tmp_path):
    script, _, state_dir, bin_dir, _ = make_harness(tmp_path, local=REMOTE_COMMIT)
    (state_dir / "last-failure-commit").write_text(f"{REMOTE_COMMIT}\n")

    result = run_deploy(script, bin_dir, state_dir)

    assert result.returncode == 0, result.stderr + result.stdout
    assert (state_dir / "last-success-commit").read_text() == f"{REMOTE_COMMIT}\n"
    assert not (state_dir / "last-failure-commit").exists()


def test_same_commit_healthy_deploy_keeps_existing_success_state(tmp_path):
    script, _, state_dir, bin_dir, _ = make_harness(tmp_path, local=REMOTE_COMMIT)
    success = state_dir / "last-success-commit"
    success.write_text(f"{REMOTE_COMMIT}\n")

    result = run_deploy(script, bin_dir, state_dir)

    assert result.returncode == 0, result.stderr + result.stdout
    assert success.read_text() == f"{REMOTE_COMMIT}\n"
    assert not (state_dir / "last-failure-commit").exists()


def test_dirty_new_commit_records_failure_state(tmp_path):
    script, _, state_dir, bin_dir, _ = make_harness(tmp_path, dirty=True)

    result = run_deploy(script, bin_dir, state_dir)

    assert result.returncode == 1
    assert "deploy directory is dirty" in result.stdout
    assert (state_dir / "last-failure-commit").read_text() == f"{REMOTE_COMMIT}\n"


def test_restore_uses_persisted_last_success_not_predeploy_head(tmp_path):
    prior_commit = "3" * 40
    last_success = "4" * 40
    script, _, state_dir, bin_dir, git_log = make_harness(
        tmp_path,
        local=prior_commit,
        readiness_ready=False,
    )
    (state_dir / "last-success-commit").write_text(f"{last_success}\n")

    result = run_deploy(
        script,
        bin_dir,
        state_dir,
        expected=REMOTE_COMMIT,
        auto_restore=True,
    )

    assert result.returncode == 1
    assert (state_dir / "last-failure-commit").read_text() == f"{REMOTE_COMMIT}\n"
    assert f"reset reset --hard {last_success}" in git_log.read_text()


def test_same_commit_not_ready_never_reconciles_success_or_clears_failure(tmp_path):
    script, _, state_dir, bin_dir, _ = make_harness(
        tmp_path,
        local=REMOTE_COMMIT,
        readiness_ready=False,
    )
    failure = state_dir / "last-failure-commit"
    failure.write_text(f"{REMOTE_COMMIT}\n")

    result = run_deploy(script, bin_dir, state_dir, auto_restore=True)

    assert result.returncode == 1
    assert not (state_dir / "last-success-commit").exists()
    assert failure.read_text() == f"{REMOTE_COMMIT}\n"


def test_post_fast_forward_ledger_failure_records_failure_and_restores(tmp_path):
    last_success = "4" * 40
    script, _, state_dir, bin_dir, git_log = make_harness(
        tmp_path,
        readiness_ready=False,
        ledger_succeeds=False,
    )
    (state_dir / "last-success-commit").write_text(f"{last_success}\n")

    result = run_deploy(script, bin_dir, state_dir, auto_restore=True)

    assert result.returncode == 1
    assert (state_dir / "last-failure-commit").read_text() == f"{REMOTE_COMMIT}\n"
    assert f"reset reset --hard {last_success}" in git_log.read_text()


def test_known_failed_commit_is_not_automatically_redeployed_after_restore(tmp_path):
    last_success = "4" * 40
    script, _, state_dir, bin_dir, git_log = make_harness(
        tmp_path,
        local=last_success,
        readiness_ready=False,
    )
    (state_dir / "last-success-commit").write_text(f"{last_success}\n")
    (state_dir / "last-failure-commit").write_text(f"{REMOTE_COMMIT}\n")

    result = run_deploy(script, bin_dir, state_dir)

    assert result.returncode == 1
    assert not git_log.exists()
