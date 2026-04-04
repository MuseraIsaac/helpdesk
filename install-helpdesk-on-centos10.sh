#!/usr/bin/env bash
set -Eeuo pipefail

########################################
# Helpdesk installer for CentOS Stream 10
# Repo: https://github.com/MuseraIsaac/helpdesk.git
#
# Usage examples:
#   sudo bash helpdesk-centos10-install.sh
#   sudo APP_URL="http://helpdesk.example.com" \
#        OPENAI_API_KEY="sk-..." \
#        SENDGRID_API_KEY="SG..." \
#        SENDGRID_FROM_EMAIL="support@example.com" \
#        WEBHOOK_SECRET="supersecret" \
#        ADMIN_EMAIL="admin@example.com" \
#        ADMIN_PASSWORD="StrongPass123!" \
#        bash helpdesk-centos10-install.sh
########################################

APP_USER="${APP_USER:-helpdesk}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_HOME="${APP_HOME:-/opt/helpdesk}"
APP_DIR="${APP_DIR:-$APP_HOME/app}"
REPO_URL="${REPO_URL:-https://github.com/MuseraIsaac/helpdesk.git}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-helpdesk}"

DB_NAME="${DB_NAME:-helpdesk}"
DB_USER="${DB_USER:-helpdesk}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"

detect_server_ip() {
  local ip=""
  ip="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
  if [[ -z "$ip" ]]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  echo "$ip"
}

SERVER_IP="$(detect_server_ip)"
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="127.0.0.1"
fi

APP_URL="${APP_URL:-http://${SERVER_IP}:3000}"
PORT="${PORT:-3000}"

BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(openssl rand -base64 32 | tr -d '\n')}"
TRUSTED_ORIGINS="${TRUSTED_ORIGINS:-$APP_URL}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
SENDGRID_API_KEY="${SENDGRID_API_KEY:-}"
SENDGRID_FROM_EMAIL="${SENDGRID_FROM_EMAIL:-}"
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"
ADMIN_EMAIL="${ADMIN_EMAIL:-sirmusera@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Qwerty@2030}"

ENV_FILE="$APP_DIR/server/.env"
SYSTEMD_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log() {
  echo -e "\n[+] $*"
}

warn() {
  echo -e "\n[!] $*" >&2
}

require_root() {
  if [[ ${EUID} -ne 0 ]]; then
    echo "Run this script as root or with sudo." >&2
    exit 1
  fi
}

create_user() {
  if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
    groupadd --system "$APP_GROUP"
  fi

  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --gid "$APP_GROUP" --home-dir "$APP_HOME" \
      --create-home --shell /bin/bash "$APP_USER"
  fi

  mkdir -p "$APP_HOME"
  chown -R "$APP_USER:$APP_GROUP" "$APP_HOME"
}

install_packages() {
  log "Installing OS packages"
  dnf -y install \
    git curl unzip openssl ca-certificates \
    postgresql-server postgresql-contrib \
    policycoreutils-python-utils
}

install_bun() {
  if [[ -x "$APP_HOME/.bun/bin/bun" ]]; then
    log "Bun already installed at $APP_HOME/.bun/bin/bun"
    return
  fi

  log "Installing Bun for $APP_USER"
  runuser -u "$APP_USER" -- bash -lc 'export BUN_INSTALL="$HOME/.bun"; curl -fsSL https://bun.com/install | bash'
}

prepare_repo() {
  log "Cloning or updating application source"
  if [[ -d "$APP_DIR/.git" ]]; then
    runuser -u "$APP_USER" -- git -C "$APP_DIR" fetch --all --prune
    runuser -u "$APP_USER" -- git -C "$APP_DIR" checkout "$BRANCH"
    runuser -u "$APP_USER" -- git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    rm -rf "$APP_DIR"
    runuser -u "$APP_USER" -- git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

init_postgres() {
  log "Initializing and starting PostgreSQL"

  if [[ ! -s /var/lib/pgsql/data/PG_VERSION ]]; then
    postgresql-setup --initdb
  fi

  systemctl enable --now postgresql.service

  log "Creating database role and database if missing"
  if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';"
  fi

  if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};"
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
  fi

  log "Ensuring PostgreSQL privileges and schema ownership"
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
  runuser -u postgres -- psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "GRANT CREATE, USAGE ON SCHEMA public TO ${DB_USER};"
  runuser -u postgres -- psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "ALTER SCHEMA public OWNER TO ${DB_USER};"
  runuser -u postgres -- psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 -c "ALTER ROLE ${DB_USER} IN DATABASE ${DB_NAME} SET search_path TO public;"
  ensure_pg_hba_loopback
}


