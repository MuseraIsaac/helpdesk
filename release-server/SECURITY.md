# Release server — security model

## Trust boundary

The release server has one job: serve build artifacts to authenticated
helpdesk installs and reject everyone else. It holds no helpdesk-customer
data; the worst-case impact of a full compromise is **artifact substitution**
(serving a backdoored tarball). All other guarantees follow from that.

## Defences in layers

### 1. Transport
* TLS-only via Let's Encrypt — the setup script runs Certbot against the
  configured domain.
* HSTS via the standard nginx config (set `Strict-Transport-Security` if
  you've fronted with a load balancer).

### 2. Authentication (HMAC)
* Each helpdesk install holds a **256-bit secret** generated locally on first
  boot. The release-server allowlist holds the same secret per install.
* Every request carries `X-Zentra-Install-Id`, `X-Zentra-Timestamp`,
  `X-Zentra-Nonce`, and `X-Zentra-Signature`. The signature is
  `HMAC-SHA256(secret, "<METHOD>\n<PATH>\n<TS>\n<NONCE>\n<BODY-SHA256>")`.
* Constant-time signature comparison via `crypto.timingSafeEqual`.

### 3. Replay protection
* Timestamps must be within ±5 minutes of the server clock — past or future.
* Nonces are single-use per install; the daemon writes them to
  `nonces/<installId>-<nonce>` with `O_EXCL` semantics. A reuse fails.
* A periodic sweep deletes nonces older than 2× the window so the directory
  stays bounded.

### 4. Authorization
* The allowlist is the only authority on whether an install can fetch
  releases. Operators add entries with `register.sh`, soft-revoke or delete
  with `revoke.sh`.
* `revoked: true` makes the install fail at the auth step — useful if a
  customer's secret is suspected to have leaked but you don't want to delete
  history yet.

### 5. Artifact integrity
* The helpdesk client computes the SHA-256 of the downloaded tarball and
  compares it to the descriptor it received in `artifact.json`. A mismatch
  aborts the apply step and writes an error event.
* Future: ship a detached signature using a separate keypair stored offline,
  so even a release-server compromise can't sign new artifacts.

### 6. Process isolation
* The daemon runs as the `zentra-release` system user, never root.
* Systemd unit pins:
  - `NoNewPrivileges=true`
  - `ProtectSystem=strict`
  - `ReadWritePaths=/srv/zentra-releases`
* No external Node dependencies — single file, no `npm install`, no
  supply-chain surface for the daemon itself.

## Threat model

| Threat | Mitigation |
|---|---|
| Public scraping of `/releases` to harvest builds | HMAC + allowlist; 401 leaks no detail |
| Stolen install secret used from attacker IP | Operator regenerates secret on the helpdesk; release-server admin re-`register.sh` with the new secret |
| MITM intercept of a check request | TLS terminates at nginx; HMAC binds the request body+path+ts so a captured signature is useless beyond the 5-minute window |
| Replay of a captured request | Timestamp window + per-install nonce dedup |
| Allowlist file leak (e.g. backup exfil) | Each install has a unique secret → rotate the affected installs only |
| Tampered tarball after publish | SHA-256 in `artifact.json`; helpdesk verifies after download |
| Compromised release-server publishes a backdoored release | Out-of-band: maintain a separate offline signing keypair (planned). For now: keep the release server's SSH access tightly controlled |

## Operational hygiene

* Keep `allowlist.json` out of every backup that leaves the box (or
  encrypt it before exfiltration).
* Rotate install secrets on a schedule (annually or on suspicion).
* Audit `journalctl -u zentra-release` for `[reject]` entries — repeated
  rejections from the same install ID indicate a clock-skew issue or an
  outdated secret somewhere.
* Set up a `fail2ban` rule against the nginx access log if you see scraping
  attempts.
