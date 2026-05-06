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
BRANCH="${BRANCH:-main}"

# === SEED ADMIN (used on first run; harmless after) ───────────────────────
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"            # blank → auto-generate

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

# ════════════════════════════════════════════════════════════════════════════
# 3. PHASES
# ════════════════════════════════════════════════════════════════════════════

# ── 3.1 Gather inputs ──────────────────────────────────────────────────────
phase_inputs() {
  log "Collecting installation settings"
  prompt DOMAIN         "Domain (e.g. helpdesk.example.com)"
  [[ -n "$DOMAIN" ]] || die "DOMAIN is required"

  prompt LE_EMAIL       "Let's Encrypt notification email" "ops@$DOMAIN"
  prompt REPLICAS       "Number of API replicas" "$REPLICAS"
  prompt BRANCH         "Repo branch" "$BRANCH"
  prompt ADMIN_EMAIL    "Initial admin email"  "$ADMIN_EMAIL"
  prompt_secret ADMIN_PASSWORD "Initial admin password"
  prompt_secret DB_PASSWORD    "PostgreSQL password for '$DB_USER'"

  [[ "$REPLICAS" =~ ^[0-9]+$ ]] && (( REPLICAS >= 1 && REPLICAS <= 16 )) \
    || die "REPLICAS must be a number between 1 and 16 (got: $REPLICAS)"

  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(gen_secret)}"
  DB_PASSWORD="${DB_PASSWORD:-$(gen_secret)}"
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
  DOWNLOAD_TOKEN_SECRET="$(openssl rand -hex 32)"

  cat <<EOF

  ┌──────────────────────────────────────────────────────────────────────
  │ Domain         : https://$DOMAIN
  │ Let's Encrypt  : $LE_EMAIL
  │ API replicas   : $REPLICAS  (ports $APP_BASE_PORT..$((APP_BASE_PORT + REPLICAS - 1)))
  │ Repo / branch  : $REPO_URL  ($BRANCH)
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
phase_repo() {
  log "Fetching source from $REPO_URL ($BRANCH)"
  if [[ -d "$APP_DIR/.git" ]]; then
    runuser -u "$APP_USER" -- git -C "$APP_DIR" fetch --all --prune
    runuser -u "$APP_USER" -- git -C "$APP_DIR" checkout "$BRANCH"
    runuser -u "$APP_USER" -- git -C "$APP_DIR" reset --hard "origin/$BRANCH"
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
  local app_url="https://$DOMAIN"
  install -d -m 0750 -o "$APP_USER" -g "$APP_GROUP" "$APP_DIR/server"

  cat > "$env_file" <<EOF
# Generated by install.sh — re-running install regenerates this file.
NODE_ENV=production
APP_URL="$app_url"
TRUSTED_ORIGINS="$app_url"

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
ReadWritePaths=$APP_DIR
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

  # IMPORTANT: use `handle` blocks so try_files (under file_server) cannot
  # rewrite /api/* to /index.html before reverse_proxy gets a chance to run.
  # In Caddy's default directive order try_files runs *before* reverse_proxy,
  # so without explicit handle blocks API calls return the SPA HTML.
  cat > /etc/caddy/Caddyfile <<EOF
{
  email $LE_EMAIL
}

$DOMAIN {
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
}
EOF

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
set -Eeo pipefail
DOMAIN="${1:?usage: $0 <domain>}"
NOW=$(date +%s)
EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect 127.0.0.1:443 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')
if [[ -z "$EXPIRY" ]]; then
  logger -t zentra-cert -p user.err "FAIL: could not read cert for $DOMAIN"
  exit 1
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
  # Run once immediately so we get a baseline log line on every install/upgrade.
  systemctl start zentra-cert-watchdog.service || true
}

# ── 3.14 Update helper script ──────────────────────────────────────────────
phase_update_script() {
  log "Installing update helper at $APP_DIR/scripts/update.sh"
  install -d -o "$APP_USER" -g "$APP_GROUP" "$APP_DIR/scripts"
  cat > "$APP_DIR/scripts/update.sh" <<EOF
#!/usr/bin/env bash
# Pull latest source, rebuild client, migrate DB, restart all replicas.
set -Eeo pipefail
[[ \${EUID} -eq 0 ]] || { echo "Run as root: sudo bash \$0"; exit 1; }

cd "$APP_DIR"
runuser -u $APP_USER -- git fetch --all --prune
runuser -u $APP_USER -- git checkout "\${BRANCH:-$BRANCH}"
runuser -u $APP_USER -- git reset --hard "origin/\${BRANCH:-$BRANCH}"

runuser -u $APP_USER -- bash -lc "export PATH=/usr/local/bin:\\\$PATH; cd $APP_DIR && bun install --frozen-lockfile"
runuser -u $APP_USER -- bash -lc "export PATH=/usr/local/bin:\\\$PATH; cd $APP_DIR/server && bunx prisma generate && bunx prisma migrate deploy"
runuser -u $APP_USER -- bash -lc "export PATH=/usr/local/bin:\\\$PATH; cd $APP_DIR/client && bunx vite build"

systemctl restart '${SERVICE_PREFIX}@*'
echo "Update complete."
EOF
  chmod +x "$APP_DIR/scripts/update.sh"
  chown "$APP_USER:$APP_GROUP" "$APP_DIR/scripts/update.sh"
}

# ── 3.14 Final summary ─────────────────────────────────────────────────────
phase_summary() {
  install -m 0600 -o "$APP_USER" -g "$APP_GROUP" /dev/stdin "$APP_HOME/.db_password" <<<"$DB_PASSWORD"

  cat <<EOF

╔══════════════════════════════════════════════════════════════════════════════╗
║  Zentra ITSM is installed.                                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  URL          : https://$DOMAIN
║  Replicas     : $REPLICAS  (ports $APP_BASE_PORT..$((APP_BASE_PORT + REPLICAS - 1)))
║  PostgreSQL   : 127.0.0.1:5432  (db=$DB_NAME, user=$DB_USER)
║  App user     : $APP_USER
║  App dir      : $APP_DIR
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
  phase_update_script
  phase_summary
}

main "$@"
