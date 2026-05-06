#!/usr/bin/env bash
# Sync releases from a GitHub repository to this release server.
#
# How it works
# ────────────
# Maintains a mirror clone of the GitHub repo at $MIRROR_DIR. On every run:
#   1. fetch + prune from origin (so deleted tags disappear)
#   2. enumerate every tag matching v* (e.g. v1.4.0, v2.0.0-beta.1)
#   3. for each tag whose version isn't already published, build the artifact
#      and prepend it to the matching channel manifest
#
# Idempotent — re-running publishes only what's missing. Cron-safe.
#
# Usage
#   sync-from-github.sh                       # publish every new tag in $REPO_URL
#   sync-from-github.sh 1.4.0                 # republish just this version (force)
#   sync-from-github.sh 1.4.0 stable          # ditto, override channel
#   sync-from-github.sh --dry-run             # show what would publish, do nothing
#   sync-from-github.sh --status              # only show current state, no fetch
#   sync-from-github.sh --quiet               # cron-friendly: only output when something changes
#   REPO_URL=git@github.com:Org/repo.git ...  # override the source repo
#
# Auth
# ────
# Public repo: no auth needed.
# Private repo via HTTPS: prepend a token to the URL, e.g.
#   REPO_URL=https://<token>@github.com/MuseraIsaac/helpdesk.git
# Private repo via SSH: install a deploy key for the zentra-release user
# and use REPO_URL=git@github.com:MuseraIsaac/helpdesk.git
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/MuseraIsaac/helpdesk.git}"
HOME_DIR="${RELEASE_HOME:-/srv/zentra-releases}"
DOMAIN="${ZENTRA_DOMAIN:-updates.zentraitsm.com}"
MIRROR_DIR="$HOME_DIR/github-mirror"
ART_ROOT="$HOME_DIR/artifacts"
MANIFEST_DIR="$HOME_DIR/manifests"

DRY_RUN=0
STATUS_ONLY=0
QUIET=0
FORCE_VERSION=""
FORCE_CHANNEL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --status)  STATUS_ONLY=1; shift ;;
    --quiet)   QUIET=1; shift ;;
    --help|-h)
      sed -n '2,30p' "$0"; exit 0 ;;
    -*)
      echo "Unknown flag: $1" >&2; exit 2 ;;
    *)
      if [ -z "$FORCE_VERSION" ]; then FORCE_VERSION="$1"
      elif [ -z "$FORCE_CHANNEL" ]; then FORCE_CHANNEL="$1"
      else echo "Too many positional args" >&2; exit 2
      fi
      shift ;;
  esac
done

# ── Layout ───────────────────────────────────────────────────────────────────
# We must be the zentra-release user (or root, who can write everywhere).
if [ "$(id -u)" -ne 0 ] && [ "$(id -un)" != "zentra-release" ]; then
  echo "Run as root or zentra-release (you are $(id -un))" >&2
  exit 3
fi

# Run all subsequent file-creating ops as zentra-release so ownership stays right.
asuser() {
  if [ "$(id -un)" = "zentra-release" ]; then
    "$@"
  else
    sudo -u zentra-release -H "$@"
  fi
}

# ── Output helpers ───────────────────────────────────────────────────────────
RULE="────────────────────────────────────────────────────────────────────"

hdr() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '\n%s\n' "$RULE"
  printf '  %s\n' "$1"
  printf '%s\n' "$RULE"
}

section() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '\n──── %s %s\n' "$1" "${RULE:0:$(( 64 - ${#1} ))}"
}

kv() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '  %-14s  %s\n' "$1" "$2"
}

note() {
  [ "$QUIET" -eq 1 ] && return 0
  printf '  %s\n' "$1"
}

human_size() {
  # Prints a human-readable size for the file. Empty if file missing.
  [ -f "$1" ] || { echo "—"; return; }
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec-i --suffix=B --format='%.1f' "$(stat -c %s "$1")"
  else
    du -h "$1" | awk '{print $1}'
  fi
}

# ── Header ───────────────────────────────────────────────────────────────────
hdr "Zentra Helpdesk release sync"
kv  "GitHub repo"  "$REPO_URL"
kv  "Mirror clone" "$MIRROR_DIR"
kv  "Public URL"   "https://$DOMAIN"
kv  "Release home" "$HOME_DIR"

# ── 1. Mirror update ─────────────────────────────────────────────────────────
if [ "$STATUS_ONLY" -eq 0 ]; then
  if [ ! -d "$MIRROR_DIR/.git" ]; then
    note ""
    note "[sync] First-time clone of $REPO_URL"
    asuser git clone --quiet "$REPO_URL" "$MIRROR_DIR"
  else
    note ""
    note "[sync] Fetching from GitHub…"
    CURRENT_URL=$(asuser git -C "$MIRROR_DIR" remote get-url origin 2>/dev/null || echo "")
    if [ "$CURRENT_URL" != "$REPO_URL" ]; then
      note "[sync] Remote changed: $CURRENT_URL → $REPO_URL"
      asuser git -C "$MIRROR_DIR" remote set-url origin "$REPO_URL"
    fi
    # `--force` lets re-tagged refs update cleanly without aborting the run.
    asuser git -C "$MIRROR_DIR" fetch --tags --force --prune --prune-tags origin
  fi
