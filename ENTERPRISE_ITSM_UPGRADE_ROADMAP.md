# Enterprise ITSM Platform — Upgrade Roadmap

## Overview

This document describes the navigation architecture of the enterprise ITSM platform shell,
the permission model governing each module, and the phased roadmap for implementing the
modules currently shown as placeholders.

---

## Current Navigation Structure

Navigation is declared in **`client/src/lib/nav-config.ts`** as a typed array of
`NavSection[]`. Each section and item carries its own visibility rules (`permission`,
`roles`) so the sidebar renders a correct view for every role without scattered inline
checks in JSX.

### Section map

```
ITSM Platform
│
├── SERVICE DESK
│   ├── Dashboard          /                   all roles
│   └── Tickets            /tickets             tickets.view
│
├── ITSM
│   ├── Service Requests   /requests            requests.view
│   ├── Incidents          /incidents           incidents.view   [BETA]
│   ├── Problems           /problems            problems.view
│   ├── Changes            /changes             changes.view
│   └── Assets             /assets              assets.view      [BETA]
│
├── KNOWLEDGE
│   ├── Knowledge Base     /kb                  kb.manage (admin + supervisor)
│   └── Templates          /templates           admin only
│
├── ANALYTICS
│   └── Reports            /reports             reports.view
│
├── ADMINISTRATION                              admin only (section gate)
│   ├── Automations        /automations
│   ├── Teams              /teams
│   ├── Users              /users
│   └── Macros             /macros
│
└── (footer — always visible)
    └── Settings           /settings            admin only (route guard)
```

### Module breadcrumb

The top header displays a live breadcrumb derived from the current route:
`resolveModuleBreadcrumb(pathname, role)` in `nav-config.ts`.

Examples:
- `/` → **Service Desk · Dashboard**
- `/tickets/42` → **Service Desk · Tickets**
- `/problems` → **ITSM · Problems**
- `/settings/general` → **Administration · Settings**

---

## Permission Matrix

> Permission strings follow `<domain>.<action>`. The full list lives in
> `core/constants/permission.ts`. Middleware: `requirePermission("domain.action")`.

### Service Desk

| Permission              | admin | supervisor | agent | readonly |
|-------------------------|:-----:|:----------:|:-----:|:--------:|
| tickets.view            |   ✓   |     ✓      |   ✓   |    ✓     |
| tickets.create          |   ✓   |     ✓      |   ✓   |          |
| tickets.update          |   ✓   |     ✓      |   ✓   |          |
| notes.view              |   ✓   |     ✓      |   ✓   |    ✓     |
| notes.create            |   ✓   |     ✓      |   ✓   |          |
| notes.manage_any        |   ✓   |     ✓      |       |          |
| attachments.delete_any  |   ✓   |     ✓      |       |          |
| replies.create          |   ✓   |     ✓      |   ✓   |          |
| macros.view             |   ✓   |     ✓      |   ✓   |    ✓     |
| macros.manage           |   ✓   |            |       |          |

### ITSM Modules

| Permission              | admin | supervisor | agent | readonly |
|-------------------------|:-----:|:----------:|:-----:|:--------:|
| incidents.view          |   ✓   |     ✓      |   ✓   |    ✓     |
| incidents.manage        |   ✓   |     ✓      |   ✓   |          |
| requests.view           |   ✓   |     ✓      |   ✓   |    ✓     |
| requests.manage         |   ✓   |     ✓      |   ✓   |          |
| problems.view           |   ✓   |     ✓      |   ✓   |    ✓     |
| problems.manage         |   ✓   |     ✓      |       |          |
| changes.view            |   ✓   |     ✓      |   ✓   |    ✓     |
| changes.manage          |   ✓   |     ✓      |       |          |
| changes.approve         |   ✓   |     ✓      |       |          |
| tasks.view              |   ✓   |     ✓      |   ✓   |    ✓     |
| tasks.manage            |   ✓   |     ✓      |   ✓   |          |

### Asset & Configuration Management

| Permission              | admin | supervisor | agent | readonly |
|-------------------------|:-----:|:----------:|:-----:|:--------:|
| cmdb.view               |   ✓   |     ✓      |   ✓   |    ✓     |
| cmdb.manage             |   ✓   |     ✓      |       |          |
| assets.view             |   ✓   |     ✓      |   ✓   |    ✓     |
| assets.manage           |   ✓   |     ✓      |       |          |
| services.view           |   ✓   |     ✓      |   ✓   |    ✓     |
| services.manage         |   ✓   |     ✓      |       |          |

