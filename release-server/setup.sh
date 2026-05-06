#!/usr/bin/env bash
# Zentra Release Server — one-shot provisioning script.
#
# Run as root on a fresh Debian/Ubuntu/CentOS host. Idempotent: re-running
# upgrades existing components and leaves data alone.
#
# Usage:  sudo bash setup.sh [domain]
#   domain   — defaults to zentraitsm.com. Used for the nginx server_name and
#              the Let's Encrypt cert.
set -euo pipefail

DOMAIN="${1:-zentraitsm.com}"
RELEASE_USER="zentra-release"
RELEASE_HOME="/srv/zentra-releases"
DAEMON_DIR="/opt/zentra-release"
NODE_VERSION="20"

# ── 1. OS detection + base packages ──────────────────────────────────────────
if [ -f /etc/debian_version ]; then
  PKG="apt-get"
  apt-get update
  apt-get install -y curl git nginx jq build-essential ca-certificates gnupg
elif [ -f /etc/redhat-release ]; then
  PKG="dnf"
  dnf install -y curl git nginx jq gcc gcc-c++ make ca-certificates
else
  echo "Unsupported OS — please install curl/git/nginx/jq manually."
  exit 1
fi

# ── 2. Install Node.js (for the verify-and-serve daemon) ─────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_VERSION" ]; then
  echo "Installing Node.js $NODE_VERSION…"
  if [ "$PKG" = "apt-get" ]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    dnf install -y nodejs
  fi
fi

# ── 3. Service user + git repo + dirs ────────────────────────────────────────
id -u "$RELEASE_USER" >/dev/null 2>&1 || useradd --system --home "$RELEASE_HOME" --shell /usr/bin/git-shell "$RELEASE_USER"
mkdir -p "$RELEASE_HOME"/{repo.git,manifests,artifacts,nonces}
chown -R "$RELEASE_USER:$RELEASE_USER" "$RELEASE_HOME"
chmod 755 "$RELEASE_HOME"

if [ ! -f "$RELEASE_HOME/repo.git/HEAD" ]; then
  sudo -u "$RELEASE_USER" git init --bare "$RELEASE_HOME/repo.git"
fi

# Initialise empty channel manifests if not present.
for ch in stable beta nightly; do
  f="$RELEASE_HOME/manifests/$ch.json"
  [ -f "$f" ] || sudo -u "$RELEASE_USER" sh -c "echo '{\"channel\":\"$ch\",\"releases\":[]}' > '$f'"
done

# Initialise allowlist with empty object.
ALLOW="$RELEASE_HOME/allowlist.json"
[ -f "$ALLOW" ] || { echo '{}' > "$ALLOW"; chown "$RELEASE_USER:$RELEASE_USER" "$ALLOW"; chmod 600 "$ALLOW"; }

# ── 4. Daemon source ─────────────────────────────────────────────────────────
mkdir -p "$DAEMON_DIR"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/daemon.mjs"           "$DAEMON_DIR/daemon.mjs"
cp "$SCRIPT_DIR/publish.sh"           "$DAEMON_DIR/publish.sh"
cp "$SCRIPT_DIR/register.sh"          "$DAEMON_DIR/register.sh"
cp "$SCRIPT_DIR/revoke.sh"            "$DAEMON_DIR/revoke.sh"
cp "$SCRIPT_DIR/issue-license.sh"     "$DAEMON_DIR/issue-license.sh"
cp "$SCRIPT_DIR/revoke-license.sh"    "$DAEMON_DIR/revoke-license.sh"
chmod +x "$DAEMON_DIR"/*.sh
chown -R root:root "$DAEMON_DIR"

# Initialise empty licenses.json if not present.
LICENSES="$RELEASE_HOME/licenses.json"
[ -f "$LICENSES" ] || { echo '{}' > "$LICENSES"; chown "$RELEASE_USER:$RELEASE_USER" "$LICENSES"; chmod 600 "$LICENSES"; }

# ── 5. systemd unit ──────────────────────────────────────────────────────────
cat > /etc/systemd/system/zentra-release.service <<UNIT
[Unit]
Description=Zentra Helpdesk release server (verify + serve)
After=network.target

[Service]
Type=simple
User=$RELEASE_USER
Group=$RELEASE_USER
Environment=RELEASE_HOME=$RELEASE_HOME
Environment=PORT=8721
ExecStart=/usr/bin/node $DAEMON_DIR/daemon.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$RELEASE_HOME

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable zentra-release
systemctl restart zentra-release

# ── 6. Nginx reverse proxy + TLS ────────────────────────────────────────────
cat > /etc/nginx/conf.d/zentra-release.conf <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # Certbot challenge passthrough
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # Everything else → daemon
    location / {
        proxy_pass         http://127.0.0.1:8721;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90s;
    }
}
NGINX

mkdir -p /var/www/html
nginx -t && systemctl reload nginx

# ── 7. TLS certificate ───────────────────────────────────────────────────────
if ! command -v certbot >/dev/null 2>&1; then
  if [ "$PKG" = "apt-get" ]; then
    apt-get install -y certbot python3-certbot-nginx
  else
    dnf install -y certbot python3-certbot-nginx
  fi
fi

# Skip cert provisioning if --skip-tls passed; otherwise run interactively.
if [ "${SKIP_TLS:-0}" != "1" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect || \
    echo "Certbot failed — you can rerun: certbot --nginx -d $DOMAIN"
fi

SSH_PORT="${SSH_PORT:-22}"
cat <<DONE

────────────────────────────────────────────────────────────────────
  Zentra release server is up on https://$DOMAIN
────────────────────────────────────────────────────────────────────

  Repo (push source releases here):
    $RELEASE_HOME/repo.git
    # If your SSH listens on the default port 22:
    git remote add zentra root@$DOMAIN:$RELEASE_HOME/repo.git
    # If you use a non-default SSH port (recommended), use the URL form:
    git remote add zentra ssh://root@$DOMAIN:$SSH_PORT$RELEASE_HOME/repo.git

  Publish a new release:
    $DAEMON_DIR/publish.sh <version> <channel>
    e.g. $DAEMON_DIR/publish.sh 1.4.0 stable

  Issue a license to a customer (the only thing they need from you):
    $DAEMON_DIR/issue-license.sh "Acme Corp" --seats 5 --channel stable
    → prints ZNTR-XXXX-XXXX-XXXX-XXXX  ← email this to the customer

  Revoke a license (kicks every install enrolled under it):
    $DAEMON_DIR/revoke-license.sh ZNTR-XXXX-XXXX-XXXX-XXXX

  Manual install registration (only for testing — customers self-enroll):
    $DAEMON_DIR/register.sh <installId> <installSecret> "<name>"
  Revoke a single install (without affecting their license):
    $DAEMON_DIR/revoke.sh <installId>

  Daemon logs:
    journalctl -u zentra-release -f

DONE
