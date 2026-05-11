#!/usr/bin/env bash
#
# zentra-set-replicas — privileged helper that scales the Zentra API
# systemd template up or down between 1 and 4 instances.
#
# DEPLOYMENT
# ──────────
# Installed at /usr/local/sbin/zentra-set-replicas by
# scripts/enable-update-orchestrator.sh, gated by:
#
#   /etc/sudoers.d/zentra-set-replicas
#       zentra ALL=(root) NOPASSWD: /usr/local/sbin/zentra-set-replicas *
#
# Invoked by the unprivileged helpdesk process via sudo from the
# `/api/admin/replicas` route handler.
#
# SECURITY MODEL
# ──────────────
# Sudo passes args literally with no shell expansion. The script:
#   • takes a single positional argument: the target replica count
#   • accepts ONLY integers 1..4 — anything else is rejected
#   • only ever operates on the configured $SERVICE_PREFIX template
#   • never reads caller-supplied data as shell
#
# OUTPUT
# ──────
# Emits one JSON object per line on stdout (NDJSON) so the API
# route can stream and parse incrementally. Each event has shape:
#   { "t": <unix-ms>, "event": "<name>", ... }
# Terminal events are `done` (success) or `error` (failure).
# All output also goes to /var/log/zentra-replicas.log.

set -Eeo pipefail
umask 022

# ── Inputs (env vars match install.sh defaults) ─────────────────────────────
TARGET="${1:?usage: $0 <target-count 1..4>}"
SERVICE_PREFIX="${SERVICE_PREFIX:-zentra-api}"
APP_BASE_PORT="${APP_BASE_PORT:-3000}"
MAX_REPLICAS="${MAX_REPLICAS:-4}"
LOG="${LOG:-/var/log/zentra-replicas.log}"
HEALTH_WAIT_SECS="${HEALTH_WAIT_SECS:-30}"

# ── Logging helpers (NDJSON to stdout, plain to logfile) ─────────────────────
emit() {
  local payload
  payload="$1"
  printf '%s\n' "$payload"
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$payload" >> "$LOG" 2>/dev/null || true
}
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
now_ms() { printf '%s' "$(date +%s%N | cut -c1-13)"; }

event() {
  # event <name> [key=value ...]
  local name="$1"; shift
  local body="\"t\":$(now_ms),\"event\":\"${name}\""
  while [ $# -gt 0 ]; do
    case "$1" in
      *=*)
        local k="${1%%=*}" v="${1#*=}"
        # Numeric values stay bare; everything else is quoted+escaped.
        if [[ "$v" =~ ^-?[0-9]+$ ]]; then
          body+=",\"${k}\":${v}"
        else
          body+=",\"${k}\":\"$(json_escape "$v")\""
        fi
        ;;
    esac
    shift
  done
  emit "{${body}}"
}

fail() {
  event error message="$1" code="${2:-1}"
  exit "${2:-1}"
}

# ── 1. Validate target ───────────────────────────────────────────────────────
case "$TARGET" in
  ''|*[!0-9]*) fail "target must be an integer (got '$TARGET')" 2 ;;
esac
(( TARGET >= 1 && TARGET <= MAX_REPLICAS )) \
  || fail "target must be between 1 and $MAX_REPLICAS (got $TARGET)" 2

# ── 2. Discover current state ───────────────────────────────────────────────
event begin target="$TARGET" basePort="$APP_BASE_PORT" servicePrefix="$SERVICE_PREFIX"

# All currently-enabled instances of this template. `list-unit-files` covers
# enabled-but-stopped units that list-units misses. Output looks like:
#   zentra-api@3000.service enabled
ENABLED_PORTS=()
while IFS= read -r line; do
  port="${line#${SERVICE_PREFIX}@}"
  port="${port%.service*}"
  case "$port" in
    ''|*[!0-9]*) continue ;;
  esac
  ENABLED_PORTS+=("$port")
done < <(systemctl list-unit-files --no-legend "${SERVICE_PREFIX}@*.service" 2>/dev/null \
           | awk '$2 == "enabled" {print $1}')

# Sort numerically so we deterministically enable/disable from the base port up.
IFS=$'\n' ENABLED_PORTS=($(printf '%s\n' "${ENABLED_PORTS[@]}" | sort -n))
unset IFS

CURRENT=${#ENABLED_PORTS[@]}
event state current="$CURRENT" enabled="$(IFS=,; echo "${ENABLED_PORTS[*]}")"

# Desired port set: APP_BASE_PORT .. APP_BASE_PORT + TARGET - 1
DESIRED_PORTS=()
for ((i = 0; i < TARGET; i++)); do
  DESIRED_PORTS+=("$((APP_BASE_PORT + i))")
done

# ── 3. Compute the diff ─────────────────────────────────────────────────────
declare -A WANT
for p in "${DESIRED_PORTS[@]}"; do WANT["$p"]=1; done

TO_DISABLE=()
for p in "${ENABLED_PORTS[@]}"; do
  [[ -z "${WANT[$p]:-}" ]] && TO_DISABLE+=("$p")
done

declare -A HAVE
for p in "${ENABLED_PORTS[@]}"; do HAVE["$p"]=1; done

TO_ENABLE=()
for p in "${DESIRED_PORTS[@]}"; do
  [[ -z "${HAVE[$p]:-}" ]] && TO_ENABLE+=("$p")
done

event plan toEnable="$(IFS=,; echo "${TO_ENABLE[*]}")" toDisable="$(IFS=,; echo "${TO_DISABLE[*]}")"

# Short-circuit no-op so the route handler can report "no changes" cleanly.
if [ ${#TO_ENABLE[@]} -eq 0 ] && [ ${#TO_DISABLE[@]} -eq 0 ]; then
  event done changed=0 final="$TARGET"
  exit 0
fi

# ── 4. Disable replicas we no longer want ───────────────────────────────────
# Disable from highest port down so the base port (which is most likely to be
# handling the request that triggered this) is touched last (and only if the
# operator is shrinking BELOW the base — which we never do, target>=1).
IFS=$'\n' TO_DISABLE_SORTED=($(printf '%s\n' "${TO_DISABLE[@]}" | sort -rn))
unset IFS
for port in "${TO_DISABLE_SORTED[@]}"; do
  unit="${SERVICE_PREFIX}@${port}.service"
  event disabling port="$port" unit="$unit"
  if systemctl disable --now "$unit" >>"$LOG" 2>&1; then
    event disabled port="$port"
  else
    fail "failed to disable $unit (see $LOG)" 3
  fi
done

# ── 5. Enable replicas we need ──────────────────────────────────────────────
for port in "${TO_ENABLE[@]}"; do
  unit="${SERVICE_PREFIX}@${port}.service"
  event enabling port="$port" unit="$unit"
  if systemctl enable --now "$unit" >>"$LOG" 2>&1; then
    event enabled port="$port"
  else
    fail "failed to enable $unit (see $LOG)" 4
  fi
done

# ── 6. Health-probe the new set ─────────────────────────────────────────────
event probing ports="$(IFS=,; echo "${DESIRED_PORTS[*]}")"
HEALTHY=0
for port in "${DESIRED_PORTS[@]}"; do
  for ((i = 0; i < HEALTH_WAIT_SECS; i++)); do
    if curl -fsS --max-time 2 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      event healthy port="$port" waited="$i"
      HEALTHY=$((HEALTHY + 1))
      break
    fi
    sleep 1
  done
done

event done changed=$(( ${#TO_ENABLE[@]} + ${#TO_DISABLE[@]} )) final="$TARGET" healthy="$HEALTHY"
exit 0
