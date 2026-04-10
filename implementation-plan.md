# Implementation Plan

## Phase 1: Project Setup ✅

- [x] Initialize monorepo structure (`/client`, `/server`, `/core`, `/e2e`)
- [x] Set up Express 5 server with TypeScript + Bun
- [x] Set up React app with TypeScript + Vite
- [x] Set up PostgreSQL database with Prisma ORM
- [x] Configure shared `core` workspace package for Zod schemas and TypeScript types
- [x] Configure path aliases (`@/` → `src/`) and Vite proxy for API requests

## Phase 2: Authentication ✅

- [x] Integrate Better Auth (email/password, database sessions)
- [x] Create login page
- [x] `requireAuth` middleware — sets `req.user` and `req.session`
- [x] `requireAdmin` middleware — 403 for non-admins
- [x] `ProtectedRoute` component — redirects unauthenticated users to `/login`
- [x] `AdminRoute` component — redirects non-admins to `/`
- [x] Auth rate-limiting in production (15-min window, 20 req max)

## Phase 3: User Management ✅

- [x] User management page at `/users` (admin only)
- [x] `POST /api/users` — create agent
- [x] `GET /api/users` — list active users
- [x] `PATCH /api/users/:id` — edit name/role
- [x] `DELETE /api/users/:id` — soft-delete (sets `deletedAt`)
- [x] Role-based access: `admin` vs `agent`

## Phase 4: Ticket CRUD ✅

- [x] `POST /api/tickets` — create ticket (agent UI flow)
- [x] `GET /api/tickets` — list with status/category/priority/severity/search filters, sorting, pagination
- [x] `GET /api/tickets/stats` — dashboard stats via PostgreSQL function
- [x] `GET /api/tickets/stats/daily-volume` — 30-day volume chart data
- [x] `GET /api/tickets/:id` — full ticket detail (includes escalation events + audit trail + customer history)
- [x] `PATCH /api/tickets/:id` — update status, category, priority, severity, impact, urgency, assignee, escalation
- [x] Ticket list page with filtering, sorting, search, pagination, and predefined views
- [x] Ticket detail page with conversation timeline, compose area, sidebar
- [x] Triage fields: priority (low/medium/high/urgent), severity (sev1–sev4), impact, urgency

## Phase 5: AI Features ✅

- [x] Switch to OpenAI GPT-4o mini via Vercel AI SDK (`@ai-sdk/openai`)
- [x] `classify-ticket` pg-boss job — classifies inbound tickets by category and priority
- [x] `auto-resolve-ticket` pg-boss job — AI attempts to generate and send a resolution reply
- [x] `POST /api/tickets/:ticketId/replies/polish` — AI-polishes an agent's draft
- [x] AI ticket summary card on ticket detail page (generated via streaming on demand)
- [x] Knowledge base structure and seed data

## Phase 6: Email Integration ✅

- [x] `POST /api/webhooks/inbound-email` — SendGrid inbound parse → creates ticket or threads reply
- [x] Email deduplication: replies to open tickets with matching subject are threaded, not duplicated
- [x] Outbound reply email via SendGrid when an agent posts a reply
- [x] Strip `Re:`/`Fwd:` prefixes from inbound subjects
- [x] `WEBHOOK_SECRET` header verification middleware

## Phase 7: Dashboard ✅

- [x] Dashboard page with KPI cards: total tickets, open tickets, AI resolution rate, avg resolution time
- [x] 30-day daily ticket volume bar chart
- [x] Quick-filter cards linking to overdue, at-risk, and unassigned-urgent ticket views

## Phase 8: SLA Tracking ✅

- [x] Per-priority SLA policy (first response + resolution deadlines)
- [x] `firstResponseDueAt`, `resolutionDueAt`, `firstRespondedAt`, `resolvedAt`, `slaBreached` on `Ticket`
- [x] Deadlines computed at ticket creation; recalculated on priority change
- [x] `check-sla` pg-boss job — runs every 5 min, detects breaches, fires audit events
- [x] SLA status computed on every response: `on_time`, `at_risk`, `breached`
- [x] At-risk and overdue predefined list views
- [x] SLA badge in ticket detail sidebar; deadline progress visible to agents

## Phase 9: Escalation ✅

