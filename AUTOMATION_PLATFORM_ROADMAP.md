# Automation Platform Roadmap

Enterprise automation platform for the ITSM Helpdesk system.  
Architecture document and phased implementation plan.

---

## Architecture Overview

The automation platform replaces the legacy `automation/` and `workflow/` systems
with a single, unified engine that spans 9 automation categories:

| # | Category | Purpose |
|---|---------|---------|
| 1 | **Intake & Routing** | Auto-classify, tag, and route tickets on arrival |
| 2 | **Event Workflows** | React to ticket/incident/change/request state changes |
| 3 | **Time-Based Rules** | Act on tickets that are idle, at-risk, or SLA-breached |
| 4 | **Assignment Routing** | Round-robin, least-loaded, and skill-based assignment |
| 5 | **Approval Automation** | Auto-create approval workflows based on conditions |
| 6 | **Notification Rules** | Send configurable notifications to agents, teams, and requesters |
| 7 | **Field Automation** | Enrich fields from content, source, time-of-day, or context |
| 8 | **Lifecycle Rules** | Auto-close, auto-resolve, reopen, and manage record lifecycle |
| 9 | **Integrations / Webhooks** | Fire outbound webhooks to external systems on events |

---

## Data Model

### New tables (Phase 1 — implemented)

| Table | Purpose |
|-------|---------|
| `automation_rule` | Rule definition with triggers, conditions, actions, category |
| `automation_execution` | One record per rule evaluation against an entity |
| `automation_execution_step` | One record per action within an execution |
| `outbound_webhook` | Registered endpoint configuration |
| `webhook_delivery` | Delivery log for each outbound webhook attempt |

### Retained tables (backward compatible)

| Table | Status | Notes |
|-------|--------|-------|
| `workflow_definition` | Retained | Existing workflows continue to fire via legacy engine |
| `workflow_execution` | Retained | — |
| `workflow_execution_step` | Retained | — |
| `scenario_definition` | Retained | Manual agent-triggered scenarios; accessible at `/automations/scenarios` |
| `scenario_execution` | Retained | — |
| `scenario_execution_step` | Retained | — |

---

## API Surface

### Automation Rules (`/api/automations`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/automations` | `automations.view` | List all rules |
| POST | `/api/automations` | `automations.manage` | Create rule |
| GET | `/api/automations/categories` | `automations.view` | Category metadata |
| GET | `/api/automations/:id` | `automations.view` | Fetch rule |
| PATCH | `/api/automations/:id` | `automations.manage` | Update rule |
| PATCH | `/api/automations/:id/toggle` | `automations.manage` | Enable/disable |
| DELETE | `/api/automations/:id` | `automations.manage` | Delete rule |
| POST | `/api/automations/reorder` | `automations.manage` | Reorder within category |
| POST | `/api/automations/:id/test` | `automations.test` | Dry-run against entity |
| GET | `/api/automations/:id/executions` | `automations.view` | Execution history |

