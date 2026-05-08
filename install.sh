#!/usr/bin/env bash
#
# install.sh — Zentra ITSM single-node installer for CentOS / RHEL 10
# ────────────────────────────────────────────────────────────────────────────
# What it does, in order:
#   1.  Installs OS packages (git, openssl, firewalld, postgresql-server, ...).
#   2.  Installs Bun system-wide at /usr/local/bun.
#   3.  Installs and tunes a local PostgreSQL (created DB + role).
#   4.  Clones (or pulls) the Zentra ITSM source from GitHub.
#   5.  Generates server/.env with strong secrets baked in.
#   6.  Runs `bun install`, prisma generate / migrate / seed, and `vite build`.
#   7.  Provisions N systemd replicas of the API on adjacent ports.
#   8.  Installs Caddy and writes a Caddyfile that:
#        - terminates TLS via automatic Let's Encrypt for your domain
#        - speaks HTTP/2
#        - serves the React SPA from client/dist
#        - reverse-proxies /api/* across the API replicas (least-conn LB)
#   9.  Opens firewalld for SSH / HTTP / HTTPS.
#   10. Health-checks every replica.
#
# Re-running the script is safe: existing users, repos, services, and DBs are
# detected and updated in place rather than recreated.
#
# Usage
# ─────
#   sudo bash install.sh                       # interactive, asks for inputs
#
#   # Non-interactive (every input pre-supplied):
#   sudo NONINTERACTIVE=1 \
#        DOMAIN=helpdesk.example.com \
#        LE_EMAIL=ops@example.com \
#        REPLICAS=2 \
#        ADMIN_EMAIL=admin@example.com \
#        ADMIN_PASSWORD='Strong!Pass1' \
#        bash install.sh
#
# After install
# ─────────────
#   - Logs (API):    journalctl -u 'zentra-api@*' -f
#   - Logs (Caddy):  journalctl -u caddy -f
#   - Restart API:   sudo systemctl restart 'zentra-api@*'
#   - Update code:   sudo bash /opt/zentra/app/scripts/update.sh
#
set -Eeo pipefail
# (Intentionally not using -u: a few prompts use ${!var-} indirect lookups
#  where the target may be undefined. -u turns that into a hard error.)

# ════════════════════════════════════════════════════════════════════════════
# 1. CONFIGURATION
# ────────────────────────────────────────────────────────────────────────────
# Edit these defaults OR set them as env vars OR answer the prompts.
# Anything left blank prompts the user (unless NONINTERACTIVE=1).
# ════════════════════════════════════════════════════════════════════════════

# === REQUIRED ─────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-}"                            # e.g. helpdesk.example.com
LE_EMAIL="${LE_EMAIL:-}"                        # Let's Encrypt notice email

# === SCALING ──────────────────────────────────────────────────────────────
REPLICAS="${REPLICAS:-2}"                       # API replica count (1..16)
APP_BASE_PORT="${APP_BASE_PORT:-3000}"          # first replica's port

# === REPO ─────────────────────────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/MuseraIsaac/helpdesk.git}"
# What to check out:
#   "latest"   (default) → highest semver release tag of the form vMAJOR.MINOR.PATCH
#   "main"               → bleeding-edge HEAD (only use for development)
#   "v1.2.3"             → a specific tag
#   "release-foo"        → any branch name
# `latest` is resolved by phase_repo via `git ls-remote --tags`.
BRANCH="${BRANCH:-latest}"

# === SEED ADMIN (used on first run; harmless after) ───────────────────────
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
# ┌────────────────────────────────────────────────────────────────────────┐
# │  Default admin password — EDIT THIS LINE to change it for new installs │
# │  Must be ≥ 8 chars (Better Auth requirement). Mix upper/lower/digit/   │
# │  symbol if you also enable a complexity policy later in Settings.      │
# │  Override at install time:  ADMIN_PASSWORD='YourPassw0rd!' bash install.sh
# └────────────────────────────────────────────────────────────────────────┘
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Zentr@2026}"

# === OPTIONAL APP SECRETS ─────────────────────────────────────────────────
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
SENDGRID_API_KEY="${SENDGRID_API_KEY:-}"
SENDGRID_FROM_EMAIL="${SENDGRID_FROM_EMAIL:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"

# === LOCAL PATHS / DB (rarely need changing) ──────────────────────────────
APP_USER="${APP_USER:-zentra}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_HOME="${APP_HOME:-/opt/zentra}"
APP_DIR="${APP_DIR:-$APP_HOME/app}"
SERVICE_PREFIX="${SERVICE_PREFIX:-zentra-api}"

DB_NAME="${DB_NAME:-zentra}"
DB_USER="${DB_USER:-zentra}"
DB_PASSWORD="${DB_PASSWORD:-}"                  # blank → auto-generate
DB_HOST="127.0.0.1"
DB_PORT=5432

# Auto-generated at runtime; do not edit
BETTER_AUTH_SECRET=""
DOWNLOAD_TOKEN_SECRET=""

# ════════════════════════════════════════════════════════════════════════════
# 2. HELPERS
# ════════════════════════════════════════════════════════════════════════════
TS()   { date '+%H:%M:%S'; }
log()  { printf '\033[1;36m[%s] %s\033[0m\n' "$(TS)" "$*"; }
ok()   { printf '\033[1;32m[%s] %s\033[0m\n' "$(TS)" "$*"; }
warn() { printf '\033[1;33m[%s] %s\033[0m\n' "$(TS)" "$*" >&2; }
die()  { printf '\033[1;31m[%s] FATAL: %s\033[0m\n' "$(TS)" "$*" >&2; exit 1; }

trap 'die "line $LINENO: $BASH_COMMAND"' ERR

# Read the current value of a variable by name, returning empty if unset.
# Uses `eval` rather than ${!var} indirect expansion because bash 5.2 on RHEL
# treats indirect expansion as a hard error inside `local` declarations even
# when -u is not set.
varget() {
  local _name="$1" _val=""
  eval "_val=\${$_name-}"
  printf '%s' "$_val"
}

# Prompt with current value as default. Skipped entirely when NONINTERACTIVE=1.
# Precedence: existing env/default value > explicit $3 fallback > prompt input.
prompt() {
  local var="$1" question="$2" fallback="${3-}" answer
  local current default
  current="$(varget "$var")"
  default="${current:-$fallback}"
  if [[ "${NONINTERACTIVE-}" == "1" ]]; then
    printf -v "$var" '%s' "$default"
    return 0
  fi
  if [[ -n "$default" ]]; then
    read -rp "  $question [$default]: " answer
    answer="${answer:-$default}"
  else
    read -rp "  $question: " answer
  fi
  printf -v "$var" '%s' "$answer"
}

