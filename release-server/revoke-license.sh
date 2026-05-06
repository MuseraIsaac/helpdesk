#!/usr/bin/env bash
# Revoke a license. All currently-enrolled installs lose access immediately.
#
# Usage:
#   revoke-license.sh ZNTR-XXXX-XXXX-XXXX-XXXX           — soft revoke
#   revoke-license.sh ZNTR-XXXX-XXXX-XXXX-XXXX --delete  — hard delete
#
# Soft revoke flips `revoked: true` on the license and on every install row
# enrolled under it. Hard delete removes the license entirely (history goes
# with it — prefer soft revoke unless you really need it gone).
set -euo pipefail

KEY="${1:?Usage: revoke-license.sh ZNTR-XXXX-XXXX-XXXX-XXXX [--delete]}"
MODE="${2:-soft}"

HOME_DIR="${RELEASE_HOME:-/srv/zentra-releases}"
LICENSES="$HOME_DIR/licenses.json"
ALLOW="$HOME_DIR/allowlist.json"

[ -f "$LICENSES" ] || { echo "[revoke] no licenses file"; exit 1; }
[ -f "$ALLOW" ]    || echo '{}' > "$ALLOW"

# 1. Mutate the license.
TMP=$(mktemp)
if [ "$MODE" = "--delete" ]; then
  jq --arg k "$KEY" 'del(.[$k])' "$LICENSES" > "$TMP" && mv "$TMP" "$LICENSES"
  echo "[revoke] license $KEY deleted"
else
  jq --arg k "$KEY" --arg now "$(date -u +%FT%TZ)" \
     '.[$k].revoked = true | .[$k].revokedAt = $now' "$LICENSES" > "$TMP" && mv "$TMP" "$LICENSES"
  echo "[revoke] license $KEY soft-revoked"
fi
chmod 600 "$LICENSES"

# 2. Mark every install enrolled under this license as revoked too — so
#    even cached HMAC sigs stop working immediately. Don't delete; the install
#    can re-enroll with a fresh license without losing the row history.
TMP2=$(mktemp)
jq --arg k "$KEY" --arg now "$(date -u +%FT%TZ)" '
  with_entries(
    if .value.licenseKey == $k
    then .value |= (.revoked = true | .revokedAt = $now)
    else .
    end
  )
' "$ALLOW" > "$TMP2" && mv "$TMP2" "$ALLOW"
chmod 600 "$ALLOW"
chown zentra-release:zentra-release "$ALLOW" "$LICENSES" 2>/dev/null || true
echo "[revoke] all installs enrolled under $KEY have been revoked"
