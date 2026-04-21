# Assets Module — Implementation Roadmap

IT Asset Management (ITAM) and Configuration Management (CMDB) for the Zentra ITSM platform.

---

## Conceptual Layers

| Layer | Model | Purpose |
|-------|-------|---------|
| **ITAM** | `Asset` | What the organisation owns: procurement, ownership, cost, lifecycle, warranty, assignment |
| **CMDB** | `ConfigItem` | What is deployed and how: topology, dependencies, operational state, relationships |
| **Bridge** | `Asset.ciId` | Optional 1:1 link — a server is both an asset (financial record) and a CI (operational record) |

---

## Phase 1 — Core ITAM ✅ Complete

### Schema
- `Asset` — 40+ fields: identification, procurement, warranty, lifecycle dates, location, financials, governance, discovery metadata, current assignment, CI link
- `AssetAssignment` — full custody chain with open/closed timestamps
- `AssetEvent` — append-only audit trail (`asset.<verb>` naming)
- Enums: `AssetType` (13 types incl. `end_user_device`, `cloud_resource`, `iot_device`), `AssetStatus` (9 states), `AssetCondition`, `DepreciationMethod`
- Governance fields: `contractReference`, `complianceNotes`, `disposalMethod`, `disposalCertificate`
- Discovery fields: `externalId`, `discoverySource`, `lastDiscoveredAt`, `managedBy`
- Back-relations on `User`, `Team`, `ConfigItem`

### Permissions (6 granular)
`assets.view` · `assets.create` · `assets.update` · `assets.manage_lifecycle` · `assets.manage_relationships` · `assets.manage_inventory` · `assets.manage` (legacy super-permission)

### APIs (`/api/assets`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Aggregate counts by status + warranty-expiring count |
| GET | `/` | List with 10+ filter params, multi-field search, sort, pagination |
| POST | `/` | Register new asset (auto-number `ASSET-NNNNN`) |
| GET | `/:id` | Full detail: relationships, linked records, assignment history, audit log |
| PATCH | `/:id` | Partial metadata update (status changes blocked — use `/lifecycle`) |
| DELETE | `/:id` | Hard delete (blocked for active assets) |
| POST | `/:id/clone` | Clone to new asset (new number, status → in_stock, no assignment/discovery data) |
| POST | `/:id/lifecycle` | Validated state-machine transition with reason |
| POST/DELETE | `/:id/assign` | Assign / return with history |
| PUT/DELETE | `/:id/ci-link` | Link / unlink CMDB CI |
| POST/DELETE | `/:id/relationships` | Add / remove typed asset-to-asset relationship |
| POST/DELETE | `/:id/links/incidents/:id` | Impact link |
| POST/DELETE | `/:id/links/requests/:id` | Impact link |
| POST/DELETE | `/:id/links/problems/:id` | Impact link |
| POST/DELETE | `/:id/links/changes/:id` | Impact link |
| POST/DELETE | `/:id/links/services/:id` | Impact link |

### Service Layer (`server/src/lib/assets/`)
- `lifecycle.ts` — state machine: `assertValidTransition`, `transitionAsset`, auto date-stamps
- `relationship-service.ts` — typed asset graph: add, remove, list
- `entity-links.ts` — ITIL cross-module links for all 5 entity types
- `discovery-adapter.ts` — `AssetDiscoveryAdapter` interface + `reconcileDiscoveredAsset` upsert reconciler
- `index.ts` — barrel exports

### UI
- `AssetsPage.tsx` — stats bar, filter chips (with live counts), search, type/condition selects, polished status-pill table, row-level clone/action dropdown, full pagination
- `AssetDetailPage.tsx` — 8 structured sections: Overview, Ownership & Assignment, Lifecycle, Financial & Procurement, Relationships & Dependencies, Linked Records (tabbed), Activity Timeline; right-sidebar with editable properties; lifecycle stepper; 4 inline dialogs
- `NewAssetDialog.tsx` — registration form
- `AssetsPage` filter chips: All · Active · In Stock · Ordered · Maintenance · Retired (with live counts)

### Asset Relationship Graph (`AssetRelationship`)
12 typed directed edges: `is_component_of`, `contains`, `is_installed_on`, `has_installed`, `is_connected_to`, `backs_up`, `is_spare_for`, `is_upgrade_of`, `is_hosted_on`, `hosts`, `depends_on`, `is_managed_by`