### Outbound Webhooks (`/api/webhooks/outbound`)

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/webhooks/outbound` | `webhooks.view` | List webhooks |
| POST | `/api/webhooks/outbound` | `webhooks.manage` | Register webhook |
| GET | `/api/webhooks/outbound/:id` | `webhooks.view` | Fetch webhook |
| PATCH | `/api/webhooks/outbound/:id` | `webhooks.manage` | Update webhook |
| PATCH | `/api/webhooks/outbound/:id/toggle` | `webhooks.manage` | Enable/disable |
| DELETE | `/api/webhooks/outbound/:id` | `webhooks.manage` | Delete webhook |
| POST | `/api/webhooks/outbound/:id/ping` | `webhooks.manage` | Send test ping |
| GET | `/api/webhooks/outbound/:id/deliveries` | `webhooks.view` | Delivery history |

---

## Permission Model

| Permission | Admin | Supervisor | Agent | Readonly |
|-----------|-------|-----------|-------|----------|
| `automations.view` | ✓ | ✓ | | ✓ |
| `automations.manage` | ✓ | | | |
| `automations.test` | ✓ | ✓ | | |
| `webhooks.view` | ✓ | | | |
| `webhooks.manage` | ✓ | | | |

---

## Phase 1 — Foundation (Implemented)

**Status:** ✅ Done

### What was built

**Schema**
- `AutomationRule`, `AutomationExecution`, `AutomationExecutionStep` Prisma models
- `OutboundWebhook`, `WebhookDelivery` Prisma models
- User → AutomationRule and OutboundWebhook relations

**Core Layer**
- `core/constants/automation.ts` — all trigger types, action types, category constants
- `core/schemas/automations.ts` — full Zod schemas for rules, conditions, actions, webhooks

**Engine**
- `server/src/lib/automation-engine/index.ts` — main engine; loads rules, evaluates, persists
- `server/src/lib/automation-engine/conditions.ts` — AND/OR condition tree evaluator
- `server/src/lib/automation-engine/actions.ts` — action executor dispatcher (20+ action types)
- `server/src/lib/automation-engine/capacity-routing.ts` — round-robin + least-loaded routing

**API**
- `server/src/routes/automations.ts` — full CRUD + test + executions endpoints
- `server/src/routes/outbound-webhooks.ts` — webhook CRUD + ping + delivery history

**UI**
- `/automations` → `AutomationPlatformPage` — category tabs, rule cards, stats
- `/automations/rules/new` → `AutomationRuleFormPage` — create/edit rule
- `/automations/rules/:id` → `AutomationRuleFormPage` — edit existing rule
- `/automations/webhooks` → `OutboundWebhooksPage` — webhook management
- `/automations/scenarios` → `ScenariosPage` — legacy manual scenarios (preserved)

**Permissions**
- Added `automations.view`, `automations.manage`, `automations.test`
- Added `webhooks.view`, `webhooks.manage`
- Wired into all routes with `requirePermission()`

---

## Ticket Intake & Routing — Enterprise Email Intake System (Implemented)

**Status:** ✅ Done

### What was built

**Schema**
- Added 8 intake fields to `Ticket` model: `emailTo`, `emailCc`, `emailReplyTo`, `isAutoReply`, `isBounce`, `isSpam`, `isQuarantined`, `mailboxAlias`
- `prisma generate` run — migration pending (combine with Phase 1 migration)

**Core Layer**
- Added 5 intake action types to `AutomationActionType`: `suppress_creation`, `mark_spam`, `quarantine`, `send_auto_reply`, `add_watcher`
- Added Zod schemas for all 5 new actions in `core/schemas/automations.ts`
- Added `"ticket.intake_suppressed"` to `AuditAction` enum

**Engine**
- `server/src/lib/automation-engine/types.ts` — `TicketSnapshot` extended with all email metadata, requester enrichment, and computed virtual fields
- `server/src/lib/automation-engine/conditions.ts` — `resolveField` extended: `senderDomain` (derived), `email.*` aliases, `requester.*` aliases, `isBusinessHours`, `hasAttachments`
- `server/src/lib/automation-engine/index.ts` — `runAutomationEngine` now accepts a pre-built `snapshot` to bypass the internal DB load; `loadTicketSnapshot` extended to include all intake fields
- `server/src/lib/automation-engine/actions.ts` — 5 new handlers: `suppress_creation` (soft-delete), `mark_spam` (flag + close), `quarantine` (flag for review), `send_auto_reply` (enqueues email job), `add_watcher` (upserts TicketFollower)

**Intake Routing Engine**
- `server/src/lib/intake-routing.ts` — dedicated runner:
  - `detectAutoReply(rawHeaders)` — checks X-Auto-Submitted, Auto-Submitted, X-Autoreply, Precedence headers
  - `detectBounce(rawHeaders, subject)` — checks X-Failed-Recipients, multipart/report content-type, NDR subject patterns
  - `extractHeader(rawHeaders, name)` — generic header extractor
  - `isBusinessHours(timezone)` — Mon–Fri 09:00–17:00 check (configurable via system settings in future)
  - `loadIntakeSnapshot(ticketId, meta)` — loads ticket + `customer` + `organization` and builds enriched `TicketSnapshot` with all requester data and computed fields
  - `runIntakeRouting(ticketId, meta?)` — runs all enabled `intake_routing` rules; returns `{ suppressed, spam, quarantined, autoReplySent, rulesMatched }`

**Route Integration**
- `server/src/routes/webhooks.ts` — inbound email handler restructured:
  - Extracts `To`, `CC`, `Reply-To`, `X-Mailbox-Alias` from raw headers
  - Detects auto-reply and bounce before ticket creation
  - Persists intake fields on the ticket at creation time
  - Runs `runIntakeRouting()` **before** auto-response and classify/auto-resolve jobs
  - If `suppressed` or `spam`: skips all downstream processing
  - If `autoReplySent`: skips default auto-response
  - If `autoReply`, `bounce`, or `quarantined`: skips classify/auto-resolve jobs
- `server/src/routes/tickets.ts` — agent-created tickets: calls `runIntakeRouting(ticket.id, null)` fire-and-forget after creation

**UI**
- `client/src/pages/automations/ConditionBuilder.tsx` — new visual AND/OR condition tree editor:
  - 40+ fields across 5 categories: Email & Message, Requester, Ticket, Context, Custom
  - Type-aware operator filtering (string / email / enum / boolean / number)
  - Adaptive value inputs: text, number, boolean toggle, single-select, multi-select badge picker
  - Nested AND/OR groups up to 3 levels deep
  - Add condition / Add group / Delete buttons at every level
- `client/src/pages/automations/AutomationRuleFormPage.tsx` — updated:
  - Replaced placeholder with live `ConditionBuilder` component (works for all 9 categories)
  - Added `suppress_creation`, `mark_spam`, `quarantine`, `send_auto_reply`, `add_watcher` to `COMMON_ACTIONS`
  - `ActionRow` forms for each new action: auto-reply body editor, agent watcher picker, quarantine reason, suppression confirmation hints

### Conditions supported by intake rules

| Namespace | Field | Type |
|-----------|-------|------|
| Email | `senderEmail`, `senderDomain`, `senderName` | string/email |
| Email | `emailTo`, `emailCc`, `emailReplyTo` | string |
| Email | `mailboxAlias`, `subject`, `body` | string |
| Email | `isAutoReply`, `isBounce` | boolean |
| Email | `source` | enum (email/portal/agent) |
| Requester | `requesterIsVip` | boolean |
| Requester | `requesterSupportTier` | enum (free/standard/premium/enterprise) |
| Requester | `requesterOrgName`, `requesterTimezone`, `requesterLanguage` | string |
| Ticket | `status`, `priority`, `ticketType`, `severity`, `impact`, `urgency` | enum |
| Ticket | `category`, `affectedSystem`, `isEscalated`, `slaBreached` | string/boolean |
| Context | `isBusinessHours`, `isSpam`, `isQuarantined` | boolean |
| Custom | `custom_<fieldname>` | any |
| Operators | `eq`, `neq`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `matches_regex` | — |

### Actions supported by intake rules

| Action | Effect |
|--------|--------|
| `assign_team` | Route to group/team |
| `assign_agent` | Assign to specific agent |
| `assign_round_robin` | Distribute evenly within team |
| `assign_least_loaded` | Assign to team member with fewest open tickets |
| `set_priority` | Set priority |
| `set_category` | Set category |
| `set_status` | Set status |
| `add_tag` | Add tag (pending tag system) |
| `set_affected_system` | Set affected system field |
| `add_note` | Add internal note |
| `send_notification` | Notify assignee / team / requester |
| `send_auto_reply` | Send custom email reply to sender |
| `add_watcher` | Add agent as ticket follower |
| `escalate` | Escalate to team |
| `suppress_creation` | Soft-delete ticket — stop all processing |
| `mark_spam` | Flag isSpam=true, close ticket |
| `quarantine` | Flag isQuarantined=true — hold for review |
| `trigger_webhook` | Fire outbound webhook |
| `stop_processing` | Stop evaluating further rules |

### Group-first then agent routing

Intake rules follow a two-tier dispatch model:

1. **Team/group routing first** — use `assign_team`, `assign_round_robin`, or `assign_least_loaded` with `stopOnMatch: true` to route the ticket to the correct queue. These rules run first (lower `order` value).

2. **Agent assignment inside the queue** — add a second rule (higher `order`) with the same team condition and an `assign_agent` or capacity-based action. Because `runAutomationEngine` reloads the snapshot between rules, the second rule sees the `teamId` already set by the first rule, enabling team-conditioned agent assignment.

Example rule order for VIP routing:
```
Order 10: IF requester.isVip = true → assign_team(VIP Support) + stop_processing
Order 20: IF teamId = VIP Support  → assign_least_loaded(VIP Support)
Order 30: IF source = email AND isAutoReply = true → suppress_creation
Order 40: IF body contains "unsubscribe" → mark_spam
```

---

## Event-Based Workflow Automations (Implemented)

**Status:** ✅ Done

### What was built

**Schema**
- Added `meta Json` field to `AutomationExecution` — stores `previousValues`, `actorId`, and other trigger-time context for full audit traceability

**New Trigger Types** (added to `core/constants/automation.ts`)
- `ticket.priority_changed`, `ticket.category_changed`, `ticket.due_date_changed`, `ticket.custom_field_changed`
- `problem.created`, `problem.updated`, `problem.status_changed`

**New Action Types** (added to constants + schemas + engine)
- `notify_watchers` — notifies all `TicketFollower` records for the ticket
- `notify_requester` — sends a custom email to the ticket sender
- `create_linked_task` — creates a linked task (recorded as a pinned note until the task model is promoted; full task model Phase 5)
- `chain_workflow` — safely invokes another enabled automation rule against the same entity (uses current snapshot to avoid a DB round-trip)

**Category-Aware Trigger Map**
- `CATEGORY_TRIGGERS` map added to `core/constants/automation.ts` — lists the relevant triggers for each of the 9 categories
- Rule form trigger picker now filters triggers to the selected category

**Engine Extensions**
- `previousValues?: Record<string, unknown>` added to `TicketSnapshot`
- `conditions.ts` — resolves `previous.{field}` (old value) and `changed.{field}` (boolean changed?) virtual paths
- `index.ts` — optional `category` param restricts which rules are evaluated (prevents cross-category interference); `previousValues` injected into snapshot from `ctx.meta`; execution `meta` field persisted with previousValues + actorId
- `actions.ts` — 4 new handlers: `notify_watchers`, `notify_requester`, `create_linked_task`, `chain_workflow`

**EventBus** (`server/src/lib/event-bus.ts`)
- Central fire-and-forget dispatcher for `event_workflow` rules
- `fireEvent(payload)` — generic entry point
- `fireTicketEvent(trigger, ticketId, actorId, previousValues?)` — convenience wrapper
- `fireIncidentEvent`, `fireChangeEvent`, `fireRequestEvent` — entity-specific wrappers
- Always scoped to `category: "event_workflow"` — never triggers intake/time-supervisor rules

**Route Wiring** (14 event callsites across 7 route files)
| Route | Events fired |
|-------|-------------|
| `POST /api/tickets` | `ticket.created` |
| `PATCH /api/tickets/:id` | `ticket.status_changed`, `ticket.priority_changed`, `ticket.category_changed`, `ticket.assigned`/`ticket.unassigned`, `ticket.updated` (all with previousValues) |
| `POST /api/tickets/:id/replies` (agent) | `ticket.reply_sent` |
| Inbound email webhook — thread reply | `ticket.reply_received` |
| Inbound email webhook — new ticket | `ticket.created` |
| `POST /api/tickets/:id/notes` | `ticket.note_added` |
| `POST /api/incidents` | `incident.created` |
| `PATCH /api/incidents/:id` | `incident.status_changed`, `incident.severity_changed`, `incident.assigned` |
| `POST /api/changes` | `change.created` |
| `PATCH /api/changes/:id` | `change.submitted_for_approval`, `change.approved`, `change.rejected`, `change.implemented` |
| `POST /api/requests` | `request.created` |
| `PATCH /api/requests/:id` | `request.status_changed`, `request.approved`, `request.rejected` |
| `POST /api/approvals/:id/decide` | `change.approved`/`change.rejected` or `request.approved`/`request.rejected` on final decision |

**UI**
- `ExecutionLogPanel.tsx` — per-rule execution history: status badge, entity ID, trigger, action step results (applied/skipped/error), timestamps, duration, paginated, refreshable
- `AutomationRuleFormPage.tsx` — updated:
  - Trigger picker now filters by category using `CATEGORY_TRIGGERS`
  - Test Run button (opens dialog with entity ID input + JSON result preview)
  - Clone button (creates disabled copy with "Copy of " prefix)
  - Execution History panel at bottom of edit form
  - Action forms for: `notify_watchers`, `notify_requester`, `create_linked_task`, `chain_workflow`, `notify_watchers`
- `ConditionBuilder.tsx` — added "Previous Values" field category: `previous.status`, `previous.priority`, `previous.category`, `previous.assignedToId`, `previous.severity`, plus `changed.*` boolean fields

### Triggers Supported (event_workflow category)
All ticket lifecycle events, all incident/change/request/problem events, all approval events — 36 unique trigger types covering the full ITSM lifecycle.

### Actions Supported (full set across all categories)
`set_field`, `set_priority`, `set_category`, `set_status`, `set_type`, `assign_agent`, `assign_team`, `assign_round_robin`, `assign_least_loaded`, `add_note`, `send_notification`, `notify_watchers`, `notify_requester`, `create_linked_task`, `chain_workflow`, `send_auto_reply`, `add_watcher`, `escalate`, `deescalate`, `resolve`, `close`, `reopen`, `pause_sla`, `resume_sla`, `trigger_webhook`, `stop_processing`, `suppress_creation`, `mark_spam`, `quarantine`

### How Execution Logs Work
Every rule evaluation (matched or skipped) creates an `AutomationExecution` row. Each action within a matched execution creates an `AutomationExecutionStep`. The execution `meta` JSON stores `previousValues` and `actorId` for full audit traceability. The UI shows all executions per rule with step drill-down. Skipped executions are recorded but marked `status: skipped` with no steps.

---

## Time-Based / Supervisor Automations (Implemented)

**Status:** ✅ Done

### What was built

**Schema additions (Ticket model)**
- `lastAgentReplyAt DateTime?` — stamped on every agent reply; indexed
- `lastCustomerReplyAt DateTime?` — stamped on every inbound email customer reply; indexed
- `statusChangedAt DateTime?` — stamped whenever `status` changes; enables `hoursInCurrentStatus`
- `@@index([status, updatedAt])` — supports efficient supervisor scan queries

**Time-snapshot builder** (`server/src/lib/time-snapshot.ts`)

Builds a `TicketSnapshot`-compatible object enriched with computed duration fields for each entity type:

| Builder | Entity | Time fields computed |
|---------|--------|---------------------|
| `buildTicketTimeSnapshot` | Ticket | Full set (all 9 time metrics) |
| `buildIncidentTimeSnapshot` | Incident | ageHours, idleHours, hoursInCurrentStatus |
| `buildRequestTimeSnapshot` | ServiceRequest | ageHours, idleHours, hoursUntilSlaResolution, pendingApprovalHours |
| `buildChangeTimeSnapshot` | Change | ageHours, idleHours, hoursUntilSlaResolution (plannedEnd), pendingApprovalHours |
| `buildProblemTimeSnapshot` | Problem | ageHours, idleHours, hoursInCurrentStatus |

**Engine extensions**
- `runOnce` dedup implemented: if `rule.runOnce=true`, a completed execution for the same (ruleId, entityId) pair prevents re-firing — critical for one-shot escalations
- `loadTicketSnapshot` now includes `lastAgentReplyAt`, `lastCustomerReplyAt`, `statusChangedAt`
- `conditions.ts` resolves `time.*` prefix and direct time field names using numeric operators

**Time-supervisor worker** (`server/src/lib/check-time-supervisor.ts`)
- Queue: `check-time-supervisor`, cron `*/10 * * * *`
- Fast bail-out: skips all scanning if no enabled `time_supervisor` rules exist
- Scans all 5 entity types concurrently per cron tick
- Processes entities in batches of 50 to bound DB load
- Per entity: builds time-enriched snapshot, calls `runAutomationEngine({ category: "time_supervisor" })`
- Fires multiple trigger types per scan: `ticket.idle`, `ticket.sla_breached`, `incident.status_changed`, etc.
- Logs full scan summary including duration, entity counts, and rules matched

**Timestamp wiring**
- `replies.ts` → stamps `lastAgentReplyAt` on every agent reply (combined into existing `firstRespondedAt` update)
- `webhooks.ts` → stamps `lastCustomerReplyAt` on inbound email thread replies (fire-and-forget)
- `tickets.ts` → stamps `statusChangedAt` whenever status field changes in the PATCH handler

### Time-Based Conditions Supported

All values are in **floating-point hours**. Use numeric operators: `gt`, `gte`, `lt`, `lte`, `eq`.

| Field | Meaning |
|-------|---------|
| `ageHours` | Hours since ticket/entity was created |
| `idleHours` | Hours since any update (updatedAt proxy) |
| `hoursSinceLastReply` | Hours since any reply (agent or customer) |
| `hoursSinceLastAgentReply` | Hours since the last agent reply |
| `hoursSinceLastCustomerReply` | Hours since the last customer/inbound reply |
| `hoursUntilSlaFirstResponse` | Hours until first-response deadline; negative = already breached |
| `hoursUntilSlaResolution` | Hours until resolution deadline; negative = already breached |
| `hoursInCurrentStatus` | Hours since status last changed (`statusChangedAt`) |
| `hoursUnassigned` | Hours without an assignee; null if currently assigned |
| `pendingApprovalHours` | Hours waiting for approval (changes/requests); null if N/A |
| `isBusinessHours` | Boolean — Mon–Fri 09:00–17:00 in requester timezone |

Plus all existing conditions from the Ticket/Context/Requester categories.

### Actions Supported

All 29 actions from the automation platform — the same action engine handles time-based rules identically to event-based rules.

### How Execution Safety and Logs Work

**Safety mechanisms:**
1. **Fast bail-out**: worker skips all DB scans if no enabled `time_supervisor` rules exist (no cost when unused)
2. **runOnce dedup**: engine checks for an existing completed execution before running a `runOnce` rule — prevents spam escalations
3. **Batch processing**: entities are scanned in batches of 50 to prevent DB saturation on large instances
4. **Error isolation**: each entity scan is wrapped in try/catch; one bad entity never aborts the batch
5. **Single concurrency**: pg-boss ensures only one instance of the worker runs at a time

**Execution logs:**
Every rule evaluation creates an `AutomationExecution` row (status: completed/skipped/failed) with `meta` storing the scan source. Each action step is recorded as `AutomationExecutionStep`. The `ExecutionLogPanel` in the rule form shows the full history per rule with timestamps, matched/total count, and step drill-down.

**runOnce semantics:**
- `runOnce: true` → fires at most once per (rule, entity) pair, globally. Use for one-shot escalations, auto-close.
- `runOnce: false` → fires on every scan where conditions match. Use for recurring reminders, SLA warnings.

---

## Assignment & Capacity Routing (Implemented)

**Status:** ✅ Done

### What was built

**Schema (3 new models)**
- `AgentCapacityProfile` — per-agent: `isAvailable`, `maxConcurrentTickets`, `skills[]`, `languages[]`, `timezone`, `shiftStart/End`, `shiftDays[]`, `weight`
- `TeamRoutingConfig` — per-team: `strategy`, `respectCapacity`, `respectShifts`, `skillMatchMode`, `fallbackAgentId`, `fallbackTeamId`, `overflowAt`
- `RoutingDecision` — immutable audit log of every routing call: strategy used, candidate/eligible counts, selected agent, reason, fallback/overflow flags, duration

**Routing Service** (`server/src/lib/assignment-routing.ts`)

Full routing pipeline:
1. Load `TeamRoutingConfig` (defaults if not configured)
2. Load all team members + their `AgentCapacityProfile` + current open ticket counts (single query)
3. **Overflow check**: if avg load ≥ `overflowAt`, recursively route to `fallbackTeamId`
4. **Eligibility filters**: skip deleted agents; when `respectCapacity`: skip unavailable + at-capacity; when `respectShifts`: skip off-shift
5. **Language soft-preference**: bias toward agents who speak the requester's language without excluding others
6. **Skill filtering**: `required` (exclude 0-match agents) or `preferred` (bias ordering)
7. **Strategy dispatch**:
   - `round_robin` — even distribution using persistent RR counter (bug fixed: operator precedence)
   - `weighted_rr` — virtual slot expansion (agent weight 3 = 3 slots)
   - `least_loaded` — sort by openTickets ascending
   - `skill_based` — rank by skill match score (0–100); tie-break by load
   - `manual` — team-only, no agent selection
8. **Fallback**: if no eligible agent → try `fallbackAgentId`
9. **Log**: write `RoutingDecision` row

**New actions** (in automation engine)
- `assign_smart` — routes using the team's `TeamRoutingConfig` strategy; handles overflow
- `assign_by_skill` — explicit skill-based routing with required skills list

**Upgraded actions**
- `assign_round_robin` — now delegates through `roundRobinAgentId()` which uses the routing service with capacity filtering
- `assign_least_loaded` — now delegates through `leastLoadedAgentId()` with routing service

**API** (`/api/routing`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/routing/teams` | All teams with routing config + per-agent load |
| GET | `/api/routing/teams/:id` | Single team config |
| PATCH | `/api/routing/teams/:id` | Update team routing config (upsert) |
| DELETE | `/api/routing/teams/:id` | Reset config to defaults |
| GET | `/api/routing/agents` | All agents with capacity profiles + current load |
| GET | `/api/routing/agents/:id` | Single agent profile |
| PATCH | `/api/routing/agents/:id` | Update agent capacity profile (upsert) |
| GET | `/api/routing/decisions` | Routing decision audit log (filterable by team/agent/ticket) |
| POST | `/api/routing/preview` | Dry-run routing for a team without assigning |

