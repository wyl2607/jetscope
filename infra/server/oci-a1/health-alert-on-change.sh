#!/bin/bash
# JetScope health state-change alert hook for oci-a1.
#
# Installed as /usr/local/bin/jetscope-health-alert-on-change and wired into
# infra/server/oci-a1/systemd/jetscope-health-check.service through
# JETSCOPE_BUS_WRITE. Source RFC:
# .governance/sprints-001-oci-a1-primary-hosting/RFC.md 「架构选择 → 告警」
# (review A4).
#
# infra/server/health-check.sh calls its bus writer like this:
#
#   <bus-write> health-check --producer <producer> --payload '<json>'
#
# with payload {"producer":..,"status":..,"summary":..,"error":..}. This script
# keeps one state file per component and calls the oci-a1 alert command only
# when a component flips between ok and failed, so a permanently broken service
# produces one alert instead of one per minute.
#
# Usage:
#   jetscope-health-alert-on-change <channel> --producer <p> --payload <json>
#                                      [--dry-run]
#
# Env:
#   JETSCOPE_ALERT_STATE_DIR  state dir, default /var/lib/jetscope-health
#                             (the systemd unit provides it via StateDirectory=)
#   OCI_TG_ALERT              alert command, default /usr/local/bin/oci-tg-alert
#
# Status mapping: ok|recovered -> healthy, failed -> unhealthy, recovering is a
# transient state and is only logged. The script always exits 0: it must never
# disturb the health check that invoked it.

set -Eeuo pipefail

STATE_DIR="${JETSCOPE_ALERT_STATE_DIR:-/var/lib/jetscope-health}"
ALERT_BIN="${OCI_TG_ALERT:-/usr/local/bin/oci-tg-alert}"

DRY_RUN=0
CHANNEL=""
PRODUCER=""
PAYLOAD=""
SUMMARY=""
ERROR_TEXT=""

log() {
    local msg="$*"
    printf 'jetscope-health-alert: %s\n' "$msg" >&2
    if command -v logger >/dev/null 2>&1; then
        logger -t jetscope-health-alert -- "$msg" >/dev/null 2>&1 || true
    fi
}

stop() {
    log "$*"
    exit 0
}

trap 'log "unexpected failure at line $LINENO (swallowed)"' ERR

while [ "$#" -gt 0 ]; do
    case "$1" in
        --producer)
            PRODUCER="${2:-}"
            shift 2 2>/dev/null || shift
            ;;
        --payload)
            PAYLOAD="${2:-}"
            shift 2 2>/dev/null || shift
            ;;
        --dry-run|-n)
            DRY_RUN=1
            shift
            ;;
        --)
            shift
            break
            ;;
        --*)
            log "ignoring unknown option: $1"
            shift
            ;;
        *)
            if [ -z "$CHANNEL" ]; then
                CHANNEL="$1"
            else
                log "ignoring extra argument: $1"
            fi
            shift
            ;;
    esac
done

if [ -z "$PAYLOAD" ]; then
    stop "no --payload given (channel=${CHANNEL:-none})"
fi

json_string() {
    printf '%s' "$PAYLOAD" | tr '\n' ' ' | sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

STATUS="$(json_string status)"
SUMMARY="$(json_string summary)"
ERROR_TEXT="$(json_string error)"
[ -n "$STATUS" ] || stop "payload has no status field (producer=${PRODUCER:-unknown})"

case "$STATUS" in
    ok|recovered)
        TARGET=ok
        ;;
    failed)
        TARGET=failed
        ;;
    recovering)
        log "transient status=recovering (producer=${PRODUCER:-unknown}); no alert"
        exit 0
        ;;
    *)
        stop "unknown status '$STATUS' (producer=${PRODUCER:-unknown})"
        ;;
esac

COMPONENTS=""
TEXT="$SUMMARY $ERROR_TEXT"
if printf '%s' "$TEXT" | grep -qiE '(^|[^[:alnum:]_])api([^[:alnum:]_]|$)'; then
    COMPONENTS="api"
fi
if printf '%s' "$TEXT" | grep -qiE '(^|[^[:alnum:]_])web([^[:alnum:]_]|$)'; then
    COMPONENTS="${COMPONENTS:+$COMPONENTS }web"
fi
[ -n "$COMPONENTS" ] || stop "cannot infer api/web component from payload: $TEXT"

if ! mkdir -p "$STATE_DIR" 2>/dev/null; then
    stop "state dir is not writable: $STATE_DIR"
fi

HOST="$(hostname 2>/dev/null || echo unknown)"
DETAIL="status=$STATUS producer=${PRODUCER:-unknown}"
if [ -n "$SUMMARY" ]; then
    DETAIL="$DETAIL summary=$SUMMARY"
fi
if [ -n "$ERROR_TEXT" ]; then
    DETAIL="$DETAIL error=$ERROR_TEXT"
fi
DETAIL="$(printf '%s' "$DETAIL" | tr '\n' ' ' | cut -c1-800)"

for COMPONENT in $COMPONENTS; do
    STATE_FILE="$STATE_DIR/$COMPONENT.state"
    PREVIOUS="ok"
    if [ -f "$STATE_FILE" ]; then
        PREVIOUS="$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null || true)"
    fi
    case "$PREVIOUS" in
        ok|failed) ;;
        *) PREVIOUS="ok" ;;
    esac

    if [ "$PREVIOUS" = "$TARGET" ]; then
        log "$COMPONENT still $TARGET (status=$STATUS); no alert"
        continue
    fi

    if [ "$DRY_RUN" = "1" ]; then
        log "dry-run: would record $COMPONENT $PREVIOUS -> $TARGET"
    else
        TMP_STATE="$STATE_FILE.tmp.$$"
        printf '%s\n' "$TARGET" > "$TMP_STATE" && mv -f "$TMP_STATE" "$STATE_FILE"
    fi

    MSG="[${HOST}] jetscope-${COMPONENT} ${PREVIOUS} -> ${TARGET}: ${DETAIL}"

    if [ "$DRY_RUN" = "1" ]; then
        log "dry-run: would alert: $MSG"
    elif [ ! -x "$ALERT_BIN" ]; then
        log "alert command is not executable: $ALERT_BIN"
    elif "$ALERT_BIN" "$MSG" >/dev/null 2>&1; then
        log "alerted: $MSG"
    else
        log "alert command failed: $ALERT_BIN"
    fi
done

exit 0