### Cross-Module Impact Links
`AssetIncidentLink` · `AssetRequestLink` · `AssetProblemLink` · `AssetChangeLink` · `AssetServiceLink`

---

## Phase 2 — Discovery & Import ⬜ Planned

**Goal:** Populate and sync the asset inventory from real sources instead of relying entirely on manual entry.

### 2a. CSV Bulk Import
- `POST /api/assets/import` — multipart CSV upload, streaming row-by-row validation
- Column mapping drawer: map CSV headers to asset fields, preview 5 rows before commit
- Result: `{ imported, updated, skipped, errors: [{ row, reason }] }` — downloadable error report
- Required columns: `name`, `type`; all others optional with sensible defaults
- Uses `reconcileDiscoveredAsset` (discoverySource = "csv")

### 2b. MDM / Endpoint Discovery Adapters
Implements `AssetDiscoveryAdapter` interface from `discovery-adapter.ts`.

| Adapter | Source | Key fields mapped |
|---------|--------|-------------------|
| **Jamf Pro** | Jamf REST API | serial, model, assigned user email, OS version, last check-in |
| **Microsoft Intune** | Graph API `/deviceManagement/managedDevices` | serial, model, enrolled user, compliance state |
| **SCCM / ConfigMgr** | WMI/REST bridge | hostname, IP, installed software, last sync |
| **SNMP Sweep** | Network scan | IP, MAC, OID-based type detection |
| **Kandji / Mosyle / Hexnode** | REST API | same shape as Jamf |

Sync policy: `merge` (discovery updates only discovery-owned fields) or `overwrite` (full sync). Human-managed fields (owner, team, procurement) are never overwritten in `merge` mode.

**Schema additions needed:**
- `lastSyncStatus` — `success | partial | failed`
- `syncErrorMessage` — last error message from the adapter
- `syncedAt` — last successful sync timestamp (separate from `lastDiscoveredAt`)

### 2c. Scheduled Sync Jobs
- `AssetSyncJob` model — connector type, schedule (cron), credential reference, last run, status
- pg-boss queue: `sync-assets` — runs adapter, calls `reconcileDiscoveredAsset` for each record
- `GET /api/assets/connectors` — list configured connectors
- `POST /api/assets/connectors` — configure a new connector (type, credentials encrypted at rest)
- `POST /api/assets/connectors/:id/run` — trigger manual sync

---

## Phase 3 — Software License Management ⬜ Planned

**Goal:** Track software entitlements, seat consumption, subscription renewals, and compliance against installed software.

### Schema
```
model SoftwareLicense {
  id               Int          // primary key
  assetId          Int          // links to Asset (type = software_license)
  productName      String
  publisher        String
  version          String?
  licenseType      LicenseType  // perpetual | subscription | per_seat | per_device | site | OEM | freeware
  purchasedSeats   Int?
  subscriptionStart DateTime?
  subscriptionEnd   DateTime?
  licenseKey        String?     // encrypted
  poNumber          String?
  vendor            String?
  // aggregated
  seatsUsed         Int          // denorm, recomputed on assignment change
}
```

### APIs
- `GET /api/licenses` — list, with `overAllocated` and `expiringSoon` filters
- `POST /api/licenses/:id/assign-seat` — assign a seat to a user
- `DELETE /api/licenses/:id/seats/:userId` — revoke seat
- `GET /api/licenses/:id/usage` — seat map with last-seen data from discovery

### Alerts
- Seat over-allocation: `seatsUsed > purchasedSeats`
- Subscription expiry: 60/30/7 days before `subscriptionEnd`
- Both surface as in-app notifications and in the asset stats bar

---

## Phase 4 — SaaS Management ⬜ Planned

**Goal:** Discover and govern SaaS applications used across the organisation, including shadow IT.

### Scope distinction from Software Licenses
- `SoftwareLicense` = on-prem or perpetual software you own
- `SaasApplication` = cloud subscription you pay for per-month/year

### Schema
```
model SaasApplication {
  id             Int
  name           String       // e.g. "Salesforce", "Notion"
  category       SaasCategory // crm | productivity | security | devtools | ...
  owner          User
  team           Team?
  monthlySpend   Decimal?
  annualSpend    Decimal?
  contractEnd    DateTime?
  renewalOwner   User?
  status         SaasStatus   // active | under_review | cancelled | unknown
  discoveredVia  String?      // "okta", "g_suite_marketplace", "manual"
  userCount      Int?
  lastActivityAt DateTime?
}
```