prompt_secret() {
  local var="$1" question="$2" answer current
  if [[ "${NONINTERACTIVE-}" == "1" ]]; then return 0; fi
  current="$(varget "$var")"
  if [[ -n "$current" ]]; then return 0; fi
  read -rsp "  $question (Enter to auto-generate): " answer; echo
  printf -v "$var" '%s' "$answer"
}

gen_secret() {
  openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-32
}

require_root() {
  [[ ${EUID} -eq 0 ]] || die "Run as root: sudo bash $0"
}

require_dnf() {
  command -v dnf >/dev/null 2>&1 \
    || die "dnf not found — this script targets RHEL/CentOS Stream 10. Detected: $(uname -a)"
}

run_as_app() {
  # Run a command as the app user with /usr/local/bin (Bun) on PATH.
  runuser -u "$APP_USER" -- bash -lc "export PATH=/usr/local/bin:\$PATH; $*"
}

# Returns the server's primary IPv4 — used as the default DOMAIN when the
# operator doesn't have a real domain pointing here yet.
detect_server_ip() {
  local ip
  ip=$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) {print $i; exit}}')
  [[ -z "$ip" ]] && ip=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)
  echo "${ip:-127.0.0.1}"
}

# Returns 0 if the argument looks like an IPv4 address, 1 otherwise.
is_ipv4() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Returns 0 if $1 (a domain) resolves directly to $2 (this server's IP); 1
# otherwise. "Otherwise" includes: domain doesn't resolve, domain resolves
# to something else (a CDN like Cloudflare in front, a different host, etc.).
# Used to detect CDN-fronted deployments so we don't try to issue an origin
# Let's Encrypt cert that the CDN's edge would terminate.
domain_resolves_here() {
  local domain="$1" expected="$2" resolved
  resolved=$(getent hosts "$domain" 2>/dev/null | awk '{print $1; exit}')
  [[ -n "$resolved" && "$resolved" == "$expected" ]]
}

# Lists every release tag of the form vMAJOR.MINOR.PATCH on the configured
# remote, sorted newest-first. Empty output if none / network down.
#
# Tail `|| true` is mandatory: when grep matches nothing (no v* tags yet, or
# git missing) the pipe exits non-zero, and our `set -o pipefail` plus ERR
# trap would print a spurious "FATAL: line N: sort -Vr". The fallback in
# phase_pick_release already handles empty output gracefully.
list_remote_releases() {
  { git ls-remote --tags --refs "$REPO_URL" 'v*' 2>/dev/null \
      | awk '{print $2}' | sed 's|refs/tags/||' \
      | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
      | sort -Vr; } || true
}

# Interactive release picker. Shows every v* tag plus "main" and lets the
# operator pick by number. Honours $BRANCH if it's already a concrete value
# (latest is auto-resolved later in phase_repo).
phase_pick_release() {
  # Non-interactive: leave $BRANCH alone and let phase_repo resolve "latest".
  [[ "${NONINTERACTIVE-}" == "1" ]] && return 0
  # Already a concrete tag/branch? Show what we'll use, but still allow override.
  if [[ -n "$BRANCH" && "$BRANCH" != "latest" ]]; then
    log "BRANCH is set to '$BRANCH' — keeping it (set BRANCH= to enable picker)"
    return 0
  fi

  # The picker needs git, but git is normally pulled in later by phase_packages.
  # On a fresh CentOS Stream box that means the picker would always see an
  # empty tag list and silently fall back to main. Install just git inline so
  # the operator actually gets to choose a release.
  if ! command -v git >/dev/null 2>&1; then
    log "Installing git (needed to query release tags)"
    dnf -y install git >/dev/null 2>&1 || warn "  dnf install git failed — picker will fall back to main"
  fi

  log "Loading available releases from $REPO_URL"
  local tags
  mapfile -t tags < <(list_remote_releases)

  if [[ ${#tags[@]} -eq 0 ]]; then
    warn "No vX.Y.Z release tags found on $REPO_URL — defaulting to BRANCH=main."
    BRANCH="main"
    return 0
  fi

  echo
  echo "  ┌───────────────────────────────────────────────────────────────"
  echo "  │  Available Zentra releases"
  echo "  ├───────────────────────────────────────────────────────────────"
  printf "  │   %2d  %-22s %s\n" 1 "${tags[0]}" "(latest stable — recommended)"
  for i in "${!tags[@]}"; do
    [[ $i -eq 0 ]] && continue
    printf "  │   %2d  %s\n" $((i+1)) "${tags[$i]}"
  done
  printf "  │   %2d  %-22s %s\n" 0 "main" "(bleeding-edge HEAD — for development)"
  echo "  └───────────────────────────────────────────────────────────────"
  echo

  local choice
  read -rp "  Pick a release [1]: " choice
  choice="${choice:-1}"

  case "$choice" in
    0|m|main)              BRANCH="main" ;;
    [1-9]|[1-9][0-9])
      if (( choice >= 1 && choice <= ${#tags[@]} )); then
        BRANCH="${tags[$((choice-1))]}"
      else
        die "Choice out of range: $choice (have ${#tags[@]} tags + main)"
      fi
      ;;
    v[0-9]*\.[0-9]*\.[0-9]*) BRANCH="$choice" ;;
    *) die "Invalid choice: '$choice' (number or v1.2.3 or 'main')" ;;
  esac
  ok "  → installing $BRANCH"
}

# ════════════════════════════════════════════════════════════════════════════
# 3. PHASES
# ════════════════════════════════════════════════════════════════════════════

# ── 3.1 Gather inputs ──────────────────────────────────────────────────────
phase_inputs() {
  log "Collecting installation settings"

  # Server IP autodetected so DOMAIN can default to it for IP-only installs.
  SERVER_IP="$(detect_server_ip)"

  cat <<EOF

  Hostname for this install. You can use:
    • a real domain (helpdesk.example.com)  → optional TLS via Let's Encrypt
    • the server IP                         → plain HTTP, no domain needed
  Both work; you can also enter a domain now and add TLS later.

EOF
  prompt DOMAIN "Domain or server IP" "$SERVER_IP"
  [[ -n "$DOMAIN" ]] || die "DOMAIN is required"

  if is_ipv4 "$DOMAIN"; then
    IS_IP=1
    USE_TLS=0
    LE_EMAIL="${LE_EMAIL:-}"
    log "  IP install detected — Caddy will serve plain HTTP only."
  else
    IS_IP=0
    # Detect whether this domain points DIRECTLY at this server. If it
    # doesn't, a CDN (Cloudflare, Fastly, etc.) is almost certainly in
    # front. Origin Let's Encrypt then becomes a footgun:
    #   • the ACME challenge often hits the CDN edge instead of origin
    #   • even when the cert is issued, the CDN handles browser TLS, so
    #     the origin cert is never seen
    #   • Better Auth keys "Secure" cookie flag off the configured URL,
    #     so a TLS=y/origin-HTTP mismatch silently breaks login
    if domain_resolves_here "$DOMAIN" "$SERVER_IP"; then
      PROXY_DETECTED=0
      local default_tls="y"
    else
      PROXY_DETECTED=1
      local default_tls="n"
      local resolved
      resolved=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')
      warn "  $DOMAIN resolves to ${resolved:-(unresolved)} — not this server ($SERVER_IP)."
      warn "  This usually means a CDN (Cloudflare, etc.) is fronting the domain."
      warn "  Origin TLS via Let's Encrypt is fragile in that case; the safe default"
      warn "  is plain HTTP at the origin (let the CDN terminate browser-facing TLS)."
    fi
    prompt USE_TLS "Issue a Let's Encrypt cert for $DOMAIN at the origin?" "$default_tls"
    case "${USE_TLS:-n}" in
      y|Y|yes|YES|1|true) USE_TLS=1; prompt LE_EMAIL "Let's Encrypt notification email" "ops@$DOMAIN" ;;
      *)                  USE_TLS=0; LE_EMAIL="${LE_EMAIL:-}" ;;
    esac

    # ── Guardrail: don't let TLS=y stick when a CDN is in front ──────────
    # This is the configuration that bit us before:
    #   USE_TLS=1 + DOMAIN behind CDN  →  BETTER_AUTH_URL=https://DOMAIN
    #   →  Better Auth emits Secure cookies
    #   →  user accesses via http (origin or via CDN flexible mode)
    #   →  browser silently drops the cookie  →  "Invalid email or password"
    # We refuse the trap here. Operator who genuinely wants origin TLS even
    # with CDN proxy on (e.g. Cloudflare Full mode) sets TLS_FORCE=1.
    if [[ "$USE_TLS" == "1" && "$PROXY_DETECTED" == "1" && "${TLS_FORCE-}" != "1" ]]; then
      warn ""
      warn "  Blocking origin TLS: $DOMAIN is behind a CDN/proxy."
      warn "  Pick one of these paths:"
      warn "    1. Stay with origin HTTP (recommended) — let the CDN terminate"
      warn "       browser-facing TLS. Cloudflare: SSL/TLS → 'Flexible'."
      warn "    2. Disable the CDN proxy (grey cloud in Cloudflare DNS), rerun."
      warn "    3. Set TLS_FORCE=1 to override this check (advanced)."
      warn ""
      warn "  Continuing with origin HTTP — your domain still works via the CDN."
      USE_TLS=0
      LE_EMAIL=""
    fi
  fi

  prompt REPLICAS       "Number of API replicas" "$REPLICAS"
  prompt ADMIN_EMAIL    "Initial admin email"  "$ADMIN_EMAIL"
  prompt_secret ADMIN_PASSWORD "Initial admin password"
  prompt_secret DB_PASSWORD    "PostgreSQL password for '$DB_USER'"

  [[ "$REPLICAS" =~ ^[0-9]+$ ]] && (( REPLICAS >= 1 && REPLICAS <= 16 )) \
    || die "REPLICAS must be a number between 1 and 16 (got: $REPLICAS)"

  # Release picker — runs AFTER the basic prompts so the network call to
  # GitHub doesn't delay the simple-input phase. Only fires interactively.
  phase_pick_release

  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(gen_secret)}"
  DB_PASSWORD="${DB_PASSWORD:-$(gen_secret)}"
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  DOWNLOAD_TOKEN_SECRET="$(openssl rand -hex 32)"

  # Compute the URLs the install will be reachable on, for the summary +
  # for the .env (BETTER_AUTH_URL / TRUSTED_ORIGINS).
  local scheme="http"
  [[ "$USE_TLS" == "1" ]] && scheme="https"
  local primary_url ip_url
  primary_url="$scheme://$DOMAIN"
  ip_url="http://$SERVER_IP"
  [[ "$IS_IP" == "1" ]] && ip_url=""   # already the same as primary

  cat <<EOF

  ┌──────────────────────────────────────────────────────────────────────
  │ Primary URL    : $primary_url
EOF
  [[ -n "$ip_url" ]] && echo "  │ Direct IP URL  : $ip_url"
  cat <<EOF
  │ TLS            : $([[ "$USE_TLS" == "1" ]] && echo "Let's Encrypt ($LE_EMAIL)" || echo "off (plain HTTP)")
  │ API replicas   : $REPLICAS  (ports $APP_BASE_PORT..$((APP_BASE_PORT + REPLICAS - 1)))
  │ Repo / ref     : $REPO_URL  ($BRANCH)
  │ App user       : $APP_USER     (home: $APP_HOME, code: $APP_DIR)
  │ PostgreSQL     : 127.0.0.1:5432  (db=$DB_NAME, user=$DB_USER)
  │ Admin email    : $ADMIN_EMAIL
  └──────────────────────────────────────────────────────────────────────

EOF
  if [[ "${NONINTERACTIVE-}" != "1" ]]; then
    read -rp "Proceed with installation? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || die "Aborted by user"
  fi
}

