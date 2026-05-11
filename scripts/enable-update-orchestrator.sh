#!/usr/bin/env bash
#
# enable-update-orchestrator.sh — one-shot bootstrap for EXISTING Zentra installs.
#
# Use this when you have a Zentra ITSM install that pre-dates the in-tool
# update orchestrator and you want to start using it. It is idempotent and
# **non-destructive**:
#
#   • Never runs git pull / git reset
#   • Never runs prisma migrate deploy
#   • Never runs prisma db seed
#   • Never restarts replicas without showing what it'd do (--dry-run friendly)
#
# What it does:
#
#   1. Ensures $APP_HOME/{staging,artifacts,backups/updates} exist with the
#      right ownership for the orchestrator to write to them.
#   2. Appends the UPDATE_* env vars to server/.env if they aren't there.
#   3. Patches the systemd unit's ReadWritePaths if needed (so the hardened
#      service can write into the new dirs), then daemon-reloads.
#   4. (Optional) Restarts the replicas — only when invoked with --restart.
#
# This script is safe to ship as part of an "upgrade your install to support
# in-tool updates" instruction set for customers who installed Zentra before
# the orchestrator was introduced.
#
# Usage:
#   sudo bash enable-update-orchestrator.sh
#   sudo bash enable-update-orchestrator.sh --dry-run     # show what would change, do nothing
#   sudo bash enable-update-orchestrator.sh --restart     # also restart replicas at the end

set -Eeo pipefail

# ── Defaults — match install.sh exactly ─────────────────────────────────────
APP_USER="${APP_USER:-zentra}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_HOME="${APP_HOME:-/opt/zentra}"
APP_DIR="${APP_DIR:-$APP_HOME/app}"
SERVICE_PREFIX="${SERVICE_PREFIX:-zentra-api}"
ENV_FILE="$APP_DIR/server/.env"
UNIT_FILE="/etc/systemd/system/${SERVICE_PREFIX}@.service"

DRY_RUN=0
DO_RESTART=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --restart) DO_RESTART=1; shift ;;
    --help|-h) sed -n '2,32p' "$0"; exit 0 ;;
    *)         echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ── Helpers ─────────────────────────────────────────────────────────────────