### Catalog & Workflow

| Permission              | admin | supervisor | agent | readonly |
|-------------------------|:-----:|:----------:|:-----:|:--------:|
| catalog.view            |   ✓   |     ✓      |   ✓   |    ✓     |
| catalog.manage          |   ✓   |     ✓      |       |          |
| catalog.request         |   ✓   |     ✓      |   ✓   |          |
| approvals.view          |   ✓   |     ✓      |   ✓   |    ✓     |
| approvals.respond       |   ✓   |     ✓      |   ✓   |          |
| workflows.view          |   ✓   |     ✓      |       |    ✓     |
| workflows.manage        |   ✓   |            |       |          |

### Platform Administration

| Permission              | admin | supervisor | agent | readonly |
|-------------------------|:-----:|:----------:|:-----:|:--------:|
| users.manage            |   ✓   |            |       |          |
| teams.manage            |   ✓   |            |       |          |
| kb.manage               |   ✓   |     ✓      |       |          |
| integrations.manage     |   ✓   |            |       |          |
| audit.view              |   ✓   |     ✓      |       |    ✓     |
| reports.view            |   ✓   |     ✓      |   ✓   |    ✓     |
| reports.advanced_view   |   ✓   |     ✓      |       |          |

> **Customer** accounts have an empty permission set. They authenticate via
> the portal (`requireCustomer` middleware) and never reach agent-shell routes.

---

## Role Definitions

| Role       | Description                                                                      |
|------------|----------------------------------------------------------------------------------|
| admin      | Full platform access: all permissions including integrations and user management |
| supervisor | ITSM process owner: manages incidents, problems, changes (incl. CAB approval), CMDB, asset records, advanced analytics |
| agent      | Frontline operator: works incidents and requests, fulfills tasks, view-only on problems/changes/CMDB |
| readonly   | Auditor/observer: full read access including audit log; no write or approve actions |
| customer   | Self-service portal only; blocked from all agent-shell routes by `requireAuth`   |

---

## Implementation Phases

### Phase 1 — Shell & Navigation (COMPLETE)
- [x] Data-driven sidebar config (`nav-config.ts`)
- [x] Permission-gated section/item rendering
- [x] Module breadcrumb in top header
- [x] User identity + role badge in sidebar footer
- [x] "ITSM Platform" branding
- [x] Beta badge pills on in-progress modules
- [x] Collapsible sidebar (desktop) + mobile drawer
- [x] `/incidents` and `/assets` placeholder routes

### Phase 2 — Service Requests Module
Goal: Dedicated intake flow separate from break-fix tickets.

- [ ] `ServiceRequest` model (Prisma migration)
  - Fields: `requestType`, `requestedFor`, `approvalStatus`, `fulfillmentStatus`
  - Approval workflow states: `pending → approved/rejected → in_fulfillment → fulfilled`
- [ ] `GET/POST /api/requests` routes
- [ ] Service catalog: pre-defined request types (Software, Hardware, Access)
- [ ] `/requests` list page with status filters
- [ ] `/requests/:id` detail page with approval timeline
- [ ] Approver assignment (supervisor+ can approve)
- [ ] Permissions: `requests.view`, `requests.create`, `requests.approve`
- [ ] Audit events: `request.created`, `request.approved`, `request.rejected`, `request.fulfilled`

### Phase 3 — Incident Management
Goal: ITIL-aligned incident lifecycle with P1–P4 priority classification.

- [ ] `Incident` model (linked to existing `Ticket` or standalone)
  - Fields: `priority` (P1–P4), `impactedUsers`, `incidentStatus`, `resolvedAt`, `postmortemUrl`
  - Status flow: `new → acknowledged → in_progress → resolved → closed`
- [ ] Major incident flag + war-room escalation
- [ ] `GET/POST /api/incidents` routes
- [ ] Incident timeline with acknowledgement tracking
- [ ] SLA integration (P1 = 1hr response, P2 = 4hr, P3 = 8hr, P4 = 24hr)
- [ ] `/incidents` list + `/incidents/:id` detail pages
- [ ] Permissions: `incidents.view`, `incidents.manage`

### Phase 4 — Problem Management
Goal: Root cause tracking linked to incident clusters.