### Discovery Sources
- **SSO audit logs** (Okta, Azure AD) — applications used by employees
- **Browser extension** — passive SaaS detection (opt-in, privacy-preserving)
- **Expense/card data** — identify recurring SaaS charges by merchant name
- **G Suite / Microsoft 365 marketplace** — installed apps per tenant

---

## Phase 5 — Stockroom & Inventory Management ⬜ Planned

**Goal:** Manage physical locations (stockrooms, warehouses, offices) and track asset movements between them.

### Schema
```
model Stockroom {
  id       Int
  name     String       // e.g. "HQ IT Stockroom", "DC-East Rack Storage"
  site     String?
  building String?
  room     String?
  manager  User?
  assets   Asset[]      // currently stored here
}

model AssetTransfer {
  id           Int
  assetId      Int
  fromLocation String?   // free text or Stockroom reference
  toLocation   String?
  transferredAt DateTime
  reason        String?
  transferredBy User
}
```

### Flows
- Receive new assets into a stockroom (`ordered → in_stock`)
- Transfer between stockrooms
- Issue to user from stockroom (`in_stock → deployed/in_use`)
- Return from user to stockroom (`deployed/in_use → in_stock`)
- Stockroom view: assets by location, with low-stock alerts

---

## Phase 6 — Contract & Maintenance Management ⬜ Planned

**Goal:** Track support contracts, maintenance agreements, and recurring service obligations tied to assets.

### Schema
```
model AssetContract {
  id            Int
  assetId       Int?        // null = blanket contract covering a pool
  contractNumber String     // unique reference
  vendor         String
  type           ContractType // support | maintenance | insurance | lease | warranty_extension
  startDate      DateTime
  endDate        DateTime
  autoRenew      Boolean
  annualCost     Decimal?
  currency       String
  renewalOwnerId String?
  notes          String?
  status         ContractStatus // active | expired | cancelled | pending_renewal
}

model AssetMaintenanceTask {
  id           Int
  assetId      Int
  title        String
  description  String?
  scheduledAt  DateTime
  completedAt  DateTime?
  completedBy  User?
  notes        String?
  linkedTicketId Int?    // auto-created ticket when task becomes due
  recurrenceRule String? // iCal RRULE for repeating maintenance
}
```

### APIs & Automation
- `GET /api/assets/:id/contracts` — list contracts for an asset
- `POST /api/assets/:id/contracts` — attach a contract
- Alerts: N days before contract expiry (admin-configurable, default 60d)
- pg-boss job: `check-asset-contracts` — daily scan, fires notifications

### `contractReference` field (current)
The existing `contractReference` text field on `Asset` is the Phase 1 placeholder. Phase 6 replaces it with a full `AssetContract` relation while retaining the text field for simple use cases.

---

## Phase 7 — Procurement Integration ⬜ Planned

**Goal:** Automate asset creation from purchase orders and supplier invoices, eliminating manual entry for newly acquired hardware.

### Flows
- **PO-driven:** When a purchase order is approved in the procurement system, draft assets are created (status `ordered`) and linked to the PO.
- **Receiving:** When goods are received, assets transition to `in_stock`. Serial numbers and asset tags are captured at receiving.
- **Invoice matching:** Match invoice line items to assets, populate financial fields automatically.

### Integration targets
- Coupa, SAP Ariba, Oracle Fusion, NetSuite — via webhook or polling
- Email-based PO parsing (fallback) — structured extraction from PDF attachments

### Schema additions
- `purchaseOrderId` — external PO reference
- `supplierId` — links to `Organization` (type = supplier)
- `receivedById` — user who received the shipment

---

## Phase 8 — Depreciation Engine & Financial Reporting ⬜ Planned

**Goal:** Compute book value over time and surface financial data for audits and budget planning.

### Endpoints
- `GET /api/assets/:id/depreciation` — schedule: `[{ year, openingValue, charge, closingValue }]`
- `GET /api/assets/valuation` — portfolio-level: total cost, total book value, total depreciation YTD
- `GET /api/assets/valuation/export` — CSV/XLSX for accounting

### Methods
- Straight-line: `(purchasePrice - salvageValue) / usefulLifeYears`
- Declining balance: `openingValue × rate`, where `rate = 2 / usefulLifeYears` (double-declining)

