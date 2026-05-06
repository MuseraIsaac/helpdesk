# Zentra Helpdesk — Update Process Runbook

End-to-end checklist for shipping releases to customers and keeping the
update channel healthy. Follow this top-to-bottom the first time; the day-to-day
sections then become routine.

> **Your release server**
> Host: `157.180.117.21`
> SSH:  `ssh -i ~/.ssh/id_rsa root@157.180.117.21 -p 8876`
> Domain: `zentraitsm.com` (must already point at `157.180.117.21`)

---

## Phase A — One-time release-server provisioning

Do this once on a fresh server.

### A.1 — DNS

Confirm `zentraitsm.com` resolves to `157.180.117.21`:

```bash
dig +short zentraitsm.com
# → 157.180.117.21
```

Without DNS, certbot in step A.4 will fail.

### A.2 — Copy the release-server scripts to the host

From your dev machine, in the helpdesk repo root:

```bash
scp -i ~/.ssh/id_rsa -P 8876 -r release-server/* \
    root@157.180.117.21:/opt/zentra-release/
```

(Create `/opt/zentra-release` first if it doesn't exist:
`ssh -i ~/.ssh/id_rsa -p 8876 root@157.180.117.21 'mkdir -p /opt/zentra-release'`)

### A.3 — Run setup.sh

```bash
ssh -i ~/.ssh/id_rsa -p 8876 root@157.180.117.21
sudo SSH_PORT=8876 bash /opt/zentra-release/setup.sh zentraitsm.com
```

This installs nginx + Node.js + jq + certbot, creates the `zentra-release`
service user, lays out `/srv/zentra-releases/`, drops the systemd unit,
provisions Let's Encrypt TLS for `zentraitsm.com`, and starts the daemon.

### A.4 — Verify

Still SSH'd in:

```bash
systemctl status zentra-release   # active (running)
journalctl -u zentra-release -n 20 # should show "[zentra-release] listening on 127.0.0.1:8721"
curl -s https://zentraitsm.com/releases/index.json -o /dev/null -w "%{http_code}\n"
# → 401  (expected — no HMAC on this curl, that's the system working)
```

A `401` from `curl` is the success signal: it proves the daemon is enforcing
authentication. A `200` would mean something is misconfigured.

---

## Phase B — One-time helpdesk-side provisioning

Done once per customer install. After this they're self-service.

### B.1 — Apply the new helpdesk migrations

