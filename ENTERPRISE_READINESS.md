# Enterprise Readiness Assessment

_Last updated: 2026-04-17_

This document gives a realistic picture of where the platform stands as an enterprise ITSM tool — what works well today, what was recently improved, and what still needs work before it can be considered production-ready at enterprise scale. No security theater; only honest assessment.

---

## What is Already Good

### Core Ticket Management
- Full ticket lifecycle with background AI classification and auto-resolution (pg-boss queue, retries, exponential backoff)
- Status machine enforced at both schema and API level (`new → processing → open → resolved → closed`)
- Inbound email ingestion via webhook (SendGrid multipart format)
- Per-ticket audit events and timeline view
- SLA schema with breach tracking fields in place

### ITSM Module Coverage
- Database schema for all five ITSM modules: Incidents, Problems, Changes, Requests (service catalog), and Approvals
- Settings sections exist for every module — each is configurable independently
- CMDB entity model with relationship tracking is in the schema

### Authentication & Authorization
- Session-based auth via Better Auth with Prisma adapter
- Role-based access control (`admin` / `agent`) enforced server-side on all routes
- Permission matrix in place with `requirePermission` middleware (granular scopes like `kb.manage`, `ticket.assign`)
- Rate limiting on auth routes (production-only)

### Knowledge Base
- Full article lifecycle: draft, published, archived
- Slug-based public URLs, category grouping, tag support
- Author tracking on every article

### Organizations & Customers
- Organization model with support tiers, account manager assignment, domain/industry metadata
- Customer–organization linking
- Portal for customers to submit and track their own tickets

### Developer Experience
- Monorepo with shared `core/` package (Zod schemas, constants, types) used by both client and server — no schema drift
- Prisma ORM with migration history; pg-boss for reliable background jobs
- Shadcn/ui component library throughout — consistent, accessible UI

---

## What Was Improved (This Session)

### Knowledge Base — Enterprise Upgrade
- **Article versioning**: immutable snapshots saved automatically before overwriting a published article's body; `KbArticleVersion` table with per-article sequential version numbers
- **Review workflow**: four-state `reviewStatus` machine (`draft → in_review → approved`); `ownerId` and `reviewedById` tracked on each article; five workflow API endpoints (submit-review, approve, publish, unpublish, archive) all gated behind `kb.manage` permission
- **Visibility control**: articles can be `public` (portal) or `internal` (agents/admins only); public API routes filter on `visibility: "public"` automatically
- **Helpfulness feedback**: thumbs-up/thumbs-down widget on portal article pages with optional comment; votes stored in `KbArticleFeedback` with denormalised counters (`helpfulCount` / `notHelpfulCount`) on the article row for fast display; helpfulness percentage shown when votes exist
- **Admin KB UI**: workflow action dropdown per article row (submit for review, approve, publish, unpublish, archive); review status badge; vote counts; version count

### Settings — 10 New Sections
Added fully functional settings sections for: Incidents, Requests, Problems, Changes, Approvals, CMDB, Notifications, Security, Audit, Business Hours. Each section:
- Has a Zod schema in `core/schemas/settings.ts` with all fields defaulted (no migration needed for new fields)
- Renders a form with grouped fields matching the section's domain
- Persists per-section JSON in the existing `system_setting` table

Settings sidebar reorganised into five labelled groups (Platform, Tickets & SLA, Knowledge Base, ITSM Modules, System) with search across all 22 sections.

### Bug Fixes
- **Organization creation**: fixed two separate silent failures — `z.string().url()` rejecting URLs without a protocol, and `valueAsNumber` producing `NaN` from empty number inputs. Both caused `handleSubmit` to block silently with no user-visible error. Fix: relaxed URL validation, moved normalisation to the mutation function, added field-level error messages for every form field.

### Customer → Organization Assignment
- Admins can now assign or clear an organization link directly from the customer detail edit form
- Organization picker is a searchable select loaded only when the edit form is open (deferred fetch)

---

## What Remains for Future Enterprise Readiness