- [x] `isEscalated`, `escalatedAt`, `escalationReason` fields on `Ticket`
- [x] `EscalationEvent` model — full escalation history per ticket
- [x] `escalateTicket` / `deescalateTicket` / `checkAndEscalate` helpers
- [x] Auto-escalate on urgent priority or sev1 severity at ticket creation and update
- [x] Manual escalate/de-escalate via `PATCH /api/tickets/:id` (`escalate: true/false`)
- [x] Escalation reasons: `first_response_sla_breach`, `resolution_sla_breach`, `urgent_priority`, `sev1_severity`, `manual`, `rule_triggered`
- [x] `EscalationBadge` and `EscalationIcon` components; icon visible in ticket list subject column

## Phase 10: Internal Collaboration ✅

- [x] `Note` model: body, isPinned, authorId, mentionedUserIds, ticketId
- [x] `GET /api/tickets/:ticketId/notes` — list notes (agents/admins only)
- [x] `POST /api/tickets/:ticketId/notes` — create note + audit event
- [x] `PATCH /api/tickets/:ticketId/notes/:noteId` — pin/unpin or edit body (author/admin only)
- [x] `DELETE /api/tickets/:ticketId/notes/:noteId` — hard delete (author/admin only)
- [x] Notes rendered in `ConversationTimeline` with amber dashed border + Lock icon + "Internal Note" badge
- [x] Reply/Internal Note toggle in compose area on ticket detail page
- [x] `NoteForm` component with amber-themed warning banner

## Phase 11: Audit Trail ✅

- [x] `AuditEvent` model: ticketId, actorId (nullable), action (dot-namespaced), meta (JSON), createdAt
- [x] `logAudit(ticketId, actorId, action, meta)` helper — error-safe, never throws
- [x] Events fired for: ticket created, status changed, priority/severity/category changed, agent assigned, SLA breached, escalated, de-escalated, reply created, note created, rule applied
- [x] Audit history included in `GET /api/tickets/:id` response
- [x] `AuditTimeline` component — vertical timeline with icons; collapsible and collapsed by default

## Phase 12: Business Automation Rules ✅

- [x] Type-safe rule schema: `AutomationRule`, `Condition` (discriminated union), `Action`, `TicketRuleSnapshot`
- [x] `evaluateCondition` — pure recursive condition evaluator, no DB calls
- [x] `executeActions` — idempotent action executor; each action checks current state before writing
- [x] `runRules(ticket, context)` — skips `new`/`processing` tickets; `_appliedRuleIds` Set prevents re-fire
- [x] Rules triggered on `ticket.created`, `ticket.updated`, and a scheduled `ticket.age` check (every 5 min)
- [x] Built-in rules: keyword → category, keyword → priority/escalation, unassigned-urgent escalation (15 min), unassigned-high escalation (30 min)
- [x] `check-automation` pg-boss job for time-based rule evaluation
- [x] All applied rules recorded in audit trail via `rule.applied` event

## Phase 13: Macros (Canned Responses) ✅

- [x] `Macro` model: title, body, category (optional), isActive, createdById
- [x] `GET /api/macros` — agents see active macros only; admins see all
- [x] `POST /api/macros` — admin only, create macro
- [x] `PUT /api/macros/:id` — admin only, update macro
- [x] `DELETE /api/macros/:id` — admin only, hard delete
- [x] Variable placeholders: `{{customer_name}}`, `{{customer_email}}`, `{{ticket_id}}`, `{{agent_name}}`
- [x] `resolveMacroBody(body, context)` — client-side variable substitution
- [x] `MacroPicker` dialog — searchable, shows title + category badge + body preview
- [x] "Macros" button in reply composer opens picker; inserts resolved body into textarea
- [x] Admin UI at `/macros` (MacrosPage) with create/edit/delete

## Phase 14: Customer / Requester Model ✅

- [x] `Organization` model: name, domain (unique), notes
- [x] `Customer` model: email (unique), name, organizationId (optional), notes
- [x] `customerId` FK added to `Ticket` (nullable — preserves existing tickets)
- [x] `upsertCustomer(email, name)` helper — idempotent; called on both ticket creation paths
- [x] `GET /api/customers/:id` — full customer profile with organization + up to 50 tickets
- [x] Customer included in `GET /api/tickets/:id` with org + last 5 prior tickets (excluding current)
- [x] `CustomerHistory` sidebar card in ticket detail page
- [x] `backfill-customers.ts` script — safely backfills existing tickets