**Admin UI** (`/automations/routing`)
- **Team Strategies tab**: per-team cards showing strategy badge, agent load bars, capacity-at-threshold warnings. Expandable to edit: strategy picker (5 options), skill match mode, overflow threshold, fallback team, toggles for capacity/shift enforcement
- **Agent Profiles tab**: table with availability toggle, load bar, skills, weight, shift hours. Inline edit form per agent
- **Decision Log tab**: table of recent routing decisions with strategy, candidate/eligible counts, selected agent, reason, fallback/overflow flags, duration
- **Routing** button added to the Automation Platform page header

### Routing Strategies Implemented

| Strategy | Description | When to use |
|----------|-------------|-------------|
| `round_robin` | Even distribution in turn order | Default; prevents any one agent hoarding tickets |
| `weighted_rr` | Proportional by agent weight (1–10) | Senior agents who should handle more; specialists in higher demand |
| `least_loaded` | Agent with fewest open tickets | Balancing active workload dynamically |
| `skill_based` | Highest skill match score; tie-break by load | Routing technical tickets to specialists |
| `manual` | Team-only, no agent selected | Queues where agents self-assign |

### How Assignment is Decided

```
assign_smart(teamId) called:
    1. Load TeamRoutingConfig for team
    2. Check overflow: avg_load ≥ overflowAt? → recurse to fallbackTeamId
    3. Load team members + AgentCapacityProfile + openTicketCount
    4. Filter: isAvailable, openTickets < max, isOnShift (if enabled)
    5. Language preference: prefer agents speaking requester's language
    6. Skill filter: exclude/bias by requiredSkills (per skillMatchMode)
    7. Apply strategy → select agentId
    8. Fallback: if no eligible agent → fallbackAgentId
    9. Log RoutingDecision
   10. Update ticket.assignedToId + notify agent
```