These are genuine gaps — either the schema/setting exists but no execution engine is wired, or the feature is entirely missing.

### High Priority

**Approval Workflow Execution**
The `Approval` schema and settings exist, but there is no execution engine. Approvals do not actually gate ticket state transitions, change deployments, or request fulfillment. A real implementation needs: approval request creation triggered by configurable rules, multi-approver support, escalation on timeout, and status propagation back to the parent entity.

**MFA / Two-Factor Authentication**
User preferences schema has an `mfaEnabled` boolean and `mfaSecret` field. Better Auth does not currently have MFA wired in. An actual TOTP or email-code second factor is needed before the security settings toggle means anything.

**Notification Delivery**
`NotificationsSettings` configures channels (email, in-app, Slack webhook) and events. No delivery engine exists — nothing actually sends emails or Slack messages on ticket events, SLA breaches, or approval requests. This is the largest functional gap for a production deployment.

**SLA Breach Enforcement**
SLA settings and breach fields on tickets exist. No background job calculates breach time or transitions ticket status/urgency when an SLA is breached. The SLA section in settings is configuration without enforcement.

### Medium Priority

**Audit Log UI and Export**
Audit events are recorded to the database. There is no UI to browse, filter, or export them. The Audit settings section exists (retention period, export format) but writes nothing. Admins need a searchable audit trail with CSV/JSON export.

**Business Hours & SLA Calendar Integration**
Business Hours settings have a full week schedule with open/close times. This schedule is not used in SLA calculations — all SLA timers run on wall-clock time. Wiring business hours into SLA pause/resume logic is needed for accurate breach detection.

**CMDB UI**
The CMDB schema (configuration items, relationships, types) is in place. The settings section exists. There is no CMDB management UI — no list, create, edit, relationship graph, or linking to tickets/incidents.

**IP Allowlist / Access Restrictions**
The Security settings section has fields for IP allowlist configuration. Nothing enforces these at the server level. A middleware layer reading from settings and checking `req.ip` would be needed.

**Full-Text Search for Knowledge Base**
KB search currently filters on exact substring matches via `icontains` in Prisma. A PostgreSQL full-text search index (`tsvector`) or integration with a search service (e.g. Meilisearch) would be needed for meaningful article discovery at scale.

### Lower Priority

**Related Article Suggestions**
Portal article page has a placeholder comment for related articles. No similarity algorithm or embedding-based suggestion is implemented.

**Change Freeze Windows**
Changes settings has a `freezeWindowEnabled` toggle and date fields. No enforcement prevents change requests from being approved or deployed during a freeze window.

**Ticket Merge and Linking**
No mechanism to merge duplicate tickets or create parent–child / related-ticket links (useful for problem management).

**Advanced Queue/Routing Rules**
Tickets are manually assigned or AI-classified to a category. No rules engine routes tickets to specific queues or agents based on organization tier, keyword, or time-of-day.

**Customer Portal Self-Service**
The portal lets customers submit and track tickets. It does not expose the service catalog (Requests module), knowledge base search from portal, or approval status tracking for submitted requests.

---

## Summary Table

| Area | Status |
|---|---|
| Ticket lifecycle & AI processing | Production-ready |
| Role-based access control | Production-ready |
| KB authoring & workflow | Solid foundation (versioning, review, visibility added) |
| KB helpfulness feedback | Implemented |
| Organizations & customers | Functional |
| Customer portal | Basic (ticket submission & tracking only) |
| ITSM module schemas | Complete |
| ITSM module execution engines | Not implemented |
| Settings system | 22 sections, all configurable |
| Settings enforcement (most sections) | Not wired to execution |
| Notifications | Schema only — no delivery |
| SLA enforcement | Schema only — no breach jobs |
| Business hours SLA integration | Not wired |
| MFA | Schema only — no auth integration |
| Audit log UI | Not built |
| CMDB UI | Not built |
| Full-text KB search | Not implemented |
| Approval execution engine | Not implemented |
