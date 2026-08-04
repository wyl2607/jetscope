import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
HEALTH_CHECK = REPO_ROOT / "infra" / "server" / "health-check.sh"


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content)
    path.chmod(0o755)


def _run_health_check(
    tmp_path: Path, *, readiness: str, require_ready: bool = False
) -> subprocess.CompletedProcess[str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True)
    log_path = tmp_path / "health.log"
    script = tmp_path / "health-check.sh"
    script.write_text(HEALTH_CHECK.read_text().replace('LOG="/var/log/jetscope-health.log"', f'LOG="{log_path}"'))
    script.chmod(0o755)

    ready_value = "true" if readiness in {"ready", "degraded"} else "false"
    _write_executable(
        bin_dir / "curl",
        f'''#!/bin/sh
url=""
is_headers=0
while [ "$#" -gt 0 ]; do
  case "$1" in -I|-sI) is_headers=1 ;; esac
  case "$1" in http://*|https://*) url="$1" ;; esac
  shift
done
case "$url" in
  http://test/readiness) printf '{{"status":"{readiness}","ready":{ready_value}}}' ;;
  http://test/web) [ "$is_headers" = 1 ] && printf 'content-type: text/html\\n' || printf '200' ;;
  *) printf '200' ;;
esac
''',
    )
    _write_executable(bin_dir / "date", "#!/bin/sh\nprintf '11'\n")

    return subprocess.run(
        ["bash", str(script)],
        cwd=REPO_ROOT,
        env={
            **os.environ,
            "PATH": f"{bin_dir}:{os.environ['PATH']}",
            "JETSCOPE_API_HEALTH_URL": "http://test/health",
            "JETSCOPE_API_READINESS_URL": "http://test/readiness",
            "JETSCOPE_PUBLIC_URL": "http://test/web",
            "JETSCOPE_HEALTH_REQUIRE_READY": "1" if require_ready else "0",
        },
        text=True,
        capture_output=True,
        timeout=10,
    )


def test_not_ready_api_is_advisory_when_liveness_is_200(tmp_path: Path):
    result = _run_health_check(tmp_path, readiness="not_ready")

    assert result.returncode == 0, result.stderr
    assert "API unhealthy" not in result.stdout


def test_not_ready_api_is_reported_unhealthy_in_strict_mode(tmp_path: Path):
    result = _run_health_check(tmp_path, readiness="not_ready", require_ready=True)

    assert result.returncode == 0, result.stderr
    assert "API unhealthy" in result.stdout
    assert "liveness: 200, readiness: not_ready" in result.stdout


def test_ready_and_degraded_readiness_are_accepted(tmp_path: Path):
    for readiness in ("ready", "degraded"):
        result = _run_health_check(tmp_path / readiness, readiness=readiness)

        assert result.returncode == 0, result.stderr
        assert "API unhealthy" not in result.stdout