### Future Enhancements Recommended

1. **Agent availability status UI** — let agents set themselves away/available without admin PATCH
2. **Shift calendar** — visual weekly schedule per agent (currently just start/end times)
3. **Skill taxonomy management** — centralized list of skills with tag autocomplete
4. **Weighted load** — weight by ticket priority not just count (a critical ticket = 3× load)
5. **Hunt groups** — try agents sequentially until one accepts (with accept timeout)
6. **Timezone-matched routing** — match ticket business-hours to agent's shift without hardcoding overlap logic
7. **Capacity by entity type** — separate caps for tickets vs. incidents vs. changes
8. **Real-time presence** — replace the `isAvailable` boolean with heartbeat-based online status
9. **Historical routing analytics** — average assignment time, skill match rate, overflow rate per team

---

## Approval Automation + Notification Automation (Implemented)

**Status:** ✅ Done

---

### Approval Automation

**Reused infrastructure:**
- Full `ApprovalRequest` / `ApprovalStep` / `ApprovalDecision` / `ApprovalEvent` model (generic `subjectType` + `subjectId`)
- `createApproval()` engine function — multi-step, any/all modes, sequential/parallel, expiry
- `decide()` engine function — step advancement, auto-skip, final resolution
- Full approval audit trail via `ApprovalEvent` (append-only log)

