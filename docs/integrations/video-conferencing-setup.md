# Video Conferencing Integration — Setup Guide

This guide walks through configuring the **Video Bridge** integration in Zentra Helpdesk for each of the four supported providers: **Google Meet**, **Microsoft Teams**, **Zoom**, and **Cisco Webex**. Only one provider can be active at a time — agents click a single "Start Bridge Call" button on any incident and the system creates a real meeting using whichever provider is currently selected.

---

## How the integration works

When an agent clicks **Start Bridge Call** on an incident, the server:

1. Reads the **active provider** from `Settings → Integrations → Video Bridge`.
2. Looks up the credentials saved for that provider.
3. Calls the provider's API to create a real meeting.
4. Stamps the join URL onto the incident and notifies the on-call team.

The provider implementations live in `server/src/lib/bridge/` and are wired up by `server/src/lib/bridge/index.ts`. The **Test Connection** button on the settings page creates and immediately deletes a real meeting to verify your credentials end-to-end.

> **Pick one provider.** The system stores credentials for all four simultaneously, but only the one selected under **Active provider** is used. You can keep dormant credentials saved for fast switching.

---

## Where to enter credentials

All four providers share the same settings location:

1. Sign in to Helpdesk as an admin.
2. Go to **Settings → Integrations**.
3. Scroll to the **Video Bridge (Incident Bridge Calls)** card.
4. Pick a provider from the **Active provider** dropdown.
5. Fill in the credential fields that appear for that provider.
6. Click **Save**.
7. Click **Test Connection**. A real test meeting is created and then deleted — if you see ✓ **Connection successful**, you're done.

> *[ Screenshot slot — Settings → Integrations → Video Bridge card ]*

---

# 1. Google Meet

Google Meet meetings are created via **Google Calendar API** — a meeting is just a Calendar event with a Meet conference attached. The flow uses **OAuth 2.0** with a long-lived refresh token, generated once via the Google OAuth Playground.

## What you need