ensure_pg_hba_loopback() {
  local hba_file="/var/lib/pgsql/data/pg_hba.conf"
  [[ -f "$hba_file" ]] || return 0

  log "Ensuring pg_hba.conf allows local TCP access for ${DB_USER}/${DB_NAME}"

  grep -Eq "^[[:space:]]*host[[:space:]]+${DB_NAME//./\.}[[:space:]]+${DB_USER//./\.}[[:space:]]+127\.0\.0\.1/32[[:space:]]+scram-sha-256" "$hba_file" || \
    sed -i "1ihost    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256" "$hba_file"

  grep -Eq "^[[:space:]]*host[[:space:]]+${DB_NAME//./\.}[[:space:]]+${DB_USER//./\.}[[:space:]]+::1/128[[:space:]]+scram-sha-256" "$hba_file" || \
    sed -i "1ihost    ${DB_NAME}    ${DB_USER}    ::1/128    scram-sha-256" "$hba_file"

  systemctl reload postgresql.service
}

verify_database_access() {
  log "Verifying database access with the same credentials Prisma will use"
  PGPASSWORD="$DB_PASSWORD" psql "postgresql://${DB_USER}@127.0.0.1:5432/${DB_NAME}" -v ON_ERROR_STOP=1 -c "SELECT current_user, current_database(), current_schema(), has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect, has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public, has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public;"
}

write_env() {
  log "Writing server environment file"
  mkdir -p "$(dirname "$ENV_FILE")"

  cat > "$ENV_FILE" <<ENVVARS
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET}"
BETTER_AUTH_URL="${APP_URL}"
BETTER_AUTH_BASE_URL="${APP_URL}"
TRUSTED_ORIGINS="${TRUSTED_ORIGINS}"
WEBHOOK_SECRET="${WEBHOOK_SECRET}"
OPENAI_API_KEY="${OPENAI_API_KEY}"
SENDGRID_API_KEY="${SENDGRID_API_KEY}"
SENDGRID_FROM_EMAIL="${SENDGRID_FROM_EMAIL}"
SENTRY_DSN="${SENTRY_DSN}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT}"
SEED_ADMIN_EMAIL="${ADMIN_EMAIL}"
SEED_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
PORT="${PORT}"
NODE_ENV="production"
ENVVARS

  chown "$APP_USER:$APP_GROUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

install_dependencies_and_build() {
  log "Installing Bun dependencies"
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && export PATH=\"$HOME/.bun/bin:\$PATH\" && bun install --frozen-lockfile"

  log "Generating Prisma client"
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR/server' && export PATH=\"$HOME/.bun/bin:\$PATH\" && bunx prisma generate"

  log "Building frontend for production"
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR/client' && export PATH=\"$HOME/.bun/bin:\$PATH\" && bunx vite build"

  log "Running database migrations"
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR/server' && export PATH=\"$HOME/.bun/bin:\$PATH\" && bunx prisma migrate deploy"

  log "Seeding initial data"
  runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR/server' && export PATH=\"$HOME/.bun/bin:\$PATH\" && bunx prisma db seed"
}

write_service() {
  log "Creating systemd service"
  cat > "$SYSTEMD_FILE" <<EOF_SERVICE
[Unit]
Description=Helpdesk (Bun + Express + React)
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
Environment=HOME=${APP_HOME}
Environment=PATH=${APP_HOME}/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
Environment=NODE_ENV=production
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_HOME}/.bun/bin/bun run server/src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF_SERVICE

  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

open_firewall() {
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    log "Opening TCP port ${PORT} in firewalld"
    firewall-cmd --permanent --add-port="${PORT}/tcp" || true
    firewall-cmd --reload || true
  else
    warn "firewalld is not installed or not active. Skipping firewall rule setup."
  fi
}

health_check() {
  log "Waiting for service to answer health checks"
  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
      echo "Service is healthy."
      return 0
    fi
    sleep 2
  done

  warn "Health check did not pass yet. Showing recent service logs:"
  journalctl -u "$SERVICE_NAME" -n 50 --no-pager || true
  return 1
}

print_summary() {
  cat <<SUMMARY

========================================
Helpdesk installation complete
========================================
Application URL : ${APP_URL}
Local health URL: http://127.0.0.1:${PORT}/api/health
App directory   : ${APP_DIR}
Service name    : ${SERVICE_NAME}
DB name         : ${DB_NAME}
DB user         : ${DB_USER}
Admin email     : ${ADMIN_EMAIL}
Admin password  : ${ADMIN_PASSWORD}

Important notes:
- Add a real OPENAI_API_KEY if you want AI-powered ticket features.
- Add SendGrid variables if you want outbound email features.
- Add WEBHOOK_SECRET if you want inbound email webhooks.
- To inspect logs: journalctl -u ${SERVICE_NAME} -f
========================================
SUMMARY
}

main() {
  require_root
  create_user
  install_packages
  install_bun
  prepare_repo
  init_postgres
  write_env
  verify_database_access
  install_dependencies_and_build
  write_service
  open_firewall
  health_check
  print_summary
}

main "$@"