**New additions:**
- `"ticket"` added to `approvalSubjectTypes` — automation rules can now create ticket-linked approvals
- `create_approval` action **implemented** (was stubbed): calls `createApproval()` with template-variable-resolved title/description, duplicate detection (skips if pending approval already exists), expiry, all/any mode, N-of-M required count
- `notify_approvers` action — finds all active pending `ApprovalStep` records for the ticket's open approval requests; notifies those approvers via configured channels with template-variable support
- Approval scanning in time-supervisor worker: `getActivePendingApprovalTicketIds()` loads ticket IDs with pending approval requests; scans them with `approval.pending` trigger so time-based rules can remind/escalate overdue approvals

**How approval automation integrates with workflows:**
1. **Intake rule** or **event_workflow** rule creates the approval via `create_approval` action
2. **Time-supervisor** scans tickets with pending approvals every 10 minutes; rules with `approval.pending` trigger + `pendingApprovalHours > N` conditions fire reminders via `notify_approvers`
3. When approver decides, `fireChangeEvent("change.approved")` or `fireRequestEvent("request.approved")` fires (already wired in approvals.ts) → event_workflow rules can continue the process
4. Full audit: every `create_approval` action logs to `AuditEvent`; every step decision logs to `ApprovalEvent`

---

### Notification Automation