# ── 3.2 Base OS packages ───────────────────────────────────────────────────
phase_packages() {
  log "Installing OS packages"
  dnf -y install epel-release || true
  dnf -y install \
      git curl tar gzip unzip jq openssl ca-certificates \
      policycoreutils-python-utils firewalld \
      postgresql-server postgresql-contrib \
      glibc-langpack-en
}

# ── 3.3 App user ───────────────────────────────────────────────────────────
phase_user() {
  log "Ensuring system user '$APP_USER'"
  getent group "$APP_GROUP" >/dev/null || groupadd --system "$APP_GROUP"
  id "$APP_USER" >/dev/null 2>&1 || \
    useradd --system --gid "$APP_GROUP" --home-dir "$APP_HOME" \
            --create-home --shell /bin/bash "$APP_USER"
  install -d -m 0755 -o "$APP_USER" -g "$APP_GROUP" "$APP_HOME" "$APP_DIR"
  # Update-orchestrator working dirs — owned by the app user so the running
  # process can write to them. The systemd unit's ReadWritePaths must include
  # them too (we add that below).
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" \
    "$APP_HOME/staging" "$APP_HOME/artifacts" "$APP_HOME/backups/updates"
}

# ── 3.4 Bun runtime ────────────────────────────────────────────────────────
phase_bun() {
  if [[ ! -x /usr/local/bun/bin/bun ]]; then
    log "Installing Bun system-wide at /usr/local/bun"
    install -d -m 0755 /usr/local/bun
    curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh
    BUN_INSTALL=/usr/local/bun bash /tmp/bun-install.sh
    rm -f /tmp/bun-install.sh
  fi
  # Always ensure both symlinks exist (older installs may have only `bun`).
  ln -sf /usr/local/bun/bin/bun  /usr/local/bin/bun
  ln -sf /usr/local/bun/bin/bunx /usr/local/bin/bunx
  ok "Bun ready: $(/usr/local/bin/bun --version)"
}

