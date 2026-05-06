#!/usr/bin/env bash
# Publish a new release from the bare git repo.
#
# Usage:
#   publish.sh <version> [channel]
#     version  — semver string (e.g. 1.4.0)
#     channel  — stable | beta | nightly  (default: stable)
#
# Steps:
#   1. Check out the version tag (or HEAD) from the bare repo
#   2. Build the source tarball
#   3. Compute SHA-256
#   4. Read / validate the release.json the source contains
#   5. Drop the artifact into artifacts/<version>/
#   6. Append the release into manifests/<channel>.json (top of list)
#
# Only commits/tags already pushed to repo.git can be published. Idempotent
# for the same version+sha; reruns regenerate metadata.

set -euo pipefail

VERSION="${1:?Usage: publish.sh <version> [channel]}"
CHANNEL="${2:-stable}"

HOME_DIR="${RELEASE_HOME:-/srv/zentra-releases}"
REPO="$HOME_DIR/repo.git"
ART_DIR="$HOME_DIR/artifacts/$VERSION"
MANIFEST="$HOME_DIR/manifests/$CHANNEL.json"
WORKTREE="$(mktemp -d)"
trap 'rm -rf "$WORKTREE"' EXIT

# 1. Checkout
echo "[publish] Resolving v$VERSION from $REPO"
if git --git-dir="$REPO" rev-parse "v$VERSION" >/dev/null 2>&1; then
  REF="v$VERSION"
elif git --git-dir="$REPO" rev-parse "$VERSION" >/dev/null 2>&1; then
  REF="$VERSION"
else
  echo "  No tag v$VERSION or $VERSION found — using HEAD."
  REF="HEAD"
fi
git --git-dir="$REPO" --work-tree="$WORKTREE" checkout -f "$REF" -- .

# 2. Validate release.json carries the matching version
RELEASE_JSON="$WORKTREE/release.json"
if [ ! -f "$RELEASE_JSON" ]; then
  echo "[publish] ERROR: $RELEASE_JSON missing in this revision" >&2
  exit 2
fi
DECLARED=$(jq -r .version "$RELEASE_JSON")
if [ "$DECLARED" != "$VERSION" ]; then
  echo "[publish] ERROR: release.json declares version '$DECLARED' but you asked to publish '$VERSION'" >&2
  exit 3
fi

# 3. Build tarball
mkdir -p "$ART_DIR"
TARBALL="$ART_DIR/source.tar.gz"
echo "[publish] Building $TARBALL"
tar -C "$WORKTREE" \
    --exclude="./.git" --exclude="./node_modules" --exclude="./.next" \
    --exclude="./dist" --exclude="./client/dist" --exclude="./server/dist" \
    -czf "$TARBALL" .

# 4. SHA-256
SHA=$(sha256sum "$TARBALL" | awk '{print $1}')
echo "[publish] sha256: $SHA"

# 5. release.json + artifact.json
cp "$RELEASE_JSON" "$ART_DIR/release.json"
DOMAIN_FALLBACK="zentraitsm.com"
DOMAIN="${ZENTRA_DOMAIN:-$DOMAIN_FALLBACK}"
ARTIFACT_URL="https://$DOMAIN/releases/$VERSION/source.tar.gz"
jq -n --arg url "$ARTIFACT_URL" --arg sha "$SHA" \
   '{ url: $url, sha256: $sha }' > "$ART_DIR/artifact.json"

# 6. Append to channel manifest (top of list, deduped)
TMP=$(mktemp)
jq --slurpfile rel "$ART_DIR/release.json" --arg ch "$CHANNEL" '
  .channel = $ch
  | .releases = (
      [($rel[0])] +
      (.releases // [] | map(select(.version != $rel[0].version)))
    )
' "$MANIFEST" > "$TMP" && mv "$TMP" "$MANIFEST"

echo "[publish] OK — $VERSION published to channel '$CHANNEL'"
echo "[publish]   index:    $MANIFEST"
echo "[publish]   tarball:  $TARBALL"
echo "[publish]   manifest: $ART_DIR/release.json"