**Reused infrastructure:**
- `notify()` function with in_app / email / slack / webhook channels
- `NotificationDelivery` model tracking per-channel delivery status
- Email channel renders `Template` DB records for rich HTML emails
- Slack channel via webhook URL; webhook channel for generic HTTP targets

**Notification Composer** (`server/src/lib/notification-composer.ts`)
- `resolveVars(template, ctx)` — replaces `{{namespace.field}}` placeholders
- `buildTemplateContext(snapshot)` — async: loads agent name + team name from DB
- `compose(template, snapshot)` — convenience async version used by action handlers
- Variables: `{{ticket.number}}`, `{{ticket.subject}}`, `{{ticket.status}}`, `{{ticket.priority}}`, `{{ticket.category}}`, `{{ticket.url}}`, `{{requester.name}}`, `{{requester.email}}`, `{{requester.org}}`, `{{agent.name}}`, `{{team.name}}`

**Extended `send_notification` action — 8 recipient types:**

| `recipientType` | Who receives it |
|----------------|----------------|
| `assignee` | The ticket's currently assigned agent |
| `team` | All members of the ticket's assigned team |
| `requester` | (skip in_app — use send_reply for email to customer) |
| `watchers` | All `TicketFollower` records for the ticket |
| `approvers` | All active pending approvers on the ticket's open approval requests |
| `supervisor` | All users with role "supervisor" or "admin" |
| `specific` | A single agent by userId |
| `specific_team` | All members of a named team (recipientTeamId) |

