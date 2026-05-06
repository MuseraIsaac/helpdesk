#!/usr/bin/env bash
# Add or update a Zentra Helpdesk install in the allowlist.
#
# Usage:
#   register.sh <installId> <installSecret> "<friendly name>"
#
# The install ID + secret come from the helpdesk's
#   Settings → Updates → Channel
# panel. Run this once per helpdesk install.
set -euo pipefail

INSTALL_ID="${1:?Usage: register.sh <installId> <installSecret> <name>}"
SECRET="${2:?secret missing}"
NAME="${3:-unnamed install}"

HOME_DIR="${RELEASE_HOME:-/srv/zentra-releases}"
ALLOW="$HOME_DIR/allowlist.json"

[ -f "$ALLOW" ] || echo '{}' > "$ALLOW"

TMP=$(mktemp)
jq --arg id "$INSTALL_ID" --arg secret "$SECRET" --arg name "$NAME" \
   --arg now "$(date -u +%FT%TZ)" '
   .[$id] = { secret: $secret, name: $name, registeredAt: $now, revoked: false }
' "$ALLOW" > "$TMP" && mv "$TMP" "$ALLOW"
chmod 600 "$ALLOW"
chown zentra-release:zentra-release "$ALLOW" 2>/dev/null || true

echo "[register] OK — install '$NAME' ($INSTALL_ID) is now authorized."