# ── 3.5 PostgreSQL ─────────────────────────────────────────────────────────
phase_postgres() {
  log "Initialising PostgreSQL"
  if [[ ! -s /var/lib/pgsql/data/PG_VERSION ]]; then
    postgresql-setup --initdb
  fi
  systemctl enable --now postgresql.service

  log "Tuning PostgreSQL for this host"
  local mem_kb shared_mb cache_mb conf=/var/lib/pgsql/data/postgresql.conf
  mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
  shared_mb=$(( mem_kb / 1024 / 4 ))
  cache_mb=$(( mem_kb / 1024 * 3 / 4 ))
  if ! grep -q "# zentra-tuning" "$conf"; then
    cat >> "$conf" <<EOF

# zentra-tuning  (added by install.sh — remove this whole block to revert)
listen_addresses = 'localhost'
max_connections = 200
shared_buffers = ${shared_mb}MB
effective_cache_size = ${cache_mb}MB
work_mem = 16MB
maintenance_work_mem = 128MB
wal_compression = on
EOF
  fi

  log "Ensuring DB role + database"
  if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    runuser -u postgres -- psql -c "ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASSWORD';"
  else
    runuser -u postgres -- psql -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASSWORD';"
  fi

  if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    runuser -u postgres -- psql -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
  fi

  runuser -u postgres -- psql -d "$DB_NAME" <<SQL
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
ALTER SCHEMA public OWNER TO "$DB_USER";
GRANT CREATE, USAGE ON SCHEMA public TO "$DB_USER";
SQL

  # pg_hba: allow local TCP via scram-sha-256 (Prisma talks to 127.0.0.1)
  local hba=/var/lib/pgsql/data/pg_hba.conf
  local v4="host    $DB_NAME    $DB_USER    127.0.0.1/32    scram-sha-256"
  local v6="host    $DB_NAME    $DB_USER    ::1/128         scram-sha-256"
  grep -qF "$v4" "$hba" || sed -i "1i$v4" "$hba"
  grep -qF "$v6" "$hba" || sed -i "1i$v6" "$hba"

  systemctl restart postgresql.service
  log "Verifying DB credentials"
  PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -c '\conninfo' >/dev/null \
    || die "Could not connect to PostgreSQL with the configured credentials"
  ok "PostgreSQL ready"
}

# ── 3.6 Source code ────────────────────────────────────────────────────────
# Returns the highest semver-style release tag (vMAJOR.MINOR.PATCH, no
# pre-release suffix) on the remote. Empty output if nothing matches.
resolve_latest_tag() {
  git ls-remote --tags --refs "$REPO_URL" 'v*' 2>/dev/null \
    | awk '{print $2}' \
    | sed 's|refs/tags/||' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V \
    | tail -1
}

# Decides whether $1 is a tag (resolves locally to a tag ref) or a branch.
# Used after the repo is cloned so we can pick the right reset target.
is_local_tag() {
  runuser -u "$APP_USER" -- git -C "$APP_DIR" \
    show-ref --tags --quiet --verify "refs/tags/$1"
}

phase_repo() {
  # Resolve BRANCH=latest to a concrete tag at the start so every downstream
  # step (clone, checkout, update.sh template) sees the resolved value.
  if [[ "$BRANCH" == "latest" ]]; then
    log "Resolving BRANCH=latest from $REPO_URL"
    local resolved
    resolved="$(resolve_latest_tag)"
    [[ -n "$resolved" ]] || die \
      "No vX.Y.Z tags found in $REPO_URL — set BRANCH=main to install HEAD instead."
    BRANCH="$resolved"
    log "  → $BRANCH"
  fi

  log "Fetching source from $REPO_URL ($BRANCH)"
  if [[ -d "$APP_DIR/.git" ]]; then
    runuser -u "$APP_USER" -- git -C "$APP_DIR" fetch --all --tags --force --prune
    runuser -u "$APP_USER" -- git -C "$APP_DIR" checkout "$BRANCH"
    # Tags are immutable refs — `origin/<tag>` doesn't exist. Reset to the
    # tag itself; for branches, reset to origin/<branch> to discard local
    # commits and follow upstream.
    if is_local_tag "$BRANCH"; then
      runuser -u "$APP_USER" -- git -C "$APP_DIR" reset --hard "$BRANCH"
    else
      runuser -u "$APP_USER" -- git -C "$APP_DIR" reset --hard "origin/$BRANCH"
    fi
  else
    rm -rf "$APP_DIR"
    runuser -u "$APP_USER" -- git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
  chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
}

