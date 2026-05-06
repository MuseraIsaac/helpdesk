# Zentra Helpdesk Release Server

Hosts releases at `https://zentraitsm.com` for installed Zentra Helpdesk
instances to pull from. Verifies every request is signed with the install's
HMAC secret so only authorized installs can fetch releases.

## Topology

```
Zentra Helpdesk install                Release server (zentraitsm.com)
─────────────────────────              ──────────────────────────────
  /api/updates/check         ────►     GET /releases/index.json?channel=stable
  /api/updates/apply  fetches  ────►   GET /releases/<version>/artifact.json
                                       GET /releases/<version>/source.tar.gz
```

Every request from the helpdesk install carries:

* `X-Zentra-Install-Id`  — the install's UUID
* `X-Zentra-Timestamp`   — Unix milliseconds (must be within ±5 min of server clock)
* `X-Zentra-Nonce`       — 16-byte hex random (replay defence)
* `X-Zentra-Signature`   — `hex(hmac-sha256(secret, "<METHOD>\n<PATH>\n<TS>\n<NONCE>\n<BODY-SHA256>"))`

The release server holds an allowlist mapping each install ID to its secret.
Requests with an unknown ID, expired timestamp, reused nonce, or bad signature
are rejected with HTTP 401.

## Filesystem layout (on the release server)

```
/srv/zentra-releases/
├── repo.git/                    # bare git repo — push source here to publish
├── allowlist.json               # { "<installId>": { "secret": "...", "name": "Customer X" } }
├── nonces/                      # short-lived nonce cache (replay protection)
├── manifests/
│   ├── stable.json              # release index per channel
│   ├── beta.json
│   └── nightly.json
└── artifacts/
    └── <version>/
        ├── release.json         # canonical release manifest
        ├── source.tar.gz        # the build artifact
        └── artifact.json        # { url, sha256 } returned to clients
```

## Quick start

### 1. On the release server (157.180.117.21), as root:

```bash
# Copy the setup script over and run it
curl -fsSL https://path/to/setup.sh | bash    # or copy manually + run
sudo bash /opt/zentra-release/setup.sh
```

This installs nginx, Node.js, the verify-and-serve daemon, and TLS via Certbot.

### 2. On any developer machine — publish a release:

```bash
# Push the helpdesk source to the bare git repo
git remote add zentra root@157.180.117.21:/srv/zentra-releases/repo.git
git push zentra main

# SSH in and run the publish script with the version
ssh -i ~/.ssh/id_rsa root@157.180.117.21 \
  /opt/zentra-release/publish.sh 1.4.0 stable
```

`publish.sh` builds the tarball, computes the SHA-256, writes
`artifacts/1.4.0/`, and updates `manifests/stable.json` to include the new
release. Helpdesk installs running on the `stable` channel will see it on
their next check.

### 3. Register a new helpdesk install:

```bash
# On the release server
sudo /opt/zentra-release/register.sh \
  <installId-from-helpdesk> \
  <installSecret-from-helpdesk> \
  "Acme Corp Production"
```

The install ID and secret come from the helpdesk's **Settings → Updates →
Channel** tab. The secret is shown once when first provisioned (and via
"Regenerate"); copy it before leaving the page.

## Security model

| Concern | Mitigation |
|---|---|
| Random scraping of /releases | All endpoints require valid HMAC; 401 otherwise |
| Replay attacks | Timestamp window (±5 min) + per-nonce dedup cache |
| Compromised install secret | Admin regenerates on the helpdesk → `register.sh` rotates the allowlist row |
| Tampered artifact | SHA-256 in `artifact.json` is verified by the helpdesk after download |
| MITM / DNS hijack | TLS only (Certbot/Let's Encrypt) |
| Allowlist file leak | `0600` perms; daemon runs as a non-root user |

See [SECURITY.md](./SECURITY.md) for the full threat model.