- Template variables resolved in `title` + `body` when `useTemplateVars: true` (default)
- Channel selector: in_app, email, slack

**`send_reply` action — now implemented (was stubbed):**
- Sends email to ticket's `senderEmail` via `sendEmailJob`
- Template variables resolved in subject + body
- Default subject: `Re: {{ticket.subject}}`
- Threads correctly (In-Reply-To header set from `emailMessageId`)

**New notification event types:**
- `automation.notification` — generic event for automation-triggered notifications
- `approval.overdue` — fired by overdue approval rules
- `approval.reminder` — fired by `notify_approvers` action

**UI — action forms updated:**
- `create_approval`: approver picker (click-to-toggle agent names), mode selector (all/any), N-of-M required count, description with template vars, expiry hours
- `send_notification`: full 8-recipient type picker, specific agent/team selectors, template variable hint bar
- `send_reply`: subject + body with template variable reference
- `notify_approvers`: title + body with template variable support

### Channels and Targets Supported

| Channel | How configured | What it sends |
|---------|---------------|---------------|
| `in_app` | Always available | Creates `Notification` + `NotificationDelivery` row; read via notification center |
| `email` | SendGrid API key in Settings → Integrations | Renders `Template` DB record for event; falls back to plain text |
| `slack` | `SLACK_WEBHOOK_URL` env var | Block Kit formatted message with entity title + View button |
| `webhook` | `NOTIFICATION_WEBHOOK_URL` env var | Generic HTTP POST with JSON payload |

### Template and Delivery Integration

```
send_notification action fires:
    1. compose(title, snapshot) → resolve {{variables}}
    2. resolve recipientIds by recipientType
    3. notify({ event: "automation.notification", recipientIds, channels })
       → creates Notification row per recipient
       → creates NotificationDelivery row per channel (status: pending)
    4. Email channel: deliverEmail() → looks up Template for event
       → renders HTML/text → sendEmailJob() → updates delivery status
    5. Slack channel: deliverSlack() → Block Kit POST → updates status
    6. Delivery status tracked in NotificationDelivery (pending→sent/failed/skipped)
    7. ExecutionLogPanel shows action results including recipient count
```

---

## Phase 2 — Condition Builder & Engine Integration

**Target:** Next sprint

### Tasks

1. **Visual condition builder** (client)
   - AND/OR group tree UI in `AutomationRuleFormPage`
   - Drag-and-drop condition reordering
   - Field type-aware operator filtering (string vs. enum vs. number)
   - Built-in field picker + custom field support

2. **Engine integration into ticket lifecycle**
   - Call `runAutomationForTicket("ticket.created")` in `POST /api/tickets`
   - Call `runAutomationForTicket("ticket.updated")` in `PATCH /api/tickets/:id`
   - Call `runAutomationForTicket("ticket.reply_received")` in `POST /api/tickets/:id/replies`
   - Call `runAutomationForTicket("ticket.sla_breached")` in `check-sla` worker

3. **Time-based rule scheduler**
   - New pg-boss queue: `check-time-automation`
   - Worker scans open tickets for idle/age/pending_since rules
   - Registered alongside existing SLA checker
   - Configurable scan interval via settings

4. **Execution dashboard**
   - `/automations/executions` — global execution feed
   - Per-rule execution history with step drill-down
   - Status filter (running / completed / failed / skipped)

---

## Phase 3 — Approval & Notification Automation

**Target:** Sprint +2

### Tasks