On any helpdesk install (yours or a customer's):

```bash
cd helpdesk/server
bunx prisma migrate deploy
```

Two migrations should apply: `app_version` and `update_run`.

### B.2 — Restart the helpdesk

The first boot after migrations runs `recordBootVersion()` (writes the install
row) and `ensureChannelProvisioned()` (mints `installId`).

In the boot log you'll see:

```
[release] Recorded initial install: 1.0.0
[update-channel] Provisioned installId=… — awaiting license enrollment
```

---

## Phase C — Issue a license to a customer

Run **once per customer**, on the release server:

```bash
ssh -i ~/.ssh/id_rsa -p 8876 root@157.180.117.21
sudo /opt/zentra-release/issue-license.sh "Acme Corp" --seats 5 --channel stable
```

Output:

```
   Key:      ZNTR-K7M3-2QP9-X4N8-VHBA
   Channel:  stable
   Seats:    5
   Expires:  never
```

Email/share `ZNTR-K7M3-2QP9-X4N8-VHBA` to the customer. **That's all you ever
send them.** No install ID. No secret. No allowlist edits.

### C.1 — License options

```bash
issue-license.sh "Acme Corp" --seats 5
issue-license.sh "Pilot Customer" --seats 1 --expires 2026-12-31
issue-license.sh "Internal QA" --channel beta --seats 10
issue-license.sh "Single-seat trial" --seats 1 --expires 2026-06-06
```

* `--seats N` — max distinct installs that may activate the same key (default 1)
* `--channel` — `stable` / `beta` / `nightly` (default `stable`)
* `--expires YYYY-MM-DD` — optional expiry (default never)

### C.2 — What the customer does

They open **Settings → Updates → Channel**, paste the key into the
"License key" field, hit **Activate license**. Done.

---

## Phase D — Publish a release

You'll do this every time you cut a new version. Two parts: tag in git, then
publish on the release server.

### D.1 — Tag the release in your dev repo

```bash
# Update release.json — at minimum the version
$EDITOR release.json
# {
#   "version": "1.1.0",
#   "channel": "stable",
#   "publishedAt": "2026-05-10",
#   "highlights": ["Added foo", "Fixed bar"],
#   ...
# }

git add release.json
git commit -m "release: 1.1.0"
git tag v1.1.0
```

### D.2 — Push to the release server's bare repo

One-time setup of the remote (use the `ssh://` URL form because of the
non-default SSH port):

```bash
git remote add zentra ssh://root@157.180.117.21:8876/srv/zentra-releases/repo.git
```

Then for every release:

```bash
git push zentra main
git push zentra v1.1.0
```

### D.3 — Publish on the release server

```bash
ssh -i ~/.ssh/id_rsa -p 8876 root@157.180.117.21
sudo /opt/zentra-release/publish.sh 1.1.0 stable
```

This script:
1. Checks out tag `v1.1.0` from the bare repo
2. Validates `release.json` declares the same `1.1.0`
3. Builds `source.tar.gz`
4. Computes SHA-256
5. Writes `artifacts/1.1.0/{release.json,source.tar.gz,artifact.json}`
6. Prepends the release into `manifests/stable.json`

Customers running the helpdesk on the `stable` channel will see the new
version on their next "Check now" click.

### D.4 — Verify the release is visible

```bash
sudo cat /srv/zentra-releases/manifests/stable.json | jq '.releases[0]'
```

Should show your new version at the top.

---

## Phase E — A customer applies the update (their journey, no input from you)

For your awareness — this happens entirely on their side:

1. Admin opens **Settings → Updates → Available**, clicks **Check now**.
2. Banner shows "New version 1.1.0 available — you're on 1.0.0".
3. Admin clicks **Apply update**, confirms in the dialog.
4. UI switches to the live progress view (SSE-streamed). Steps progress
   through `preflight → backup → maintenance_on → fetch → verify → migrate
   → data_tasks → restart_required`.
5. While running, all non-admin /api/* traffic returns 503 with a banner.
6. Once at `restart_required`, admin restarts their helpdesk service:
   `systemctl restart zentra-helpdesk` (or whatever supervises their install).
7. Next boot picks up the new `release.json`, writes an `app_version` row of
   kind `upgrade`, drops out of maintenance mode after admin toggles it off.
8. Done.

If a step fails the run is marked `failed`, maintenance mode is dropped
automatically, and the History tab shows the error step + message.

---

## Phase F — Day-to-day operations

### F.1 — Watch the daemon

```bash
sudo journalctl -u zentra-release -f
# Healthy:   "[serve] index stable → <installId>"
# Suspect:   "[reject] GET /releases/... :: bad-signature"
# Suspect:   "[enroll] rate-limited <ip>"
# Suspect:   "[enroll] unknown license from <ip>"
```

A spike of `[reject]` from one install ID usually means the customer
regenerated their secret on the helpdesk and the allowlist row needs
re-enrollment (they can just hit **Deactivate → Activate** again with their
license).

### F.2 — Revoke a license (kick all installs under it)

```bash
sudo /opt/zentra-release/revoke-license.sh ZNTR-K7M3-2QP9-X4N8-VHBA
```

Soft-revoke flips the license + every install under it to `revoked: true`.
The next request from any of them returns 401 within 5 seconds (allowlist
hot-reload TTL).

### F.3 — Revoke a single install (without affecting their license)

```bash
sudo /opt/zentra-release/revoke.sh <installId>
```

Useful when one of a customer's installs is decommissioned but the customer
still uses the same license elsewhere.

### F.4 — See active installs per license

```bash
sudo cat /srv/zentra-releases/licenses.json | jq '
  to_entries[] | { license: .key, customer: .value.customer,
    seats: .value.seats, used: (.value.enrollments // [] | length),
    revoked: .value.revoked }'
```

### F.5 — Yank a release (e.g. found a bug after publish)

Edit `manifests/<channel>.json` directly to remove the offending entry:

```bash
sudo -u zentra-release jq '
  .releases |= map(select(.version != "1.1.0"))
' /srv/zentra-releases/manifests/stable.json | sudo -u zentra-release tee /tmp/x.json
sudo -u zentra-release mv /tmp/x.json /srv/zentra-releases/manifests/stable.json
```

Customers who've already applied keep running it; new check requests stop
seeing it. Cut a fixed `1.1.1` and republish.

### F.6 — Backups

The release server holds three things worth backing up:
* `licenses.json` — your customer record. **Most important.**
* `allowlist.json` — derived from licenses, but useful for forensics.
* `artifacts/` — the published builds. Re-buildable from git tags.

Bare-repo backups are nice-to-have; if you push from your dev machine the
tags are also there.

---

## Troubleshooting

**Customer says "License invalid"**
Check `licenses.json` on the server. Did `issue-license.sh` actually write
it? Is the customer pasting the right key? `cat /srv/zentra-releases/licenses.json | jq 'keys'`.

**Customer says "Could not reach release server"**
* Is `https://zentraitsm.com` resolving to `157.180.117.21`?
* Is the daemon running? `systemctl status zentra-release`
* Is nginx forwarding? `sudo nginx -t && systemctl status nginx`
* Did certbot renew? `sudo certbot certificates`

**Customer says "Seat limit reached"**
Their license is at capacity. Either bump the seat count
(`issue-license.sh` again with the same customer name issues a fresh key, or
just hand-edit `licenses.json` to raise `seats`) or have them deactivate
old installs that are no longer running.

**`[reject] :: timestamp-window`** in the daemon log
Clock skew between the customer's helpdesk and the release server. Have them
NTP-sync.

**Update mid-run, customer's helpdesk crashed**
The `update_run` row stays in whatever state it was in. They can navigate to
**Updates → Available** which will pick up the in-flight run; if the worker
fails to resume the row will be marked `failed` on next boot, with the
error captured in the events list.

---

## Quick command reference

| What | Where | Command |
|---|---|---|
| Issue license | release server | `sudo /opt/zentra-release/issue-license.sh "Customer" --seats N` |
| Revoke license | release server | `sudo /opt/zentra-release/revoke-license.sh ZNTR-…` |
| Revoke one install | release server | `sudo /opt/zentra-release/revoke.sh <installId>` |
| Publish release | release server | `sudo /opt/zentra-release/publish.sh 1.x.x stable` |
| Push code | dev machine | `git push zentra v1.x.x` |
| Watch daemon | release server | `sudo journalctl -u zentra-release -f` |
| Apply migrations | helpdesk install | `cd server && bunx prisma migrate deploy` |
| Activate license | helpdesk UI | Settings → Updates → Channel → paste key → Activate |
| Apply update | helpdesk UI | Settings → Updates → Available → Check → Apply |
