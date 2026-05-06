#!/usr/bin/env bash
#
# zentra-finalize-update — privileged helper that swaps a staged Zentra
# release into the live tree and restarts the replicas.
#
# DEPLOYMENT
# ──────────
# This script is installed at /usr/local/sbin/zentra-finalize-update by
# install.sh (or scripts/enable-update-orchestrator.sh on existing installs).
# It is invoked by the unprivileged helpdesk process via sudo, gated by:
#
#   /etc/sudoers.d/zentra-finalize-update
#       zentra ALL=(root) NOPASSWD: /usr/local/sbin/zentra-finalize-update *
#
# SECURITY MODEL
# ──────────────
# Sudo passes the literal arguments through with no shell expansion, so
# argument injection isn't a worry. The remaining attack surface is this
# script itself, so it:
#
#   • takes a single positional argument: the staging directory path
#   • validates the path is under $STAGING_ROOT (no path traversal)
#   • validates the staging tree contains the expected release artifacts
#   • never evaluates caller-supplied data as shell
#   • never uses cwd-dependent paths
#
# OUTCOME
# ───────
# After this script returns:
#   • $APP_DIR has been rsynced from $STAGING (excluding .env, uploads, .git)
#   • Ownership has been reset to $APP_USER:$APP_GROUP
#   • All systemd replicas have been restarted via `systemctl restart "$PREFIX@*"`
#   • A health probe has waited up to 60 s for one replica to answer /api/health
#
# The helpdesk's orchestrator process gets killed by the restart and never
# sees this script's exit code. Reconciliation of the update_run row happens
# on the next clean boot of the NEW replica (see lib/release.ts).

set -Eeo pipefail
umask 022

# ── Inputs (env vars match install.sh defaults) ─────────────────────────────
STAGING="${1:?usage: $0 <staging-dir>}"
APP_DIR="${APP_DIR:-/opt/zentra/app}"
APP_USER="${APP_USER:-zentra}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
SERVICE_PREFIX="${SERVICE_PREFIX:-zentra-api}"
STAGING_ROOT="${STAGING_ROOT:-/opt/zentra/staging}"
APP_BASE_PORT="${APP_BASE_PORT:-3000}"
LOG="${LOG:-/var/log/zentra-finalize.log}"

# ── All output goes to a logfile so the orchestrator can show it later ───────
exec >> "$LOG" 2>&1
echo
echo "════════ $(date -u +%FT%TZ) finalize $STAGING ════════"

# ── 1. Validate ──────────────────────────────────────────────────────────────
case "$STAGING" in
  "$STAGING_ROOT"/*) ;;
  *) echo "REFUSE: $STAGING is not under $STAGING_ROOT" >&2; exit 2 ;;
esac
case "$STAGING" in *..*) echo "REFUSE: path traversal" >&2; exit 2;; esac
[ -d "$STAGING" ]                              || { echo "REFUSE: staging dir does not exist"; exit 2; }
[ -f "$STAGING/release.json" ]                 || { echo "REFUSE: missing release.json"; exit 3; }
[ -f "$STAGING/server/prisma/schema.prisma" ]  || { echo "REFUSE: missing server/prisma/schema.prisma"; exit 3; }
echo "validated $STAGING (release: $(jq -r .version "$STAGING/release.json"))"

# ── 2. Sync source tree ──────────────────────────────────────────────────────
# Excludes preserve customer-managed data:
#   /server/.env       — secrets (DATABASE_URL, BETTER_AUTH_SECRET, …)
#   /uploads, /server/uploads — attachment storage
#   /data              — a common conventional path for app-managed state
#   /.git              — preserves repo state if the customer uses git-based update
echo "rsync $STAGING/ → $APP_DIR/"
rsync -a --delete \
  --exclude='/server/.env' \
  --exclude='/uploads' \
  --exclude='/server/uploads' \
  --exclude='/data' \
  --exclude='/.git' \
  "$STAGING/" "$APP_DIR/"

echo "fixing ownership to $APP_USER:$APP_GROUP"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

# ── 3. Restart replicas ──────────────────────────────────────────────────────
# `systemctl restart 'zentra-api@*'` restarts every instance of the template
# unit. The orchestrator's parent process IS one of those replicas — it dies
# here. We continue running because sudo'd scripts run in a separate cgroup
# (system.slice), not the replicas' user.slice.
echo "systemctl restart '${SERVICE_PREFIX}@*'"
systemctl restart "${SERVICE_PREFIX}@*"

# ── 4. Wait for at least one replica to answer /api/health ───────────────────
echo "waiting for replica :${APP_BASE_PORT} to come up"
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${APP_BASE_PORT}/api/health" >/dev/null 2>&1; then
    echo "✓ healthy after $((i*2))s"
    echo "════════ finalize complete ════════"
    exit 0
  fi
  sleep 2
done
echo "✗ no replica answered /api/health after 60s — check journalctl -u '${SERVICE_PREFIX}@*'" >&2
exit 4