| Field | Where it comes from |
|---|---|
| **OAuth Client ID** | Google Cloud Console → Credentials → OAuth 2.0 Client IDs |
| **OAuth Client Secret** | Same credential entry |
| **Refresh Token** | Generated via [OAuth Playground](https://developers.google.com/oauthplayground) |

## Step-by-step

### 1.1 Create a Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com).
2. Top-left **project picker → New Project**.
3. Name: `Zentra Video Meet`. If the **Organization** dropdown lists your Workspace domain, leave it selected — your Workspace admin will manage the project. Otherwise leave it as "No organization" (personal account).
4. Click **Create** and wait ~10 seconds for it to be ready.

> *[ Screenshot slot — Google Cloud Console project picker ]*

### 1.2 Enable the Calendar API

1. From the new project, open **APIs & Services → Library**.
2. Search for **Google Calendar API** → click → **Enable**.
3. *(Optional but recommended)* Search for **Google Meet API** → **Enable**. This unlocks richer Meet metadata.

> *[ Screenshot slot — Calendar API enable page ]*

### 1.3 Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type:
   - **Internal** if your account is on a Google Workspace domain (recommended — no verification needed, no token expiry).
   - **External** if it's a personal Gmail account.
3. Fill in App name, support email, developer email → **Save and continue**.
4. Skip "Scopes" → **Save and continue**.
5. If you chose **External**, add the Google account email under **Test users** → **Save and continue**.
6. Back at the consent screen overview, if status is "Testing", click **Publish app** (External only — turns the 7-day refresh-token expiry into "never expires").

### 1.4 Create the OAuth client

1. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
2. **Application type**: must be **Web application** (other types can't use the server-side refresh-token flow).
3. Name: `Zentra Helpdesk Bridge`.
4. **Authorized JavaScript origins**:
   ```
   https://developers.google.com
   ```
5. **Authorized redirect URIs**:
   ```
   https://developers.google.com/oauthplayground
   ```
6. Click **Create**.
7. Copy both **Client ID** and **Client Secret** from the popup — the Client Secret is shown only at creation time (you can rotate it later with **Reset secret**).

> *[ Screenshot slot — Create OAuth client page ]*

### 1.5 Generate a refresh token via OAuth Playground

1. Open [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground).
2. Click the **⚙ gear icon** (top right):
   - Tick **Use your own OAuth credentials**.
   - Paste your **Client ID** and **Client Secret**.
   - Click **Close**.
3. **Step 1 — Select & authorize APIs**:
   - In the **Input your own scopes** box, paste:
     ```
     https://www.googleapis.com/auth/calendar.events
     ```
   - Click **Authorize APIs**.
   - Sign in as the Google account that should own the bridge meetings (this is the account whose calendar will hold the events).
   - Click **Allow** at the consent screen.
4. **Step 2 — Exchange authorization code for tokens**:
   - Click **Exchange authorization code for tokens**.
   - Copy the **Refresh token** (starts with `1//...`) — this is what you need for Helpdesk.

> *[ Screenshot slot — OAuth Playground Step 2 with refresh token visible ]*

### 1.6 Paste into Helpdesk

In `Settings → Integrations → Video Bridge`:

| Field | Value |
|---|---|
| Active provider | **Google Meet** |
| OAuth Client ID | from step 1.4 |
| OAuth Client Secret | from step 1.4 |
| Refresh Token | from step 1.5 |

Click **Save**, then **Test Connection** → expect ✓ **Connection successful**.

## Common Google Meet errors

| Error | Cause | Fix |
|---|---|---|
| `accessNotConfigured` / `403` mentioning Calendar API | Calendar API not enabled on the project | Step 1.2 — enable it. Wait 1–2 min. |
| `unauthorized_client` | Client Secret was rotated, or app type is not "Web application" | Reset secret in step 1.4, or recreate as Web application |
| `invalid_grant` | Refresh token revoked, mismatched with current Client ID/Secret, or trailing whitespace on paste | Regenerate token in step 1.5 with the *current* credentials |
| `Request access` page on the API enable link | You're signed into the wrong Google account | Switch accounts (top-right avatar). The owner is the account that created the project. |

---

# 2. Microsoft Teams

Teams meetings are created via the **Microsoft Graph API** using an **Azure AD App Registration** with application-level permissions. The app acts on behalf of a designated "organizer" user.

## What you need

| Field | Where it comes from |
|---|---|
| **Tenant ID** | Azure AD → Overview |
| **Client ID** | App Registration → Overview |
| **Client Secret** | App Registration → Certificates & secrets |
| **Organizer User ID** | UPN (email) or Object ID of the user whose calendar holds the meetings |

## Step-by-step

### 2.1 Register the app in Azure AD

1. Open [portal.azure.com](https://portal.azure.com) and sign in as a tenant admin.
2. Search for **Azure Active Directory** (or **Microsoft Entra ID**) → open it.
3. **App registrations → + New registration**.
4. Name: `Zentra Helpdesk Bridge`.
5. **Supported account types**: choose **Single tenant** (most secure) unless you need cross-tenant.
6. **Redirect URI**: leave blank — not needed for this flow.
7. Click **Register**.

> *[ Screenshot slot — Azure App Registration form ]*

### 2.2 Copy the Tenant ID and Client ID

On the app's **Overview** page, copy:

- **Application (client) ID** → this is your **Client ID**.
- **Directory (tenant) ID** → this is your **Tenant ID**.

### 2.3 Create a Client Secret

1. Left menu → **Certificates & secrets**.
2. **Client secrets → + New client secret**.
3. Description: `Zentra Bridge`, Expires: pick **24 months** (or longer per your security policy).
4. Click **Add**.
5. **Copy the Value column immediately** — it's only shown once. This is your **Client Secret**. If you miss it, delete and create a new one.

> *[ Screenshot slot — Certificates & secrets page with secret value visible ]*

### 2.4 Grant API permissions

1. Left menu → **API permissions**.
2. **+ Add a permission → Microsoft Graph → Application permissions** (NOT delegated).
3. Search for and tick: **`OnlineMeetings.ReadWrite.All`**.
4. Click **Add permissions**.
5. Back on the API permissions list, click **Grant admin consent for &lt;your tenant&gt;** at the top. The status column should switch to ✓ **Granted**.

> Application permissions require a **Global Administrator** or **Privileged Role Administrator** to grant consent. If "Grant admin consent" is greyed out for you, ask an admin to click it.

### 2.5 Authorize the app to impersonate the organizer (Teams policy)

Application-permission Teams meeting creation also requires an **application access policy** that names the user the app may impersonate. This is set via PowerShell, one-time:

1. Open a Windows PowerShell terminal as admin.
2. Install the module if needed:
   ```powershell
   Install-Module MicrosoftTeams -Scope CurrentUser
   ```
3. Sign in and create + grant the policy (replace `<APP_ID>` with your Client ID and `<UPN>` with the organizer's email):
   ```powershell
   Connect-MicrosoftTeams
   New-CsApplicationAccessPolicy -Identity Zentra-Bridge -AppIds "<APP_ID>" -Description "Allow Zentra to schedule meetings on behalf of users"
   Grant-CsApplicationAccessPolicy -PolicyName Zentra-Bridge -Identity "<UPN>"
   ```
4. Wait ~30 minutes for the policy to propagate.

> Without this step you'll get `Forbidden` from Graph when creating a meeting, even though API permissions look correct.

### 2.6 Paste into Helpdesk

| Field | Value |
|---|---|
| Active provider | **Microsoft Teams** |
| Tenant ID | from step 2.2 |
| Client ID | from step 2.2 |
| Client Secret | from step 2.3 |
| Organizer User ID | UPN (e.g. `support@yourcompany.com`) or the Object ID from Azure AD → Users |

Click **Save** → **Test Connection**.

## Common Teams errors

| Error | Cause | Fix |
|---|---|---|
| `AADSTS7000215: Invalid client secret` | Client Secret wrong or rotated | Regenerate in step 2.3 |
| `Forbidden` on meeting creation | Application access policy not granted, or wrong organizer UPN | Step 2.5 — wait 30 min after granting |
| `AADSTS500011: The resource principal was not found` | Admin consent not granted on Graph permissions | Step 2.4 — click "Grant admin consent" |

---

# 3. Zoom

Zoom is the simplest provider — uses **Server-to-Server OAuth** with no user consent flow at all.

## What you need

| Field | Where it comes from |
|---|---|
| **Account ID** | Zoom Marketplace → your app → App Credentials |
| **Client ID** | Same page |
| **Client Secret** | Same page |

## Step-by-step

### 3.1 Create the Server-to-Server OAuth app

1. Open [marketplace.zoom.us](https://marketplace.zoom.us) and sign in.
2. Top-right **Develop → Build App**.
3. Pick **Server-to-Server OAuth** → **Create**.
4. Name: `Zentra Helpdesk Bridge` → **Create**.

> *[ Screenshot slot — Zoom Marketplace "Build App" page ]*

### 3.2 Copy credentials

On the **App Credentials** tab, copy:

- **Account ID**
- **Client ID**
- **Client Secret**

### 3.3 Configure information & scopes

1. **Information** tab: fill in mandatory fields (Company name, name, email).
2. **Scopes** tab: **+ Add Scopes**:
   - `meeting:write:admin` — create meetings
   - `meeting:read:admin` — read meetings (used by Test Connection)
3. Click **Continue → Activation → Activate your app**.

> *[ Screenshot slot — Zoom Scopes selection ]*

### 3.4 Paste into Helpdesk

| Field | Value |
|---|---|
| Active provider | **Zoom** |
| Account ID | from step 3.2 |
| Client ID | from step 3.2 |
| Client Secret | from step 3.2 |

Click **Save** → **Test Connection**.

## Common Zoom errors

| Error | Cause | Fix |
|---|---|---|
| `Invalid client_id or client_secret` | Wrong creds | Re-copy from step 3.2 |
| `Invalid access token` immediately after save | App not activated | Step 3.3 — click Activate |
| `4711` — missing scopes | Required scopes not granted | Step 3.3 — add both scopes, reactivate |

---

# 4. Cisco Webex

Webex uses a simple **bot token** — no OAuth flow required.

## What you need

| Field | Where it comes from |
|---|---|
| **Bot Token** | [developer.webex.com](https://developer.webex.com) → your bot |
| **Site URL** | Your Webex site, e.g. `company.webex.com` |

## Step-by-step

### 4.1 Create a bot

1. Open [developer.webex.com/my-apps](https://developer.webex.com/my-apps) → sign in.
2. **Create a New App → Bot**.
3. Fill in:
   - Bot name: `Zentra Helpdesk`
   - Bot username: must be globally unique on Webex (e.g. `zentra-helpdesk@webex.bot`)
   - Description, icon (optional).
4. Click **Add Bot**.
5. On the success page, **copy the Bot Access Token** — shown only once. If you lose it, regenerate via **My Apps → your bot → Regenerate access token**.

> *[ Screenshot slot — Webex bot creation success page with token ]*

> **Production note**: Bot tokens never expire. **Personal Access Tokens** (also available from developer.webex.com → Documentation → Getting Started) expire after **12 hours** — use only for testing.

### 4.2 Find your site URL

Your Webex site URL is the domain you sign in to, e.g. `company.webex.com` (without `https://`). If unsure, ask your Webex admin or check the URL in your browser when signed into Webex.

### 4.3 Paste into Helpdesk

| Field | Value |
|---|---|
| Active provider | **Cisco Webex** |
| Bot Token | from step 4.1 |
| Site URL | from step 4.2 (no `https://` prefix) |

Click **Save** → **Test Connection**.

## Common Webex errors

| Error | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Wrong or expired token | Regenerate bot token (step 4.1) |
| `403 Forbidden — meeting:create` | Bot not licensed for meetings | Webex Bots can create *spaces*, not full Meetings — for meeting URLs you need a licensed user account's PAT or an Integration. See "Token type guidance" in `server/src/lib/bridge/webex.ts`. |
| `404` on `/meetings` endpoint | Wrong site URL or typo in `siteUrl` | Step 4.2 — should be `company.webex.com`, no path |

---

# Provider comparison

| Provider | Auth method | Setup time | Token lifetime | Admin consent? |
|---|---|---|---|---|
| Google Meet | OAuth 2.0 + Refresh Token | ~15 min | Indefinite (if "Internal" or "Published") | Workspace admin if Internal |
| Microsoft Teams | OAuth 2.0 Client Credentials | ~30 min | Secret 24 mo, app permanent | Yes — Global Admin |
| Zoom | Server-to-Server OAuth | ~5 min | Indefinite | No (account-owner is fine) |
| Webex | Bot Token | ~3 min | Indefinite | No |

---

# Testing without the UI

Every provider implementation has a `createMeeting()` and `deleteMeeting()` method in `server/src/lib/bridge/<provider>.ts`. You can test directly via curl using the same flow the **Test Connection** button uses:

**Google Meet:** `POST https://oauth2.googleapis.com/token` to refresh, then `POST https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1`.

**Microsoft Teams:** `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`, then `POST https://graph.microsoft.com/v1.0/users/{organizer}/onlineMeetings`.

**Zoom:** `POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=...`, then `POST https://api.zoom.us/v2/users/me/meetings`.

**Webex:** `POST https://webexapis.com/v1/meetings` with `Authorization: Bearer <bot-token>`.

---

# Troubleshooting cheat sheet

1. **`[none] No video bridge provider is configured`** — you haven't set **Active provider**. Drop down isn't on "None".
2. **`Incomplete <provider> configuration`** — one of the required fields is blank. Re-check the table for your provider.
3. **Test Connection passes but agents see no meeting link** — check the incident detail page; the join URL is stored on the incident record. If still missing, check server logs for the matching provider error.
4. **Credentials worked yesterday, now fail** — most likely a rotated secret (Google) or expired Personal Access Token (Webex). Bot tokens, refresh tokens with "Published" consent, and Zoom S2S creds do not expire.

---

*Document version 1.0 — owned by the Zentra Helpdesk team. Update the screenshots and this version number whenever the providers' UIs change materially.*