- [ ] `Problem` model
  - Fields: `rootCause`, `workaround`, `status` (`open → under_investigation → known_error → resolved`)
  - Many-to-many relation to `Incident`
- [ ] `GET/POST /api/problems` routes
- [ ] Known Error Database (KEDB) view
- [ ] Link incidents → problems in UI
- [ ] `/problems` list + detail pages
- [ ] Permissions: `problems.view`, `problems.manage` (supervisor+)

### Phase 5 — Change Management
Goal: Change advisory board (CAB) workflow with risk assessment.

- [ ] `ChangeRequest` model
  - Fields: `changeType` (`standard | normal | emergency`), `riskLevel`, `approvalStatus`, `implementationWindow`, `backoutPlan`
  - Status flow: `draft → submitted → cab_review → approved/rejected → implementing → completed/failed`
- [ ] CAB approval workflow (multi-approver)
- [ ] Change calendar view
- [ ] `/changes` list + detail + calendar pages
- [ ] Permissions: `changes.view`, `changes.create`, `changes.approve`

### Phase 6 — Asset Management / CMDB
Goal: Track IT assets and configuration items.

- [ ] `Asset` model
  - Fields: `assetTag`, `assetType` (`hardware | software | license | service`), `status`, `assignedToId`, `purchaseDate`, `warrantyExpiry`, `location`
- [ ] `ConfigurationItem` (CI) model for CMDB relationships
- [ ] CI relationship graph (depends-on, hosted-on, used-by)
- [ ] `GET/POST /api/assets` routes
- [ ] Asset lifecycle tracking (procurement → active → maintenance → retired)
- [ ] Link assets to tickets/incidents
- [ ] `/assets` list + detail pages
- [ ] Permissions: `assets.view`, `assets.manage`

### Phase 7 — Enhanced Analytics
Goal: Module-specific dashboards beyond the existing ticket KPI cards.

- [ ] ITSM health dashboard (incidents by priority, change success rate, SLA trends)
- [ ] Agent performance metrics (first-response time, resolution rate, CSAT scores)
- [ ] Service request fulfillment metrics
- [ ] Trend analysis with date-range picker
- [ ] Export to CSV / PDF
- [ ] Scheduled report delivery via email

### Phase 8 — Service Catalog
Goal: Self-service catalog for end users to request services.

- [ ] `CatalogItem` model (name, description, icon, form schema, SLA, approver group)
- [ ] Customer portal: browse catalog, submit structured forms
- [ ] Agent portal: manage catalog items
- [ ] Integration with Service Requests module (catalog submission → request)
- [ ] `/portal/catalog` public-facing page

---

## Approval Engine

### Architecture (COMPLETE — Phase 1)

The approval engine is a generic, multi-step, multi-approver workflow system
stored entirely in PostgreSQL. It is deliberately decoupled from any specific
module so that any future governed action can attach an approval request without
schema changes.

```
ApprovalRequest         ← the governed action (subjectType + subjectId)
  ├── ApprovalStep[]    ← one per approver, ordered by stepOrder
  │     └── ApprovalDecision?  ← the cast vote
  └── ApprovalEvent[]   ← append-only audit trail
```

#### Key concepts

| Concept | Description |
|---------|-------------|
| `subjectType` | Identifies the governing module: `"change_request"`, `"service_request"`, `"access_request"`, `"policy_exception"`. Adding a new governed type = add a string constant, no migration needed. |
| `subjectId` | Opaque string ID of the entity in the source table. |
| `approvalMode` | `"all"` = every step must approve in sequence. `"any"` = first N approvals win. |
| `requiredCount` | For `"any"` mode: how many approvals are needed (default 1). |
| Steps | Multiple steps at the same `stepOrder` run in parallel. Higher-order steps activate only when all lower-order steps complete (`"all"` mode). |
| `isActive` | Whether the step is currently awaiting the approver's decision. |

#### Server API

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | `/api/approvals` | `approvals.view` | Create a new approval request |
| GET | `/api/approvals` | `approvals.view` | List my approvals (scope=mine) or all (scope=all, admin/supervisor only) |
| GET | `/api/approvals/:id` | `approvals.view` | Fetch single request with steps, decisions, and event history |
| POST | `/api/approvals/:id/decide` | `approvals.respond` | Approve or reject (only the assigned step approver) |
| POST | `/api/approvals/:id/cancel` | `approvals.view` | Cancel (requester or admin/supervisor) |

