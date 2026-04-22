# Demo Data Roadmap

This document describes the current implementation scope and planned future enhancements for the Demo Data Management module.

---

## ✅ Implemented (v1)

### Backend
- `DemoBatch` Prisma model — tracks all records created in each generation run by storing ID arrays per entity type
- `server/src/lib/demo-data/generator.ts` — generates 10+ realistic, internally-linked records per entity:
  - 10 agent/supervisor users + auth accounts (password: `Demo@Pass1`)
  - 4 support teams with members
  - 5 organizations + 12 customers
  - 4 KB categories + 12 published articles
  - 8 response macros
  - 1 CAB group
  - 6 catalog items
  - 15 tickets (with replies, notes, CSAT ratings)
  - 10 incidents (with timeline updates)
  - 10 service requests
  - 5 problems (linked to incidents)
  - 8 changes (some with approval requests)
  - 15 assets (laptops, servers, network gear, software licenses)
- `server/src/lib/demo-data/deleter.ts` — safe, FK-respecting deletion of only batch-tagged records
- `server/src/lib/demo-data/excel.ts` — multi-sheet Excel template download (ExcelJS)
- `server/src/routes/demo-data.ts` — REST API:
  - `GET  /api/demo-data/batches` — list batches
  - `GET  /api/demo-data/batches/:id` — batch detail
  - `POST /api/demo-data/generate` — async generation (returns 202 immediately)
  - `DELETE /api/demo-data/batches/:id` — async deletion (returns 202 immediately)
  - `GET  /api/demo-data/template` — download Excel template
- Double-gated security: `requireAuth` + `requireAdmin` + `showInSidebar` setting check

### Settings
- New `demo_data` settings section (`core/schemas/settings.ts`)
- `showInSidebar: boolean` toggle — controls Demo Data sidebar visibility
- Registered in Settings → Developer group with Flask icon

### Frontend
- `client/src/pages/DemoDataPage.tsx` — full-featured management page:
  - Generate dialog with batch label input and feature checklist
  - Batch cards with status badges (generating / ready / error / deleting / deleted)
  - Expandable record count breakdown by entity group
  - Delete confirmation dialog with safety warning
  - Excel template download button
  - Auto-refresh polling while batches are active
- Sidebar integration — Demo Data section visible only when:
  1. User has `admin` role
  2. `demo_data.showInSidebar` setting is `true`
- Route: `/demo-data` (inside `AdminRoute` guard)

---

## 🔜 Phase 2 — Excel Import

### Goal
Allow operators to fill in the Excel template and upload it to create custom demo data instead of using system-generated defaults.

### Implementation Plan
1. Add `POST /api/demo-data/import` route (multipart/form-data)
2. Create `server/src/lib/demo-data/importer.ts` using ExcelJS to parse sheets
3. Map columns to Prisma creates (Users → Teams → Customers → Tickets → ...)
4. Return preview payload before committing (dry-run mode)
5. Add upload UI to `DemoDataPage.tsx` with progress indicator and preview table

### Supported sheets (v2)
- Users, Teams, Customers, Tickets, Incidents, Assets, KbArticles, Macros

---

## 🔜 Phase 3 — Scenario Presets

### Goal
Offer named demo scenarios instead of a single generic batch.

### Examples
- **"Enterprise ITSM"** — full cross-module data as implemented now
- **"Security Incident Response"** — focused on major P1 incidents, CAB approvals, and security assets
- **"Service Catalog Focus"** — rich catalog items, service requests, customer portal data
- **"Asset Management Demo"** — 50+ assets with full lifecycle, warranties, assignments
- **"Knowledge Base Only"** — 30 articles across 6 categories with feedback and search logs

### Implementation
- Add `preset?: string` field to the generate endpoint
- Create named preset modules in `server/src/lib/demo-data/presets/`
- Display preset cards in the Generate dialog

---

## 🔜 Phase 4 — Export Live Data as Demo Template

### Goal
Allow admins to snapshot a subset of real data into an anonymized Excel export for use as a demo template.

### Features
- PII scrubbing (names → faker names, emails → @demo.local)
- Relationship preservation (tickets stay linked to the same anonymized customer)
- Configurable entity selection (pick which modules to export)

---

## 🔜 Phase 5 — Batch Restore

### Goal
Re-create a previously deleted batch using the same seed data.

### Implementation
- Store the generation parameters/seed alongside the batch record
- "Restore" action on deleted batch cards
- Uses same generator with deterministic IDs

---

## Safety Notes

- All demo records use `D`-prefixed numbers (`DTKT`, `DINC`, `DSRQ`, etc.) that visually distinguish them from real records
- The deleter uses strict WHERE IN (ids) clauses — no blanket deletes
- The `DemoBatch.recordIds` JSON is the authoritative list of what can be deleted
- If generation fails partway, the batch is marked `error` and partial records are tracked for cleanup
- The `demo_data.showInSidebar` setting gate means the feature is invisible to operators unless explicitly enabled by a super admin
- Demo user accounts use a synthetic `@demo.local` email domain that should not be deliverable in production