ts()   { date '+%H:%M:%S'; }
log()  { printf '\033[1;36m[%s] %s\033[0m\n' "$(ts)" "$*"; }
ok()   { printf '\033[1;32m[%s] %s\033[0m\n' "$(ts)" "$*"; }
warn() { printf '\033[1;33m[%s] %s\033[0m\n' "$(ts)" "$*" >&2; }
die()  { printf '\033[1;31m[%s] FATAL: %s\033[0m\n' "$(ts)" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash $0"

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  \033[1;35m[dry-run]\033[0m %s\n' "$*"
  else
    eval "$*"
  fi
}

# ── 1. Pre-flight ───────────────────────────────────────────────────────────
log "Checking install layout"
[ -f "$ENV_FILE" ]   || die "Missing $ENV_FILE — is APP_DIR=$APP_DIR correct?"
[ -d "$APP_DIR/.git" ] || warn "$APP_DIR is not a git checkout; that's fine for tarball-based updates."
id "$APP_USER"  >/dev/null 2>&1 || die "User '$APP_USER' does not exist"

# ── 2. Working directories ──────────────────────────────────────────────────
log "Ensuring orchestrator working directories"
for dir in "$APP_HOME/staging" "$APP_HOME/artifacts" "$APP_HOME/backups/updates"; do
  if [ -d "$dir" ]; then
    ok "  exists: $dir"
  else
    run "install -d -m 0750 -o '$APP_USER' -g '$APP_GROUP' '$dir'"
    ok "  created: $dir"
  fi
done

# ── 3. Env vars ─────────────────────────────────────────────────────────────
log "Patching $ENV_FILE"
declare -A WANTED=(
  [UPDATE_APP_DIR]="$APP_DIR"
  [UPDATE_BUN_BIN]="/usr/local/bin/bun"
  [UPDATE_SERVICE_PREFIX]="$SERVICE_PREFIX"
  [UPDATE_BACKUP_DIR]="$APP_HOME/backups/updates"
  [UPDATE_STAGING_DIR]="$APP_HOME/staging"
  [UPDATE_ARTIFACT_DIR]="$APP_HOME/artifacts"
)
NEW_ENV=()
for key in "${!WANTED[@]}"; do
  if grep -qE "^${key}=" "$ENV_FILE"; then
    ok "  already set: $key"
  else
    NEW_ENV+=("$key=\"${WANTED[$key]}\"")
  fi
done
if [ ${#NEW_ENV[@]} -gt 0 ]; then
  log "  appending ${#NEW_ENV[@]} new var(s) to $ENV_FILE"
  block="
# ── Update orchestrator (added by enable-update-orchestrator.sh) ──"
  for line in "${NEW_ENV[@]}"; do block+=$'\n'"$line"; done
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  \033[1;35m[dry-run]\033[0m would append:\n%s\n' "$block"
  else
    printf '%s\n' "$block" >> "$ENV_FILE"
    chown "$APP_USER:$APP_GROUP" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    ok "  appended"
  fi
fi

# ── 4. systemd unit ─────────────────────────────────────────────────────────
if [ -f "$UNIT_FILE" ]; then
  log "Checking $UNIT_FILE for ReadWritePaths coverage"
  REQUIRED_PATHS=("$APP_DIR" "$APP_HOME/staging" "$APP_HOME/artifacts" "$APP_HOME/backups")
  CURRENT=$(grep -E "^ReadWritePaths=" "$UNIT_FILE" || echo "")
  MISSING=()
  for p in "${REQUIRED_PATHS[@]}"; do
    [[ "$CURRENT" == *"$p"* ]] || MISSING+=("$p")
  done
  if [ ${#MISSING[@]} -gt 0 ]; then
    log "  missing: ${MISSING[*]}"
    if [ "$DRY_RUN" -eq 1 ]; then
      printf '  \033[1;35m[dry-run]\033[0m would replace ReadWritePaths line\n'
    else
      # Replace ReadWritePaths line atomically; preserve everything else.
      # If no line exists at all, insert before [Install].
      if [ -n "$CURRENT" ]; then
        sed -i.bak "s|^ReadWritePaths=.*|ReadWritePaths=${REQUIRED_PATHS[*]}|" "$UNIT_FILE"
      else
        sed -i.bak "/^\[Install\]/i ReadWritePaths=${REQUIRED_PATHS[*]}" "$UNIT_FILE"
      fi
      ok "  patched ReadWritePaths (backup at $UNIT_FILE.bak)"
      run "systemctl daemon-reload"
    fi
  else
    ok "  ReadWritePaths already covers all required dirs"
  fi
else
  warn "No systemd unit at $UNIT_FILE — skipping systemd patch."
  warn "If you use Docker / pm2 / a different supervisor, ensure the running"
  warn "process has write access to $APP_HOME/{staging,artifacts,backups}."
fi

# ── 5. Privileged finalize helper ───────────────────────────────────────────
# This is what makes "Apply update" complete from the UI without an SSH session.
log "Installing privileged finalize helper"
HELPER_SRC="$APP_DIR/scripts/zentra-finalize-update.sh"
HELPER_DST="/usr/local/sbin/zentra-finalize-update"
SUDOERS_SRC="$APP_DIR/scripts/zentra-finalize-update.sudoers"
SUDOERS_DST="/etc/sudoers.d/zentra-finalize-update"

if [ ! -f "$HELPER_SRC" ]; then
  warn "  skipping: $HELPER_SRC not found in this checkout"
  warn "  (pull a release that ships the helper, or copy it manually)"
elif [ -f "$HELPER_DST" ] && cmp -s "$HELPER_SRC" "$HELPER_DST" 2>/dev/null \
     && [ -f "$SUDOERS_DST" ] && cmp -s "$SUDOERS_SRC" "$SUDOERS_DST" 2>/dev/null; then
  ok "  already installed & up to date"
else
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  \033[1;35m[dry-run]\033[0m would install:\n'
    printf '             %s -> %s (mode 0755 root:root)\n' "$HELPER_SRC" "$HELPER_DST"
    printf '             %s -> %s (mode 0440 root:root, validated by visudo)\n' "$SUDOERS_SRC" "$SUDOERS_DST"
  else
    run "install -o root -g root -m 0755 '$HELPER_SRC' '$HELPER_DST'"
    if visudo -cf "$SUDOERS_SRC" >/dev/null 2>&1; then
      run "install -o root -g root -m 0440 '$SUDOERS_SRC' '$SUDOERS_DST'"
      run "install -o root -g root -m 0644 /dev/null /var/log/zentra-finalize.log"
      ok "  helper + sudoers installed"
    else
      die "Refusing: $SUDOERS_SRC failed visudo validation"
    fi
  fi
fi

# ── 5b. Privileged replica-scaling helper ───────────────────────────────────
# This is what lets Settings → Infrastructure scale API replicas live without
# an SSH session. Mirrors the finalize helper pattern exactly.
log "Installing privileged replica-scaling helper"
REPL_HELPER_SRC="$APP_DIR/scripts/zentra-set-replicas.sh"
REPL_HELPER_DST="/usr/local/sbin/zentra-set-replicas"
REPL_SUDOERS_SRC="$APP_DIR/scripts/zentra-set-replicas.sudoers"
REPL_SUDOERS_DST="/etc/sudoers.d/zentra-set-replicas"

if [ ! -f "$REPL_HELPER_SRC" ]; then
  warn "  skipping: $REPL_HELPER_SRC not found in this checkout"
  warn "  (pull a release that ships the helper, or copy it manually)"
elif [ -f "$REPL_HELPER_DST" ] && cmp -s "$REPL_HELPER_SRC" "$REPL_HELPER_DST" 2>/dev/null \
     && [ -f "$REPL_SUDOERS_DST" ] && cmp -s "$REPL_SUDOERS_SRC" "$REPL_SUDOERS_DST" 2>/dev/null; then
  ok "  already installed & up to date"
else
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  \033[1;35m[dry-run]\033[0m would install:\n'
    printf '             %s -> %s (mode 0755 root:root)\n' "$REPL_HELPER_SRC" "$REPL_HELPER_DST"
    printf '             %s -> %s (mode 0440 root:root, validated by visudo)\n' "$REPL_SUDOERS_SRC" "$REPL_SUDOERS_DST"
  else
    run "install -o root -g root -m 0755 '$REPL_HELPER_SRC' '$REPL_HELPER_DST'"
    if visudo -cf "$REPL_SUDOERS_SRC" >/dev/null 2>&1; then
      run "install -o root -g root -m 0440 '$REPL_SUDOERS_SRC' '$REPL_SUDOERS_DST'"
      run "install -o root -g root -m 0644 /dev/null /var/log/zentra-replicas.log"
      run "chown $APP_USER:$APP_GROUP /var/log/zentra-replicas.log"
      ok "  replica-scaling helper + sudoers installed"
    else
      die "Refusing: $REPL_SUDOERS_SRC failed visudo validation"
    fi
  fi
fi

# ── 6. Restart (opt-in) ─────────────────────────────────────────────────────
if [ "$DO_RESTART" -eq 1 ]; then
  log "Restarting replicas: systemctl restart '${SERVICE_PREFIX}@*'"
  run "systemctl restart '${SERVICE_PREFIX}@*'"
else
  warn ""
  warn "Skipped restart. The new env vars take effect on the NEXT restart."
  warn "When you're ready, run:  sudo systemctl restart '${SERVICE_PREFIX}@*'"
fi

ok ""
ok "Update orchestrator is ready on this install."
ok "Customers can now use Settings → Updates → Available → Apply update."