# ── 3.7 Generate .env ──────────────────────────────────────────────────────
phase_env() {
  log "Writing $APP_DIR/server/.env"
  local env_file="$APP_DIR/server/.env"
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$APP_DIR/server"

  # ── Canonical URL + scheme decision ───────────────────────────────────
  #
  # The scheme of $app_url is critical: Better Auth derives the cookie's
  # `Secure` flag from it. The rule that has to hold is:
  #
  #   "If a browser will EVER see this app over plain HTTP, the URL
  #    written here MUST be http://… — otherwise the Secure cookie is
  #    silently dropped and login appears to fail with 'invalid email
  #    or password'."
  #
  # USE_TLS=1 means Caddy is serving TLS at the origin AND the domain
  # resolves directly here (the CDN guardrail above prevents the broken
  # combination). In every other case (IP-only, behind CDN, etc.) some
  # browser somewhere will hit plain HTTP, so we use http://.
  local scheme="http"; [[ "$USE_TLS" == "1" ]] && scheme="https"
  local app_url="$scheme://$DOMAIN"
  local origins="$app_url"

  # Always include the IP for direct ops access — even on a TLS install
  # the operator may want to hit http://IP from the same box for debugging.
  if [[ "$IS_IP" != "1" ]]; then
    origins+=",http://$SERVER_IP"
  fi

  # CDN scenario: the public URL the customer sees is https://DOMAIN even
  # though our origin is http://DOMAIN. CORS needs to allow that origin or
  # browser fetch() calls from the SPA fail.
  if [[ "$IS_IP" != "1" && "$USE_TLS" != "1" ]]; then
    origins+=",https://$DOMAIN"
  fi
  origins+=",http://localhost,http://127.0.0.1"

  cat > "$env_file" <<EOF
# Generated by install.sh — re-running install regenerates this file.
NODE_ENV=production
APP_URL="$app_url"
TRUSTED_ORIGINS="$origins"

DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?schema=public"
DATABASE_POOL_MAX=40

BETTER_AUTH_URL="$app_url"
BETTER_AUTH_BASE_URL="$app_url"
BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET"
DOWNLOAD_TOKEN_SECRET="$DOWNLOAD_TOKEN_SECRET"

# Seed (used once on first migrate)
SEED_ADMIN_EMAIL="$ADMIN_EMAIL"
SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD"

# Optional integrations — fill in to enable
OPENAI_API_KEY="$OPENAI_API_KEY"
SENDGRID_API_KEY="$SENDGRID_API_KEY"
SENDGRID_FROM_EMAIL="$SENDGRID_FROM_EMAIL"
WEBHOOK_SECRET="$WEBHOOK_SECRET"
SENTRY_DSN="$SENTRY_DSN"
SENTRY_ENVIRONMENT="$SENTRY_ENVIRONMENT"

# Update orchestrator — surfaces precise commands in the "restart required"
# step of the in-tool update flow so the admin can copy-paste rather than
# guess paths. Also tells the orchestrator where to find this install's bun.
UPDATE_APP_DIR="$APP_DIR"
UPDATE_BUN_BIN="/usr/local/bin/bun"
UPDATE_SERVICE_PREFIX="$SERVICE_PREFIX"
UPDATE_BACKUP_DIR="$APP_HOME/backups/updates"
UPDATE_STAGING_DIR="$APP_HOME/staging"
UPDATE_ARTIFACT_DIR="$APP_HOME/artifacts"
EOF
  chown "$APP_USER:$APP_GROUP" "$env_file"
  chmod 600 "$env_file"
}