#### Audit trail

Events are written to the `ApprovalEvent` table (separate from `AuditEvent` which is ticket-scoped).

| Event | When |
|-------|------|
| `approval.created` | Request created |
| `approval.step_approved` | A step is approved |
| `approval.step_rejected` | A step is rejected |
| `approval.step_activated` | Next step(s) become active (sequential mode) |
| `approval.approved` | Request fully approved |
| `approval.rejected` | Request rejected |
| `approval.cancelled` | Request cancelled by requester or admin |
| `approval.expired` | `expiresAt` passed before resolution |

---

### Integrating a New Module with the Approval Engine

When a future module (Change Requests, Service Requests, Access Requests, etc.)
needs approval gating, follow this pattern:

#### 1. Register the subject type

Add the module's key to `approvalSubjectTypes` in `core/constants/approval.ts`:

```ts
export const approvalSubjectTypes = [
  "change_request",
  "service_request",
  "access_request",
  "policy_exception",
  "catalog_request",     // ← add new type here
] as const;
```

No database migration required — `subjectType` is stored as plain text.

#### 2. Trigger approval creation in the module's route

In `server/src/routes/<module>.ts`, after creating the governed entity:

```ts
import { createApproval } from "../lib/approval-engine";

// After creating the change record:
await createApproval(
  {
    subjectType: "change_request",
    subjectId: String(changeRequest.id),
    title: `Change: ${changeRequest.title}`,
    description: changeRequest.summary,
    approvalMode: "all",
    approverIds: [cabMember1Id, cabMember2Id],  // determined by business rules
    expiresAt: sevenDaysFromNow.toISOString(),
  },
  req.user.id  // requestedById
);
```

#### 3. React to approval outcomes (optional)

If the module needs to update its own state when an approval resolves
(e.g. advancing a Change Request from `cab_review` to `approved`):

**Option A — Polling**: the module's detail page calls `/api/approvals?subjectType=change_request&subjectId=123` to read status.

**Option B — Webhook/event**: extend the approval engine to call a registered
callback when status changes. Add a `callbackUrl` or `onResolve` hook to
`ApprovalRequest` in a future iteration.

**Option C — Background job**: a scheduled job queries `ApprovalRequest` for
newly resolved requests and updates the source entity. This is the safest for
Phase 2 because it requires no coupling in the engine itself.

#### 4. Surface approvals in the module's UI

The `/approvals` page already shows all requests where the logged-in user is
an approver, regardless of `subjectType`. Module-specific pages can additionally:
- Show an inline approval status badge on the entity detail page
- Link to `/approvals` pre-filtered by `subjectType` + `subjectId`
- Embed the approve/reject action directly in the entity detail page
  by calling `POST /api/approvals/:id/decide` from a component

#### 5. Checklist

- [ ] Add `subjectType` constant to `core/constants/approval.ts`
- [ ] Add label to `approvalSubjectTypeLabel` map
- [ ] Call `createApproval()` at the right lifecycle point in the module route
- [ ] Decide how the module reacts to resolution (polling / job / callback)
- [ ] Document the approver-selection logic (who gets assigned, in what order)
- [ ] Update permission matrix if the module needs a new `<module>.approve` permission

---

## Adding a New Module (Checklist)

When implementing any module above, follow this order:

1. **Schema**: Add Prisma model + migration
2. **Core types**: Add constants/types to `core/constants/`
3. **Permissions**: Add new permissions to `core/constants/permission.ts` + update `ROLE_PERMISSIONS`
4. **Server routes**: Create `server/src/routes/<module>.ts`, mount in `index.ts`
5. **Audit logging**: Call `logAudit()` for all major state transitions
6. **Nav config**: Add/update item in `client/src/lib/nav-config.ts`
7. **Routes**: Add routes in `client/src/App.tsx` with appropriate route guards
8. **Pages**: Create list page + detail page in `client/src/pages/`
9. **Tests**: Add component tests; E2E only for cross-page flows

---

## Permission Expansion — Change Log

### v2 — Enterprise ITSM Expansion (current)

**Added 27 new permissions** across 5 new domains. Total: 41 permissions.

