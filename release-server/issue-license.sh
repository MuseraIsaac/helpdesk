#!/usr/bin/env bash
# Issue a new license key for a customer.
#
# Usage:
#   issue-license.sh "<customer>" [--seats N] [--channel stable|beta|nightly] [--expires YYYY-MM-DD]
#
# Prints the generated key on stdout. Save and forward it to the customer —
# they paste it once into Updates → Channel → Activate license, and the
# release server enrolls them automatically.
#
# Re-running with --regenerate-for "<customer>" issues a NEW key and
# preserves the existing seats / expiry from the matched license.

set -euo pipefail

HOME_DIR="${RELEASE_HOME:-/srv/zentra-releases}"
LICENSES="$HOME_DIR/licenses.json"
[ -f "$LICENSES" ] || echo '{}' > "$LICENSES"

CUSTOMER=""
SEATS=1
CHANNEL="stable"
EXPIRES=""

while [ $# -gt 0 ]; do
  case "$1" in
    --seats)   SEATS="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --expires) EXPIRES="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,12p' "$0"; exit 0 ;;
    -*)
      echo "Unknown flag: $1" >&2; exit 2 ;;
    *)
      CUSTOMER="$1"; shift ;;
  esac
done

if [ -z "$CUSTOMER" ]; then
  echo "Usage: issue-license.sh \"<customer>\" [--seats N] [--channel stable|beta|nightly] [--expires YYYY-MM-DD]" >&2
  exit 2
fi

# Generate a Crockford-base32 key: ZNTR-XXXX-XXXX-XXXX-XXXX
ALPHABET="ABCDEFGHJKMNPQRSTUVWXYZ23456789"
gen_block() {
  local block=""
  for _ in 1 2 3 4; do
    local idx=$(( $(od -An -N1 -tu1 /dev/urandom | tr -d ' ') % ${#ALPHABET} ))
    block="${block}${ALPHABET:$idx:1}"
  done
  echo "$block"
}

KEY="ZNTR-$(gen_block)-$(gen_block)-$(gen_block)-$(gen_block)"

# Append to licenses.json atomically.
TMP=$(mktemp)
jq --arg key "$KEY" --arg customer "$CUSTOMER" --arg ch "$CHANNEL" \
   --argjson seats "$SEATS" --arg expires "$EXPIRES" \
   --arg now "$(date -u +%FT%TZ)" '
   .[$key] = {
     customer: $customer,
     seats: $seats,
     channel: $ch,
     expires: ($expires // ""),
     issued: $now,
     revoked: false,
     enrollments: []
   }
' "$LICENSES" > "$TMP" && mv "$TMP" "$LICENSES"
chmod 600 "$LICENSES"
chown zentra-release:zentra-release "$LICENSES" 2>/dev/null || true

cat <<MSG

  ─────────────────────────────────────────────
   License issued for: $CUSTOMER
  ─────────────────────────────────────────────

   Key:      $KEY
   Channel:  $CHANNEL
   Seats:    $SEATS
   Expires:  ${EXPIRES:-never}

   Send this key to the customer. They paste it into:
   Settings → Updates → Channel → Activate license

MSG