# ── 3.8 Install JS deps + build ────────────────────────────────────────────
phase_install_build() {
  log "Installing JS dependencies (this can take a few minutes)"
  run_as_app "cd '$APP_DIR' && bun install --frozen-lockfile"

  log "Generating Prisma client"
  run_as_app "cd '$APP_DIR/server' && bunx prisma generate"

  # Detect first-time install. The repo has a few migrations that reference
  # tables created via `prisma db push` (Problem, Incident, etc.) instead of
  # via a CREATE TABLE migration — so a clean `migrate deploy` blows up. On
  # a fresh DB we sync the schema with `db push`, run any custom-SQL
  # migrations by hand, then mark every migration as applied so subsequent
  # deploys (via update.sh) use the normal `migrate deploy` path.
  local is_fresh
  is_fresh=$(PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations')" 2>/dev/null || echo t)

  if [[ "$is_fresh" == "t" ]]; then
    log "Fresh database detected — syncing schema via prisma db push"
    run_as_app "cd '$APP_DIR/server' && bunx prisma db push --accept-data-loss"

    log "Replaying custom-SQL migrations (functions, triggers, …)"
    # Any migration whose SQL contains a CREATE FUNCTION/TRIGGER/PROCEDURE is
    # not reproducible from schema.prisma — run those manually here.
    for sql in "$APP_DIR"/server/prisma/migrations/*/migration.sql; do
      if grep -qiE "CREATE (OR REPLACE )?(FUNCTION|TRIGGER|PROCEDURE)" "$sql" 2>/dev/null; then
        local name; name=$(basename "$(dirname "$sql")")
        log "  applying $name"
        PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -f "$sql" >/dev/null 2>&1 || warn "  (failed — non-fatal)"
      fi
    done

    log "Marking all migrations as applied so future deploys are clean"
    for d in "$APP_DIR"/server/prisma/migrations/*/; do
      local m; m=$(basename "$d")
      [[ "$m" == "_*" ]] && continue
      run_as_app "cd '$APP_DIR/server' && bunx prisma migrate resolve --applied '$m'" 2>/dev/null || true
    done
  else
    log "Existing database detected — applying pending migrations"
    run_as_app "cd '$APP_DIR/server' && bunx prisma migrate deploy"
  fi

  log "Seeding initial data"
  run_as_app "cd '$APP_DIR/server' && bunx prisma db seed" || warn "Seed failed — non-fatal, continuing"

  log "Building React frontend"
  run_as_app "cd '$APP_DIR/client' && bunx vite build"
  ok "Build complete"
}

# ── 3.9 systemd template + N replicas ──────────────────────────────────────
phase_systemd() {
  log "Writing systemd template /etc/systemd/system/${SERVICE_PREFIX}@.service"
  cat > "/etc/systemd/system/${SERVICE_PREFIX}@.service" <<EOF
[Unit]
Description=Zentra ITSM API replica on port %i
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
Environment=HOME=$APP_HOME
Environment=PATH=/usr/local/bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
Environment=PORT=%i
EnvironmentFile=$APP_DIR/server/.env
ExecStart=/usr/local/bin/bun run server/src/index.ts
Restart=always
RestartSec=5
LimitNOFILE=65536

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
# ReadWritePaths must include the orchestrator's working dirs so it can
# extract artifacts, run bun install, build, and write backups.
ReadWritePaths=$APP_DIR $APP_HOME/staging $APP_HOME/artifacts $APP_HOME/backups
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload

  log "Stopping any obsolete replicas"
  systemctl list-units --no-legend "${SERVICE_PREFIX}@*.service" 2>/dev/null \
    | awk '{print $1}' | while read -r unit; do
      [[ -z "$unit" ]] && continue
      systemctl stop "$unit"    || true
      systemctl disable "$unit" || true
    done

  log "Enabling $REPLICAS replica(s) on ports $APP_BASE_PORT..$((APP_BASE_PORT + REPLICAS - 1))"
  for ((i = 0; i < REPLICAS; i++)); do
    local port=$((APP_BASE_PORT + i))
    systemctl enable --now "${SERVICE_PREFIX}@${port}.service"
  done
}

# ── 3.10 Caddy ─────────────────────────────────────────────────────────────
phase_caddy() {
  if ! command -v caddy >/dev/null 2>&1; then
    log "Installing Caddy"
    if dnf -y install 'dnf-command(copr)' 2>/dev/null \
       && dnf copr -y enable @caddy/caddy 2>/dev/null \
       && dnf -y install caddy 2>/dev/null; then
      ok "Caddy installed via @caddy/caddy COPR"
    else
      warn "COPR install failed; falling back to static binary"
      curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64" -o /usr/local/bin/caddy
      chmod +x /usr/local/bin/caddy
      id caddy >/dev/null 2>&1 || \
        useradd --system --create-home --home-dir /var/lib/caddy --shell /usr/sbin/nologin caddy
      install -d -o caddy -g caddy /var/lib/caddy /var/log/caddy
      cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=65536
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
      systemctl daemon-reload
    fi
  fi

  log "Writing /etc/caddy/Caddyfile"
  install -d /etc/caddy
  local upstreams=""
  for ((i = 0; i < REPLICAS; i++)); do
    upstreams+=" 127.0.0.1:$((APP_BASE_PORT + i))"
  done

  # The same set of handle blocks is used in every mode — a small inline helper
  # avoids repeating the rules across three slightly-different vhosts.
  local app_block
  app_block="$(cat <<EOF
  encode zstd gzip

  # API → load-balanced across the Bun replicas
  handle /api/* {
    reverse_proxy$upstreams {
      lb_policy least_conn
      health_uri /api/health
      health_interval 10s
      health_timeout 3s
    }
  }

  # Everything else: serve the React SPA with content-hashed assets cached.
  handle {
    @hashed_assets path /assets/*
    header @hashed_assets Cache-Control "public, max-age=31536000, immutable"

    root * $APP_DIR/client/dist
    try_files {path} /index.html
    file_server
  }
EOF
  )"

  # Three install modes shape the Caddyfile:
  #   1. IP-only          → single :80 block, auto_https off
  #   2. Domain + TLS     → domain block with Let's Encrypt + IP fallback on :80
  #   3. Domain no TLS    → domain + IP both on :80 (e.g. behind Cloudflare proxy)
  if [[ "$IS_IP" == "1" ]]; then
    cat > /etc/caddy/Caddyfile <<EOF
# Plain-HTTP install — accessed via http://$DOMAIN
{
  auto_https off
}

:80 {
$app_block
}
EOF
  elif [[ "$USE_TLS" == "1" ]]; then
    cat > /etc/caddy/Caddyfile <<EOF
# Domain install with Let's Encrypt TLS + plain-HTTP fallback for IP access.
{
  email $LE_EMAIL
}

$DOMAIN {
$app_block
}

# Direct IP access (testing, ops) — plain HTTP only.
http://$SERVER_IP {
$app_block
}
EOF
  else
    cat > /etc/caddy/Caddyfile <<EOF
# Domain install without origin TLS — typical when a CDN (Cloudflare, etc.)
# terminates TLS in front. Browser ↔ CDN is HTTPS; CDN ↔ origin is HTTP.
# Both http://\$DOMAIN and http://\$SERVER_IP are served.
{
  auto_https off
}

http://$DOMAIN, http://$SERVER_IP, :80 {
$app_block
}
EOF
  fi

  # SELinux: let Caddy reach upstream ports + read the static dir.
  if command -v setsebool >/dev/null 2>&1; then
    setsebool -P httpd_can_network_connect 1 2>/dev/null || true
  fi
  if command -v semanage >/dev/null 2>&1; then
    semanage fcontext -a -t httpd_sys_content_t "$APP_DIR/client/dist(/.*)?" 2>/dev/null \
      || semanage fcontext -m -t httpd_sys_content_t "$APP_DIR/client/dist(/.*)?" 2>/dev/null \
      || true
    restorecon -R "$APP_DIR/client/dist" 2>/dev/null || true
  fi

  systemctl enable caddy
  systemctl restart caddy
}

# ── 3.11 firewalld ─────────────────────────────────────────────────────────
phase_firewall() {
  log "Configuring firewalld (HTTP/HTTPS/SSH)"
  systemctl enable --now firewalld
  for svc in http https ssh; do
    firewall-cmd --permanent --add-service="$svc" >/dev/null 2>&1 || true
  done
  firewall-cmd --reload >/dev/null 2>&1 || true
}

# ── 3.12 Health checks ─────────────────────────────────────────────────────
phase_health() {
  log "Waiting for replicas to answer /api/health"
  local healthy=0
  for ((i = 0; i < REPLICAS; i++)); do
    local port=$((APP_BASE_PORT + i)) tries=0
    until curl -fsS --max-time 2 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; do
      tries=$((tries + 1))
      if (( tries >= 30 )); then
        warn "  replica :$port did not become healthy within 60s"
        warn "  recent logs: journalctl -u ${SERVICE_PREFIX}@${port} -n 50"
        break
      fi
      sleep 2
    done
    if (( tries < 30 )); then
      ok "  replica :$port healthy"
      healthy=$((healthy + 1))
    fi
  done
  log "$healthy/$REPLICAS replicas healthy"
}

# ── 3.13 TLS cert renewal watchdog ─────────────────────────────────────────
# Caddy auto-renews via its internal maintenance loop (runs every 10 min,
# triggers ~30 days before expiry). This watchdog is a belt-and-suspenders
# daily check: if the live cert ever drops below the warning thresholds we
# log to journald and (at <7 days) bounce Caddy to nudge a fresh renewal.
phase_cert_watchdog() {
  log "Installing TLS cert renewal watchdog"
  install -d /opt/zentra/scripts
  cat > /opt/zentra/scripts/cert-watchdog.sh <<'EOF'
#!/usr/bin/env bash
# zentra cert watchdog — runs daily via systemd timer.
# Logs cert health to journald; restarts Caddy if cert is < 7 days from expiry.
#
# This is a *health check*, not a precondition gate, so it always exits 0:
# we don't want a transient cert-read failure (e.g. Caddy still negotiating
# with Let's Encrypt right after install, or briefly down for restart) to
# show up as a systemd unit failure.
set -Eo pipefail
DOMAIN="${1:?usage: $0 <domain>}"
NOW=$(date +%s)
EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect 127.0.0.1:443 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
if [[ -z "$EXPIRY" ]]; then
  # Cert isn't readable yet — Caddy may still be obtaining one. Just log
  # and exit cleanly; the next timer fire will pick it up.
  logger -t zentra-cert -p user.warning "WARN: could not read cert for $DOMAIN (Caddy may still be issuing it)"
  exit 0
fi
EXPIRY_TS=$(date -d "$EXPIRY" +%s)
DAYS_LEFT=$(( (EXPIRY_TS - NOW) / 86400 ))
if   (( DAYS_LEFT <  7 )); then
  logger -t zentra-cert -p user.crit "CRIT: $DOMAIN cert expires in ${DAYS_LEFT}d — restarting Caddy to force renewal"
  systemctl restart caddy
elif (( DAYS_LEFT < 14 )); then
  logger -t zentra-cert -p user.warning "WARN: $DOMAIN cert expires in ${DAYS_LEFT}d (Caddy should auto-renew at ~30d)"
else
  logger -t zentra-cert -p user.info  "OK: $DOMAIN cert valid for ${DAYS_LEFT}d"
fi
EOF
  chmod +x /opt/zentra/scripts/cert-watchdog.sh

  cat > /etc/systemd/system/zentra-cert-watchdog.service <<EOF
[Unit]
Description=Zentra TLS cert health check
After=caddy.service

[Service]
Type=oneshot
ExecStart=/opt/zentra/scripts/cert-watchdog.sh $DOMAIN
EOF

  cat > /etc/systemd/system/zentra-cert-watchdog.timer <<'EOF'
[Unit]
Description=Run Zentra TLS cert watchdog daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
Unit=zentra-cert-watchdog.service

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now zentra-cert-watchdog.timer
  # Intentionally NOT running the watchdog now: on a fresh install Caddy
  # may still be negotiating the Let's Encrypt cert when this phase fires,
  # which would print a misleading "could not read cert" warning. The timer
  # will fire on its own schedule (daily, jittered ±1h). Run on demand with
  #   sudo systemctl start zentra-cert-watchdog.service
}

# ── 3.13.5 Privileged finalize helper for the in-tool update orchestrator ──
# Lets the (unprivileged) helpdesk process complete an update end-to-end
# from the UI without anyone SSHing in. See:
#   scripts/zentra-finalize-update.sh
#   scripts/zentra-finalize-update.sudoers
phase_finalize_helper() {
  local helper_src="$APP_DIR/scripts/zentra-finalize-update.sh"
  local helper_dst="/usr/local/sbin/zentra-finalize-update"
  local sudoers_src="$APP_DIR/scripts/zentra-finalize-update.sudoers"
  local sudoers_dst="/etc/sudoers.d/zentra-finalize-update"

  if [[ ! -f "$helper_src" ]]; then
    warn "Skipping finalize helper: $helper_src not found in this checkout"
    return 0
  fi

  log "Installing privileged finalize helper at $helper_dst"
  install -o root -g root -m 0755 "$helper_src" "$helper_dst"

  log "Installing sudoers rule at $sudoers_dst"
  # Use visudo -cf to validate before installing so a bad file can't lock us out.
  if visudo -cf "$sudoers_src" >/dev/null 2>&1; then
    install -o root -g root -m 0440 "$sudoers_src" "$sudoers_dst"
  else
    die "Refusing to install $sudoers_dst — visudo rejected $sudoers_src"
  fi

  # Touch the log file with the right perms so the helper's append works
  # even before its first run.
  install -o root -g root -m 0644 /dev/null /var/log/zentra-finalize.log

  ok "Finalize helper ready (sudo zentra runs $helper_dst with NOPASSWD)"
}

# ── 3.14 Update helper script ──────────────────────────────────────────────
phase_update_script() {
  log "Installing update helper at $APP_DIR/scripts/update.sh"
  install -d -o "$APP_USER" -g "$APP_GROUP" "$APP_DIR/scripts"
  cat > "$APP_DIR/scripts/update.sh" <<EOF
#!/usr/bin/env bash
# Pull latest source, rebuild client, migrate DB, restart all replicas.
#
# Default behaviour: jump to the highest semver release tag in the repo.
# Override by passing BRANCH=main (HEAD), BRANCH=v1.2.3, or BRANCH=some-branch.
set -Eeo pipefail
[[ \${EUID} -eq 0 ]] || { echo "Run as root: sudo bash \$0"; exit 1; }

REPO_URL="${REPO_URL}"
BRANCH="\${BRANCH:-latest}"

# Resolve "latest" → highest semver tag.
if [[ "\$BRANCH" == "latest" ]]; then
  BRANCH=\$(git ls-remote --tags --refs "\$REPO_URL" 'v*' 2>/dev/null \\
    | awk '{print \$2}' | sed 's|refs/tags/||' \\
    | grep -E '^v[0-9]+\\.[0-9]+\\.[0-9]+\$' \\
    | sort -V | tail -1)
  [[ -n "\$BRANCH" ]] || { echo "No vX.Y.Z tags in \$REPO_URL — set BRANCH=main to install HEAD"; exit 1; }
  echo "Resolved BRANCH=latest → \$BRANCH"
fi

cd "$APP_DIR"
runuser -u $APP_USER -- git fetch --all --tags --force --prune
runuser -u $APP_USER -- git checkout "\$BRANCH"

# Tag refs vs branch refs need different reset targets.
if runuser -u $APP_USER -- git -C "$APP_DIR" show-ref --tags --quiet --verify "refs/tags/\$BRANCH"; then
  runuser -u $APP_USER -- git reset --hard "\$BRANCH"
else
  runuser -u $APP_USER -- git reset --hard "origin/\$BRANCH"
fi

runuser -u $APP_USER -- bash -lc "export PATH=/usr/local/bin:\\\$PATH; cd $APP_DIR && bun install --frozen-lockfile"
runuser -u $APP_USER -- bash -lc "export PATH=/usr/local/bin:\\\$PATH; cd $APP_DIR/server && bunx prisma generate && bunx prisma migrate deploy"
runuser -u $APP_USER -- bash -lc "export PATH=/usr/local/bin:\\\$PATH; cd $APP_DIR/client && bunx vite build"

systemctl restart '${SERVICE_PREFIX}@*'
echo "Update complete (now at \$BRANCH)."
EOF
  chmod +x "$APP_DIR/scripts/update.sh"
  chown "$APP_USER:$APP_GROUP" "$APP_DIR/scripts/update.sh"
}

# ── 3.14 Sanity check — verify a real login round-trip works ──────────────
# Catches subtle config mismatches that pass every individual phase yet leave
# the install login-broken. The classic example is the Better Auth Secure-cookie
# trap: BETTER_AUTH_URL set to https:// while origin only serves http://, so
# the cookie is silently dropped by the browser. Curl-ing here lets us look
# at the actual Set-Cookie header and tell the operator if something is off.
phase_sanity_check() {
  log "Verifying admin login round-trip"

  local probe_url="http://127.0.0.1:$APP_BASE_PORT"
  local body resp_file headers_file
  resp_file=$(mktemp)
  headers_file=$(mktemp)
  trap 'rm -f "$resp_file" "$headers_file"' RETURN

  # Caddy + replicas just got enabled in earlier phases; allow a few attempts
  # so a slow boot doesn't false-positive.
  local status=000 attempt=0
  while (( attempt < 8 )); do
    status=$(curl -s -o "$resp_file" -D "$headers_file" -w "%{http_code}" \
      -X POST "$probe_url/api/auth/sign-in/email" \
      -H "Content-Type: application/json" \
      -H "Origin: http://$SERVER_IP" \
      --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":$(printf '%s' "$ADMIN_PASSWORD" | jq -Rs .)}" \
      --max-time 5 2>/dev/null || echo "000")
    [[ "$status" == "200" ]] && break
    sleep 2; attempt=$((attempt + 1))
  done

  if [[ "$status" != "200" ]]; then
    warn "  Login round-trip returned HTTP $status (expected 200)."
    warn "  Investigate:    sudo journalctl -u 'zentra-api@*' -n 100"
    warn "  Reset password: cd $APP_DIR/server && \\"
    warn "                  RESET_EMAIL=$ADMIN_EMAIL RESET_PASSWORD='<new>' \\"
    warn "                  /usr/local/bin/bun scripts/reset-admin-password.ts"
    return 0
  fi

  # The response succeeded — but does the cookie the SPA gets actually work
  # in the browser? On a plain-HTTP install, a Secure-flagged cookie is
  # silently dropped by every browser. That's the symptom that looks like
  # "Invalid email or password" even though the password was correct.
  local cookie_line
  cookie_line=$(grep -i "^set-cookie:" "$headers_file" | head -1)
  if [[ "$cookie_line" == *"Secure"* && "$USE_TLS" != "1" ]]; then
    warn ""
    warn "  Login succeeds via curl but the session cookie has the Secure flag,"
    warn "  while the install is serving plain HTTP. Browsers will silently"
    warn "  drop this cookie and the SPA will say 'Invalid email or password'."
    warn ""
    warn "  Cause: BETTER_AUTH_URL in .env points to https://… while origin"
    warn "  is http://… — usually because TLS_FORCE=1 was set or .env was"
    warn "  hand-edited. Fix:"
    warn "    sudo sed -i 's|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=\"http://$DOMAIN\"|' \\"
    warn "      $APP_DIR/server/.env"
    warn "    sudo sed -i 's|^APP_URL=.*|APP_URL=\"http://$DOMAIN\"|' \\"
    warn "      $APP_DIR/server/.env"
    warn "    sudo systemctl restart 'zentra-api@*'"
    return 0
  fi

  ok "  Login OK (HTTP 200, cookie scheme matches origin scheme)"
}

# ── 3.15 Final summary ─────────────────────────────────────────────────────
phase_summary() {
  install -m 0600 -o "$APP_USER" -g "$APP_GROUP" /dev/stdin "$APP_HOME/.db_password" <<<"$DB_PASSWORD"

  local scheme="http"; [[ "$USE_TLS" == "1" ]] && scheme="https"
  cat <<EOF

╔══════════════════════════════════════════════════════════════════════════════╗
║  Zentra ITSM is installed.                                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Access URLs                                                                 ║
║    Primary  : $scheme://$DOMAIN
EOF
  [[ "$IS_IP" != "1" ]] && cat <<EOF
║    Direct IP: http://$SERVER_IP
EOF
  cat <<EOF
║  TLS        : $([[ "$USE_TLS" == "1" ]] && echo "Let's Encrypt for $DOMAIN" || echo "off (plain HTTP — terminate at a CDN if you need HTTPS)")
║  Release    : $BRANCH
║  Replicas   : $REPLICAS  (ports $APP_BASE_PORT..$((APP_BASE_PORT + REPLICAS - 1)))
║  PostgreSQL : 127.0.0.1:5432  (db=$DB_NAME, user=$DB_USER)
║  App user   : $APP_USER
║  App dir    : $APP_DIR
╠══════════════════════════════════════════════════════════════════════════════╣
║  Initial admin login                                                         ║
║    email    : $ADMIN_EMAIL
║    password : $ADMIN_PASSWORD
╠══════════════════════════════════════════════════════════════════════════════╣
║  Saved secrets                                                               ║
║    DB password : $APP_HOME/.db_password   (chmod 600, owned by $APP_USER)
║    .env file   : $APP_DIR/server/.env
╠══════════════════════════════════════════════════════════════════════════════╣
║  Operate                                                                     ║
║    API logs   : journalctl -u '${SERVICE_PREFIX}@*' -f
║    Caddy logs : journalctl -u caddy -f
║    Restart    : sudo systemctl restart '${SERVICE_PREFIX}@*'
║    Update     : sudo bash $APP_DIR/scripts/update.sh
║    Cert check : sudo systemctl start zentra-cert-watchdog.service
║    Cert log   : journalctl -t zentra-cert -n 30
╚══════════════════════════════════════════════════════════════════════════════╝

If https://$DOMAIN doesn't load within ~60 seconds, Caddy is still negotiating
the TLS certificate with Let's Encrypt — tail journalctl -u caddy -f to watch.

EOF
}

# ════════════════════════════════════════════════════════════════════════════
# 4. MAIN
# ════════════════════════════════════════════════════════════════════════════
main() {
  require_root
  require_dnf
  phase_inputs
  phase_packages
  phase_user
  phase_bun
  phase_postgres
  phase_repo
  phase_env
  phase_install_build
  phase_systemd
  phase_caddy
  phase_firewall
  phase_health
  phase_cert_watchdog
  phase_finalize_helper
  phase_update_script
  phase_sanity_check
  phase_summary
}

main "$@"