fi

# ── 2. What's currently published ───────────────────────────────────────────
section "Currently published"

PUBLISHED_VERSIONS=()
if [ -d "$ART_ROOT" ]; then
  for d in $(ls -1 "$ART_ROOT" 2>/dev/null | sort -V); do
    [ -f "$ART_ROOT/$d/release.json" ] || continue
    PUBLISHED_VERSIONS+=("$d")
  done
fi

if [ ${#PUBLISHED_VERSIONS[@]} -eq 0 ]; then
  note "(none yet — no releases have been built on this server)"
else
  for v in "${PUBLISHED_VERSIONS[@]}"; do
    ch=$(jq -r '.channel // "stable"' "$ART_ROOT/$v/release.json" 2>/dev/null || echo "?")
    sha=$(jq -r '.sha256' "$ART_ROOT/$v/artifact.json" 2>/dev/null || echo "?")
    size=$(human_size "$ART_ROOT/$v/source.tar.gz")
    note ""
    note "$v   ($ch)"
    kv  "  artifact"   "$ART_ROOT/$v/source.tar.gz  ($size)"
    kv  "  manifest"   "$MANIFEST_DIR/$ch.json"
    kv  "  public URL" "https://$DOMAIN/releases/$v/source.tar.gz"
    kv  "  sha256"     "${sha:0:16}…"
  done
fi

# ── 3. Tags on GitHub ────────────────────────────────────────────────────────
mapfile -t ALL_TAGS < <(asuser git -C "$MIRROR_DIR" tag -l 'v*' --sort=version:refname 2>/dev/null || true)

if [ "$STATUS_ONLY" -eq 1 ]; then
  section "Tags on GitHub"
  if [ ${#ALL_TAGS[@]} -eq 0 ]; then
    note "(none — tag your releases like 'v1.0.0' on GitHub)"
  else
    for t in "${ALL_TAGS[@]}"; do
      v="${t#v}"
      if [ -d "$ART_ROOT/$v" ]; then note "$t   ✓ published"
      else                            note "$t   ⏳ pending"
      fi
    done
  fi
  exit 0
fi

if [ ${#ALL_TAGS[@]} -eq 0 ]; then
  section "Tags on GitHub"
  note "(none — tag your releases like 'v1.0.0' on GitHub and re-run.)"
  exit 0
fi

# ── 4. Pick which tags to process ────────────────────────────────────────────
TARGETS=()
if [ -n "$FORCE_VERSION" ]; then
  WANT="v${FORCE_VERSION#v}"
  found=0
  for t in "${ALL_TAGS[@]}"; do [ "$t" = "$WANT" ] && { TARGETS+=("$t"); found=1; break; }; done
  if [ "$found" -eq 0 ]; then
    section "Error"
    note "Tag $WANT not found in $REPO_URL"
    note "Available tags: ${ALL_TAGS[*]}"
    exit 4
  fi
else
  for t in "${ALL_TAGS[@]}"; do
    VER="${t#v}"
    [ -d "$ART_ROOT/$VER" ] && continue
    TARGETS+=("$t")
  done
fi

if [ ${#TARGETS[@]} -eq 0 ]; then
  if [ "$QUIET" -eq 1 ]; then
    exit 0   # cron-friendly: silent when nothing changed
  fi
  section "New releases to publish"
  note "(none — all ${#ALL_TAGS[@]} tag(s) on GitHub are already published.)"
  note ""
  note "Re-run with a version arg to force-rebuild a specific release:"
  note "  $0 1.0.1"
  exit 0
fi

section "New releases to publish (${#TARGETS[@]})"
for t in "${TARGETS[@]}"; do
  sha_short=$(asuser git -C "$MIRROR_DIR" rev-parse --short "$t" 2>/dev/null || echo "?")
  note "$t  (commit $sha_short)"
done

[ "$DRY_RUN" -eq 1 ] && { note ""; note "[sync] --dry-run, exiting without writing anything."; exit 0; }

# ── 5. Publish each target ───────────────────────────────────────────────────
PUBLISHED=()
SKIPPED=()
FAILED=()

for TAG in "${TARGETS[@]}"; do
  VERSION="${TAG#v}"
  COMMIT=$(asuser git -C "$MIRROR_DIR" rev-parse --short "$TAG" 2>/dev/null || echo "?")
  section "Publishing $TAG"
  kv "source"  "git tag $TAG  (commit $COMMIT)"

  WORKTREE=$(asuser mktemp -d -t zentra-publish-XXXXXX)
  trap 'rm -rf "$WORKTREE"' RETURN

  if ! asuser git --git-dir="$MIRROR_DIR/.git" --work-tree="$WORKTREE" checkout -f "$TAG" -- .; then
    note "[fail] git checkout $TAG into $WORKTREE failed"
    FAILED+=("$VERSION")
    rm -rf "$WORKTREE"; continue
  fi

  RELEASE_JSON="$WORKTREE/release.json"
  if [ ! -f "$RELEASE_JSON" ]; then
    note "[skip] release.json missing in $TAG"
    SKIPPED+=("$VERSION (no release.json)")
    rm -rf "$WORKTREE"; continue
  fi

  DECLARED=$(jq -r .version "$RELEASE_JSON" 2>/dev/null || echo "")
  if [ "$DECLARED" != "$VERSION" ]; then
    note "[skip] release.json declares '$DECLARED' but tag says '$VERSION' — refusing"
    note "       Fix: bump release.json to $VERSION, commit, and re-tag at the new commit."
    SKIPPED+=("$VERSION (version mismatch: declared $DECLARED)")
    rm -rf "$WORKTREE"; continue
  fi

  CHANNEL="${FORCE_CHANNEL:-$(jq -r '.channel // "stable"' "$RELEASE_JSON")}"
  MANIFEST="$MANIFEST_DIR/$CHANNEL.json"
  # Initialize OR repair the channel manifest if it isn't a valid JSON object.
  if [ ! -f "$MANIFEST" ] || ! jq -e 'type == "object"' "$MANIFEST" >/dev/null 2>&1; then
    note "[init] (re)creating channel manifest for '$CHANNEL'"
    asuser sh -c "jq -n --arg ch '$CHANNEL' '{ channel: \$ch, releases: [] }' > '$MANIFEST'"
  fi

  ART_DIR="$ART_ROOT/$VERSION"
  asuser mkdir -p "$ART_DIR"
  TARBALL="$ART_DIR/source.tar.gz"

  asuser tar -C "$WORKTREE" \
    --exclude="./.git" --exclude="./node_modules" --exclude="./.next" \
    --exclude="./dist" --exclude="./client/dist" --exclude="./server/dist" \
    -czf "$TARBALL" .

  SHA=$(sha256sum "$TARBALL" | awk '{print $1}')
  ARTIFACT_URL="https://$DOMAIN/releases/$VERSION/source.tar.gz"

  asuser cp "$RELEASE_JSON" "$ART_DIR/release.json"
  asuser sh -c "jq -n --arg url '$ARTIFACT_URL' --arg sha '$SHA' '{ url: \$url, sha256: \$sha }' > '$ART_DIR/artifact.json'"

  # Prepend into channel manifest, deduping any existing row for this version.
  TMP=$(asuser mktemp -t zentra-manifest-XXXXXX)
  asuser sh -c "
    jq --slurpfile rel '$ART_DIR/release.json' --arg ch '$CHANNEL' '
      .channel = \$ch
      | .releases = ([(\$rel[0])] + (.releases // [] | map(select(.version != \$rel[0].version))))
    ' '$MANIFEST' > '$TMP' && mv '$TMP' '$MANIFEST'
  "

  kv "channel"      "$CHANNEL  (from release.json)"
  kv "artifact dir" "$ART_DIR/"
  kv "tarball"      "$(basename "$TARBALL")  ($(human_size "$TARBALL"))"
  kv "sha256"       "$SHA"
  kv "manifest"     "$MANIFEST"
  kv "public URL"   "$ARTIFACT_URL"
  note ""
  note "  ✓ published $VERSION → $CHANNEL"

  PUBLISHED+=("$VERSION → $CHANNEL")
  rm -rf "$WORKTREE"
done

# ── 6. Summary ───────────────────────────────────────────────────────────────
section "Summary"
kv "Published this run" "${#PUBLISHED[@]}"
[ ${#PUBLISHED[@]} -gt 0 ] && for v in "${PUBLISHED[@]}"; do note "  + $v"; done

# Full release count after this run.
TOTAL=0
LATEST=""
if [ -d "$ART_ROOT" ]; then
  TOTAL=$(ls -1 "$ART_ROOT" 2>/dev/null | wc -l)
  LATEST=$(ls -1 "$ART_ROOT" 2>/dev/null | sort -V | tail -1)
fi
DISK=$(du -sh "$ART_ROOT" 2>/dev/null | awk '{print $1}' || echo "?")

kv "Total releases"   "$TOTAL  (newest: ${LATEST:-none})"
kv "Disk used"        "$DISK  $ART_ROOT/"
kv "Daemon status"    "sudo systemctl status zentra-release"
kv "Daemon log"       "sudo journalctl -u zentra-release -f"

if [ ${#PUBLISHED[@]} -gt 0 ]; then
  note ""
  note "Customers will see the new release on their next 'Check now' click."
fi

[ ${#SKIPPED[@]} -gt 0 ] && { section "Skipped (${#SKIPPED[@]})"; for v in "${SKIPPED[@]}"; do note "  ~ $v"; done; }
[ ${#FAILED[@]}  -gt 0 ] && { section "Failed (${#FAILED[@]})";   for v in "${FAILED[@]}";  do note "  ! $v"; done; exit 5; }

exit 0