1. **`create_approval` action** (currently stubbed as `not_yet_implemented`)
   - Integrate with existing `approval-engine.ts`
   - Support `approvalMode: "all" | "any"` + custom approver lists
   - Wire to `change.submitted_for_approval` and `request.created` triggers

2. **Configurable notification rules**
   - Full `send_notification` implementation with template variable substitution
   - `channels: ["in_app", "email", "slack"]` routing
   - Per-recipient preference checks before delivery

3. **Supervisor rules UI**
   - Dedicated section for time-based rules with schedule preview
   - SLA threshold calculator

4. **`set_severity`, `set_impact`, `set_urgency` actions**
   - Currently stubbed; wire to ticket update with proper enum validation

---

## Phase 4 — Outbound Webhook Delivery Worker

**Target:** Sprint +3

### Tasks

1. **`send-webhook` pg-boss queue**
   - Worker picks up pending `WebhookDelivery` rows
   - HTTP delivery with configurable timeout and retry backoff
   - HMAC-SHA256 signing if `signingSecret` is set
   - Updates `WebhookDelivery.status` to `delivered` or `failed`

2. **Retry with exponential backoff**
   - `retryLimit` × attempts before marking permanently failed
   - Jitter to avoid thundering herd on recoveries

3. **Webhook event fan-out**
   - Call `dispatchWebhookEvent(event, entityType, entityId)` from ticket/incident lifecycle
   - Filter webhooks by subscribed event before enqueuing delivery
   - Apply per-webhook `filters` condition tree

4. **Delivery UI enhancements**
   - Per-delivery detail view with request/response body
   - Manual retry button for failed deliveries
   - Webhook health status (last 30 days delivery rate)

---

## Phase 5 — Advanced Routing & Skill-Based Assignment

**Target:** Sprint +4

### Tasks

1. **Agent skill/availability model**
   - `AgentSkill` model linking agents to skill tags
   - Agent availability status (online/offline/busy)
   - `assign_by_skill` action type

2. **Weighted round-robin**
   - Configurable weight per team member
   - Routing bias toward senior/specialized agents

3. **Queue capacity limits**
   - Per-agent max concurrent ticket cap
   - `assign_least_loaded` respects capacity limits; falls back to team assignment

4. **Assignment rules UI**
   - Dedicated view for all assignment routing rules
   - Visual assignment chain preview

---

## Phase 6 — Change & Incident Automation

**Target:** Sprint +5

### Tasks

1. **Incident trigger wiring**
   - `incident.created`, `incident.severity_changed` in engine
   - Auto-escalate to major incident on SEV1

2. **Change automation**
   - `change.created`, `change.submitted_for_approval` triggers active
   - Auto-route CAB approval request on change creation

3. **`create_incident` action**
   - Creates a linked incident from a ticket
   - Copies subject, body, priority, assignedTo

4. **Problem linkage automation**
   - Auto-link repeated incidents to known problems
   - Trigger: `incident.created`, condition: similar tickets > N

---

## Phase 7 — Cron / Scheduled Automations

**Target:** Sprint +6

### Tasks

1. **`schedule.cron` trigger**
   - Parse cron expression from trigger config
   - Register in pg-boss with `schedule()` API
   - Fan out to all entities matching the rule's conditions

2. **Scheduled automation management UI**
   - Show next/last run time
   - Manual trigger button
   - Cron expression editor with human-readable preview

3. **Audit log for scheduled runs**
   - Record cron execution as automation run with timestamp
   - Retain for 90 days

---

## Integration Points

### Currently wired
- `runAutomationForTicket()` exported and ready to call from ticket routes
- Capacity routing hooks into `TeamMember` + `Ticket` tables (no new schema)
- `WebhookDelivery` rows created by `trigger_webhook` action (pending worker)

### Hooks to add (Phase 2)
```typescript
// In server/src/routes/tickets.ts — POST /api/tickets
await runAutomationForTicket(ticket.id, "ticket.created");

// In server/src/routes/tickets.ts — PATCH /api/tickets/:id
await runAutomationForTicket(ticket.id, "ticket.updated", { changedFields });

// In server/src/lib/check-sla.ts
await runAutomationForTicket(ticketId, "ticket.sla_breached");
```

---

## Files Changed (Phase 1)

### New files
```
core/constants/automation.ts
core/schemas/automations.ts
server/src/lib/automation-engine/index.ts
server/src/lib/automation-engine/types.ts
server/src/lib/automation-engine/conditions.ts
server/src/lib/automation-engine/actions.ts
server/src/lib/automation-engine/capacity-routing.ts
server/src/routes/automations.ts
server/src/routes/outbound-webhooks.ts
client/src/pages/automations/AutomationPlatformPage.tsx
client/src/pages/automations/AutomationRuleFormPage.tsx
client/src/pages/automations/OutboundWebhooksPage.tsx
AUTOMATION_PLATFORM_ROADMAP.md
```

### Modified files
```
core/constants/permission.ts          — added automations.* + webhooks.* permissions
server/prisma/schema.prisma           — added 5 new models + User relations
server/src/index.ts                   — mounted /api/automations + /api/webhooks/outbound
client/src/App.tsx                    — replaced /automations with platform routes
```