### Analytics metrics (added to analytics engine)
- `assets.total_count` — by type or status
- `assets.total_purchase_value` — sum of purchasePrice by type
- `assets.total_book_value` — current depreciated value
- `assets.avg_age_days` — average age from purchaseDate
- `assets.warranty_expiring_count` — by expiry window (30/60/90d)
- `assets.unassigned_deployed` — deployed assets with no assigned user (hygiene)
- `assets.license_over_allocated` — software licenses with seatsUsed > purchasedSeats

---

## Phase 9 — Compliance & Audit Toolkit ⬜ Planned

**Goal:** Make the asset register audit-ready with formal attestation workflows, export capabilities, and regulatory mapping.

### Features
- **Audit export:** `GET /api/assets/audit-export` — full asset register as signed CSV/PDF with timestamps, checksums, and field-level change history
- **Attestation workflow:** periodic "confirm this asset is still in your possession" request sent to assigned user; auto-escalates if not confirmed in N days
- **Compliance tagging:** structured tags (e.g. `SOX-relevant`, `GDPR-device`, `HIPAA-endpoint`) indexed for compliance reports
- **Retention policy:** configurable data retention per asset class (e.g. keep disposed assets for 7 years)
- **GDPR device register:** filter by compliance tag, export list of endpoints that may hold PII

---

## Phase 10 — QR / Barcode & Mobile Scanning ⬜ Planned

**Goal:** Physical asset identification via scanning — from a mobile browser, no native app required.

### Features
- `GET /api/assets/:id/qr` — returns a printable QR code SVG embedding the asset number
- `/assets/scan` — mobile-optimised camera page that reads QR/barcode and redirects to asset detail
- Printable labels (Avery / Dymo format) with QR + asset number + name + assigned user
- Bulk label print from the asset list page

---

## Deferred / Out of Scope (v1)

| Feature | Reason for deferral |
|---------|---------------------|
| Hardware discovery agents (installed on endpoints) | Requires infrastructure deployment outside the ITSM platform |
| Native RFID / NFC check-in | Requires hardware investment; QR covers most use cases |
| Real-time network topology mapping | SNMP / LLDP-based; better handled by a dedicated NMS |
| Multi-currency depreciation with live FX | Requires FX feed integration |
| Integration with physical access control systems | Domain-specific, low ROI for most customers |
| AI-powered anomaly detection (unrecognised devices) | Post-discovery; viable once sync volume justifies ML pipeline |

---

## Module Quality Checklist

### ✅ Enterprise-grade now
- Granular permissions (6 distinct, not one `manage` flag)
- Validated lifecycle state machine with transition guards and date-stamping
- Full audit trail (append-only `AssetEvent`, actor + timestamp + structured meta)
- Procurement fields: purchase date/price, PO, vendor, invoice, contract reference
- Warranty tracking with expiry alerts (list page + detail page)
- Assignment custody chain with full history
- Asset-to-asset relationship graph (12 typed directed edges)
- Cross-module impact links (incidents, requests, problems, changes, services)
- CI bridge to CMDB
- Discovery / integration fields (externalId, discoverySource, managedBy)
- Governance fields (complianceNotes, disposalMethod, disposalCertificate)
- Depreciation foundations (method, useful life, salvage value)
- Clone endpoint for rapid provisioning of similar assets
- Stats API (`/api/assets/stats`) powering the dashboard bar
- Abstract discovery adapter interface for future integrations

### ⬜ Remaining gaps vs. mature ITAM/CMDB products
| Gap | Phase |
|-----|-------|
| No live discovery / MDM sync (Jamf, Intune) | Phase 2 |
| No CSV bulk import UI | Phase 2 |
| No software license seat tracking | Phase 3 |
| No SaaS spend visibility | Phase 4 |
| No stockroom / location management | Phase 5 |
| No contract model (only a text reference field) | Phase 6 |
| No recurring maintenance scheduling | Phase 6 |
| No procurement system integration | Phase 7 |
| No depreciation schedule computation | Phase 8 |
| No portfolio-level valuation report | Phase 8 |
| No analytics metrics registered | Phase 8 |
| No audit-export / attestation workflow | Phase 9 |
| No QR label printing | Phase 10 |
| No relationship graph visualisation (only list) | UI — any phase |
| No bulk status transition (select N assets → change status) | UI — Phase 2 |
| No saved views / custom columns on the list page | UI — Phase 2 |