| Domain                        | New permissions                                                                 |
|-------------------------------|---------------------------------------------------------------------------------|
| ITSM Modules                  | `incidents.view/manage`, `requests.view/manage`, `problems.view/manage`, `changes.view/manage/approve`, `tasks.view/manage` |
| Asset & Configuration         | `cmdb.view/manage`, `assets.view/manage`, `services.view/manage`                |
| Catalog & Workflow            | `catalog.view/manage/request`, `approvals.view/respond`, `workflows.view/manage` |
| Platform Administration       | `integrations.manage`, `audit.view`, `reports.advanced_view`                    |

**Key design decisions:**
- `changes.approve` is separate from `changes.manage` — managing a change record
  (editing fields, attaching CIs) does not imply CAB membership.
- `problems.manage` is supervisor-only — agents can link tickets to problems but
  cannot own the root cause investigation record.
- `reports.advanced_view` is layered on top of `reports.view` — basic reporting
  is available to all agents; advanced analytics (trends, exports, scheduling)
  requires the elevated permission.
- `workflows.manage` is admin-only — workflow engine definitions can change
  access patterns platform-wide and must be tightly controlled.
- `integrations.manage` is admin-only — third-party API keys and webhook
  configurations carry significant security risk.
- `audit.view` is granted to `readonly` (auditors) and `supervisor` (compliance
  oversight) but intentionally withheld from agents to limit blast radius.

---

## Future: Custom Roles & RBAC Groups

The current model uses a **flat role hierarchy** (admin > supervisor > agent > readonly).
This is sufficient for most deployments but has known limitations at enterprise scale.

### When to extend beyond flat roles

| Trigger                                           | Suggested approach                     |
|---------------------------------------------------|----------------------------------------|
| A team needs agent-level access plus one elevated permission (e.g., `changes.approve`) | Add a purpose-built role (e.g., `cab_member`) |
| Different business units need different catalog visibility | Introduce resource-level ABAC (attribute-based) |
| External contractors need time-limited access     | Add `expiresAt` to the session/role assignment |
| Customers need tiered portal access (VIP vs. standard) | Extend `CustomerRoute` with a `tier` check    |

### Recommended path to custom roles (RBAC groups)

When the flat model is outgrown, the recommended migration is:

1. **Add a `CustomRole` model** (Prisma)
   ```
   model CustomRole {
     id          Int          @id @default(autoincrement())
     name        String       @unique
     permissions String[]     // Permission[] stored as text array
     users       User[]       @relation("UserCustomRole")
     createdAt   DateTime     @default(now())
   }
   ```

2. **Extend `can()` to check custom roles**
   ```ts
   // core/constants/permission.ts
   export function can(role: string, permission: Permission, customPermissions?: Set<Permission>): boolean {
     if (customPermissions?.has(permission)) return true;
     return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
   }
   ```

3. **Pass custom permissions through middleware**
   ```ts
   // require-permission.ts
   export function requirePermission(permission: Permission): RequestHandler {
     return (req, res, next) => {
       const custom = req.user?.customPermissions; // Set<Permission> loaded at auth time
       if (!req.user || !can(req.user.role, permission, custom)) {
         res.status(403).json({ error: "Forbidden" });
         return;
       }
       next();
     };
   }
   ```

4. **Load custom permissions at session time** in `requireAuth` so they're
   available on every request without an extra DB call per route.

5. **Admin UI** — extend `/settings/roles` (new section) to create custom roles
   and assign them to users.

### What NOT to do

- Do not encode permissions in JWTs — they become stale and are hard to revoke.
- Do not add per-resource ownership checks inside `can()` — those belong in
  route handlers (e.g., `if (note.authorId !== req.user.id && !can(role, "notes.manage_any"))`).
- Do not create a new role for every team. Group permissions into a small number
  of well-defined roles and use `CustomRole` for exceptions only.

---

## Design Principles

- **Data-driven navigation**: `nav-config.ts` is the only place nav items are declared.
  Layout.tsx has zero hardcoded route checks.
- **Permission-first visibility**: Every nav item and section declares its own access rule.
  Adding a module never requires touching Layout.tsx — only nav-config.ts.
- **Audit everything**: Every model state transition fires a `logAudit()` event.
- **Migration-friendly**: New models use nullable FKs where possible to avoid
  breaking existing data. Backfill scripts go in `prisma/`.
- **Portal isolation**: Customer-facing routes live under `/portal/*` behind `CustomerRoute`.
  They share the DB but never access agent-side APIs.
- **Placeholder-first**: New modules are added to the nav with a `PlaceholderPage`
  before implementation begins, giving a full picture of the eventual IA.
