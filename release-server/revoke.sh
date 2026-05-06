#!/usr/bin/env bash
# Revoke (or fully remove) a Zentra Helpdesk install from the allowlist.
#
# Usage:
#   revoke.sh <installId>           — soft revoke (keeps the row, sets revoked=true)
#   revoke.sh <installId> --delete  — hard delete the row
set -euo pipefail

INSTALL_ID="${1:?Usage: revoke.sh <installId> [--delete]}"
MODE="${2:-soft}"

HOME_DIR="${RELEASE_HOME:-/srv/zentra-releases}"
ALLOW="$HOME_DIR/allowlist.json"
[ -f "$ALLOW" ] || { echo "[revoke] No allowlist file"; exit 1; }

TMP=$(mktemp)
if [ "$MODE" = "--delete" ]; then
  jq --arg id "$INSTALL_ID" 'del(.[$id])' "$ALLOW" > "$TMP" && mv "$TMP" "$ALLOW"
  echo "[revoke] Deleted $INSTALL_ID"
else
  jq --arg id "$INSTALL_ID" --arg now "$(date -u +%FT%TZ)" \
    '.[$id].revoked = true | .[$id].revokedAt = $now' "$ALLOW" > "$TMP" && mv "$TMP" "$ALLOW"
  echo "[revoke] Soft-revoked $INSTALL_ID (run again with --delete to remove)"
fi
chmod 600 "$ALLOW"
chown zentra-release:zentra-release "$ALLOW" 2>/dev/null || true
