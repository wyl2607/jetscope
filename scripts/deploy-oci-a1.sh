#!/usr/bin/env bash
# Deploy JetScope to oci-a1 (primary) by wrapping scripts/deploy-usa-vps.sh.
#
# Topology (RFC: .governance/sprints-001-oci-a1-primary-hosting/RFC.md):
#   oci-a1 is the primary site; usa-vps is the hot standby. Publish in that
#   order: oci-a1 first, then usa-vps.
#   oci-a1 runs the API container bound to its tailnet address (compose reads
#   JETSCOPE_API_BIND from the remote .env) and the web app under the systemd
#   unit jetscope-web.service (infra/server/oci-a1/, TK-002 template).
#   There is no host nginx on oci-a1, so the host-nginx smoke probes are off.
#
# Usage:
#   bash scripts/deploy-oci-a1.sh --rebuild --dry-run
#   bash scripts/deploy-oci-a1.sh --rebuild
#
# Environment (defaults target oci-a1; override to point elsewhere):
#   JETSCOPE_DEPLOY_HOST   SSH host (default oci-a1-ts)
#   JETSCOPE_NODE_BIN      prepended to PATH for the web build (default /opt/node-22/bin)
#   JETSCOPE_SMOKE_BASE    direct API/Web smoke address (default 100.81.227.79)
#   JETSCOPE_EDGE_SMOKE    1 probes host nginx; 0 (default) skips those probes
#
# Arguments and the remaining JETSCOPE_* variables are passed through unchanged
# to deploy-usa-vps.sh.
set -Eeuo pipefail

export JETSCOPE_DEPLOY_HOST="${JETSCOPE_DEPLOY_HOST:-oci-a1-ts}"
export JETSCOPE_NODE_BIN="${JETSCOPE_NODE_BIN:-/opt/node-22/bin}"
export JETSCOPE_SMOKE_BASE="${JETSCOPE_SMOKE_BASE:-100.81.227.79}"
export JETSCOPE_EDGE_SMOKE="${JETSCOPE_EDGE_SMOKE:-0}"

exec bash "$(dirname "$0")/deploy-usa-vps.sh" "$@"
