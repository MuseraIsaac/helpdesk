# Automation Platform Architecture

Enterprise-grade automation engine for the ITSM helpdesk. Covers the full
service-desk automation lifecycle: ticket intake, event-driven workflows,
time-based supervision, assignment routing, approval orchestration,
notifications, data enrichment, record lifecycle management, and outbound
integrations.

---

## Table of Contents

1. [Overview](#overview)
2. [Categories](#categories)
3. [Data Model](#data-model)
4. [Engine Architecture](#engine-architecture)
5. [Trigger Types](#trigger-types)
6. [Action Types](#action-types)
7. [Condition System](#condition-system)
8. [Data Enrichment & Field Automation](#data-enrichment--field-automation)
9. [Record Lifecycle Automation](#record-lifecycle-automation)
10. [Assignment Routing](#assignment-routing)
11. [API Surface](#api-surface)
12. [Governance & Observability](#governance--observability)
13. [UI Architecture](#ui-architecture)
14. [Permission Model](#permission-model)
15. [Extension Points](#extension-points)

---

## Overview

The Automation Platform is a rule-based orchestration engine that evaluates
conditions against ITSM entity snapshots and executes ordered action plans.
Rules are organized into 9 functional categories, each with its own trigger
set and action vocabulary.

**Key design principles:**

- **Idempotent actions** — every handler checks current state and returns
  `skipped` rather than applying a no-op change
- **No-throw contract** — handlers return `ActionResult { errorMessage }` on
  failure; the engine never propagates exceptions to callers
- **Full audit trail** — every rule evaluation and every action applied is
  persisted to `AutomationExecution` + `AutomationExecutionStep`
- **Governance by default** — version counter increments on every edit;
  `createdById` / `updatedById` track authorship without extra tables
- **Future-proof custom fields** — `set_custom_field` and enrichment actions
  write into the `ticket.customFields` JSON column; no migration needed
  for new custom fields

---

## Categories

| Category | Label | Description |
|---|---|---|
| `intake_routing` | Intake & Routing | Auto-classify, tag, and route tickets as they arrive from any channel |
| `event_workflow` | Event Workflows | Trigger actions when tickets or ITSM records change state |
| `time_supervisor` | Time-Based Rules | Act on tickets that have been idle, at risk, or breached SLA |
| `assignment_routing` | Assignment Routing | Round-robin, least-loaded, and skill-based assignment automation |
| `approval_automation` | Approval Automation | Auto-create approval requests when conditions are met |
| `notification_automation` | Notification Rules | Send targeted notifications to agents, teams, and requesters |
| `field_automation` | Field Automation | Enrich and set ticket fields based on content, source, or context |
| `lifecycle` | Lifecycle Rules | Auto-close, auto-resolve, reopen, and manage cross-record orchestration |
| `integration_webhook` | Integrations | Fire outbound webhooks and connect external systems on events |

---

## Data Model

### Core tables

```
AutomationRule
  id, name, description, category, isEnabled, order
  triggers    Json[]   — array of trigger objects (discriminated by .type)
  conditions  Json     — AND/OR condition tree
  actions     Json[]   — array of action objects (discriminated by .type)
  runOnce     Boolean  — dedup: fire once per (rule, entity) combination
  stopOnMatch Boolean  — halt rule evaluation after this rule matches
  version     Int      — incremented on every PATCH; governance foundation
  createdById, updatedById → User
  createdAt, updatedAt

AutomationExecution
  id, ruleId → AutomationRule
  entityType ("ticket" | "incident" | "change" | "request")
  entityId, trigger, status ("completed" | "failed" | "skipped")
  startedAt, completedAt
  meta Json  — previousValues, actorId, extra context

AutomationExecutionStep
  id, executionId → AutomationExecution
  actionType, applied Bool
  skippedReason, errorMessage
  meta Json

OutboundWebhook
  id, name, url, method, headers, signingSecret
  events String[]  — event filter
  isEnabled, retryLimit, timeoutMs
  WebhookDelivery[] — delivery audit log

AgentCapacityProfile   — per-agent routing preferences & capacity limits
TeamRoutingConfig      — per-team strategy, overflow, fallback
RoutingDecision        — audit log for every routing call
```

---

## Engine Architecture

```
runAutomationEngine(ctx: EngineRunContext)
  │
  ├── Load enabled rules for ctx.trigger (ordered by .order ASC)
  ├── For each rule:
  │     ├── runOnce dedup check (AutomationExecution exists?)
  │     ├── evaluateConditions(rule.conditions, snapshot) → bool
  │     ├── If matched: executeActions(rule.actions, snapshot)
  │     │     └── executeAutomationAction(action, snapshot)
  │     │           ├── enrichment.ts   (enrich_from_*, set_custom_field, etc.)
  │     │           ├── lifecycle.ts    (close_stale, create_linked_*, merge_into_ticket, etc.)
  │     │           ├── actions.ts      (all other action types)
  │     │           └── → ActionResult { applied, skippedReason?, errorMessage? }
  │     ├── Persist AutomationExecution + AutomationExecutionStep rows
  │     └── If rule.stopOnMatch: break
  └── Return EngineRunResult[]
```

### Snapshot

The engine operates on a `TicketSnapshot` — a pre-loaded, enriched view of
the ticket state. It includes:

- All ticket columns
- Email intake metadata (`emailMessageId`, `emailTo`, `isAutoReply`, `isBounce`, etc.)
- Computed virtual fields (`senderDomain`, `isBusinessHours`)
- Requester / org enrichment (`requesterIsVip`, `orgSupportTier`, `orgCountry`, etc.)
- Time metrics (`ageHours`, `idleHours`, `hoursUntilSlaResolution`, etc.)
- Lifecycle cross-record flags (`hasLinkedIncident`, `hasLinkedProblem`, `isMerged`, etc.)
- Previous values (populated from event metadata for changed-field conditions)
- Custom fields (`customFields: Record<string, unknown>`)

---

## Trigger Types

### Ticket (19)
`ticket.created` `ticket.updated` `ticket.status_changed` `ticket.assigned`
`ticket.unassigned` `ticket.escalated` `ticket.deescalated` `ticket.reply_received`
`ticket.reply_sent` `ticket.note_added` `ticket.priority_changed`
`ticket.category_changed` `ticket.due_date_changed` `ticket.custom_field_changed`
`ticket.sla_warning` `ticket.sla_breached` `ticket.idle` `ticket.pending_since`
`ticket.age`

### Lifecycle triggers (additional)
`ticket.reopened` `ticket.merged`

### Incident (6)
`incident.created` `incident.severity_changed` `incident.status_changed`
`incident.assigned` `incident.resolved` `incident.closed`

### Change (6)
`change.created` `change.submitted_for_approval` `change.approved`
`change.rejected` `change.implemented` `change.rolled_back`

### Request (4)
`request.created` `request.status_changed` `request.approved` `request.rejected`

### Problem (4)
`problem.created` `problem.updated` `problem.status_changed` `problem.resolved`

### Approval (2)
`approval.pending` `approval.overdue`

### Schedule (1)
`schedule.cron` — arbitrary cron expression + timezone

---

## Action Types

### Field actions (8)
`set_field` `set_priority` `set_category` `set_status` `set_type`
`set_severity` `set_impact` `set_urgency`

### Tag actions (2)
`add_tag` `remove_tag`

### Assignment actions (7)
`assign_agent` `assign_team` `assign_round_robin` `assign_least_loaded`
`assign_smart` `assign_by_skill` `unassign`

### Communication actions (7)
`add_note` `send_reply` `send_notification` `send_auto_reply`
`notify_watchers` `notify_requester` `notify_approvers`

### Lifecycle actions (5)
`escalate` `deescalate` `resolve` `close` `reopen`

### Approval & SLA actions (4)
`create_approval` `pause_sla` `resume_sla` `set_affected_system`

### Integration actions (2)
`trigger_webhook` `create_incident`

### Control flow (1)
`stop_processing`

### Intake-specific actions (4)
`suppress_creation` `mark_spam` `quarantine` `add_watcher`

### Event workflow actions (2)
`create_linked_task` `chain_workflow`

### Data Enrichment & Field Automation actions (8)
`enrich_from_requester` `enrich_from_domain` `enrich_from_keywords`
`enrich_from_mailbox` `set_custom_field` `map_field` `infer_priority`
`copy_field`

### Record Lifecycle Automation actions (9)
`close_stale` `create_linked_problem` `create_linked_change`
`create_linked_request` `create_child_ticket` `create_follow_up`
`link_to_problem` `update_linked_records` `merge_into_ticket`

---

## Condition System

Conditions form an AND/OR tree of arbitrary depth:

```typescript
type AutomationCondition =
  | { type: "group"; operator: "AND" | "OR"; conditions: AutomationCondition[] }
  | { type: "condition"; field: string; operator: ConditionOperator; value: unknown }
```

### Operators (15)
`eq` `neq` `contains` `not_contains` `starts_with` `ends_with`
`is_empty` `is_not_empty` `in` `not_in` `gt` `gte` `lt` `lte` `matches_regex`

### Field namespaces

| Prefix | Examples |
|---|---|
| `email.*` | `email.from`, `email.subject`, `email.isAutoReply` |
| `requester.*` | `requester.isVip`, `requester.supportTier`, `requester.jobTitle` |
| `org.*` | `org.supportTier`, `org.country`, `org.industry` |
| `previous.*` | `previous.status`, `previous.priority` |
| `changed.*` | `changed.status` (boolean) |
| `time.*` | `time.ageHours`, `time.hoursUntilSlaResolution` |
| `linked.*` | `linked.problemId`, `linked.incidentId` |
| `custom_*` | `custom_department`, `custom_business_unit` |
| (flat) | `status`, `priority`, `category`, `hasLinkedIncident`, `isMerged` |

---

## Data Enrichment & Field Automation

The `field_automation` category provides 8 action types for intelligent field
population.

### enrich_from_requester
Reads Customer + Organization database records and maps attributes to ticket
fields. Supports: `language`, `timezone`, `supportTier`, `orgName`, `jobTitle`,
`isVip`, `country`, `preferredChannel`, `orgIndustry`, `orgCountry`.

```json
{
  "type": "enrich_from_requester",
  "mappings": [
    { "source": "supportTier", "targetField": "custom_sla_tier", "onlyIfEmpty": true },
    { "source": "orgName",     "targetField": "custom_company",  "onlyIfEmpty": true }
  ]
}
```

### enrich_from_domain
Matches the sender's email domain against a configurable table. Sets fields
or custom fields per domain. `*` acts as a wildcard/fallback row (matched last).

```json
{
  "type": "enrich_from_domain",
  "mappings": [
    { "domain": "bigcorp.com", "field": "priority",       "value": "high"   },
    { "domain": "bigcorp.com", "field": "custom_company", "value": "BigCorp" },
    { "domain": "*",           "field": "priority",       "value": "medium"  }
  ],
  "firstMatchOnly": false
}
```

### enrich_from_keywords
Matches keyword patterns against subject, body, or both. Sets fields when any
keyword matches.

```json
{
  "type": "enrich_from_keywords",
  "patterns": [
    { "keywords": ["VPN", "remote access"], "matchIn": "both", "field": "category",        "value": "network"  },
    { "keywords": ["urgent", "ASAP"],       "matchIn": "both", "field": "priority",        "value": "high"     },
    { "keywords": ["payroll", "salary"],    "matchIn": "both", "field": "custom_department","value": "HR"       }
  ],
  "firstMatchOnly": false
}
```

### enrich_from_mailbox
Sets fields based on the inbound mailbox alias (`ticket.mailboxAlias`).

### set_custom_field
Generic key/value writer for the `ticket.customFields` JSON column.
**Any future custom field is automatically supported without code changes.**

```json
{ "type": "set_custom_field", "key": "business_unit", "value": "EMEA", "onlyIfEmpty": true }
```

### map_field
Lookup table: reads source field value → writes mapped value to target field.
Supports fallback for unmapped values.

### infer_priority
Computes ticket priority from the 3×3 impact × urgency matrix. Only fires
when both `impact` and `urgency` fields are set.

### copy_field
Copies any field value to another field with optional
`uppercase` / `lowercase` / `trim` transform.

### Future custom fields
Custom fields are stored in `ticket.customFields: Json`. Any `set_custom_field`
or enrichment action targeting `custom_<key>` writes directly to this column.
No Prisma migration is needed to add new custom fields — they're defined
by convention (`custom_department`, `custom_ci_name`, etc.) and the condition
system resolves `custom_*` field paths automatically.

---

## Record Lifecycle Automation

The `lifecycle` category provides 9 action types for cross-record orchestration
with strict safety guardrails.

### Safety matrix

| Action | Guardrail |
|---|---|
| `close_stale` | Only closes tickets in `allowedFromStatuses` (default: open, in_progress, escalated). Skips closed/resolved. |
| `create_linked_problem` | `skipIfLinked` prevents duplicate ProblemTicketLink creation |
| `create_linked_change` | Note-based dedup; checks for existing "Linked Change:" note |
| `create_linked_request` | Note-based dedup; checks for existing "Linked Service Request:" note |
| `create_child_ticket` | Parent reference stored in `customFields.parentTicketId` — no migration |
| `create_follow_up` | Pinned note only — non-destructive |
| `link_to_problem` | Validates problem exists; `skipIfLinked` prevents duplicate links |
| `update_linked_records` | Per-record-type failure isolation; skips if no linked records found |
| `merge_into_ticket` | Refuses: self-merge, already-merged source/target, closed target |

### Auditability
Every lifecycle action writes:
1. An `AuditEvent` via `logAudit()` with structured metadata
2. An `AutomationExecutionStep` row in the execution history
3. An internal `Note` on the ticket for human-readable context (close_stale, merge, create_*)

---

## Assignment Routing

Five routing strategies with capacity-aware filtering:

| Strategy | Description |
|---|---|
| `round_robin` | Persistent counter; deterministic turn order |
| `weighted_rr` | Virtual slot expansion proportional to agent weight |
| `least_loaded` | Agent with fewest open tickets |
| `skill_based` | Score agents by skill match (0–100); filter by mode (required/preferred) |
| `manual` | Team assignment only; no agent selection |

**5-stage filtering pipeline:**
1. Skip deleted/inactive users
2. Skip unavailable or at-capacity agents (when `respectCapacity`)
3. Skip off-shift agents (when `respectShifts`)
4. Skill matching and scoring
5. Language soft-preference

Overflow recursion: if team avg load ≥ `overflowAt`, route to `fallbackTeamId`.
Every routing decision is persisted to `RoutingDecision` for audit.

---

## API Surface

### Rule management
```
GET    /api/automations                   list rules (filter: category, isEnabled, q)
POST   /api/automations                   create rule
GET    /api/automations/:id               fetch rule + last execution
PATCH  /api/automations/:id               update rule (version++ on every change)
DELETE /api/automations/:id               delete rule
PATCH  /api/automations/:id/toggle        enable / disable
POST   /api/automations/:id/clone         clone (creates disabled copy)
POST   /api/automations/reorder           reorder within category
```

### Testing & observability
```
POST   /api/automations/:id/test          dry-run against a real entity
GET    /api/automations/:id/executions    per-rule execution history
GET    /api/automations/executions        global execution log (all rules)
GET    /api/automations/governance        rule change history (version + authorship)
GET    /api/automations/categories        category metadata
```

### Routing & webhooks
```
GET    /api/routing/teams                 team routing configs
PATCH  /api/routing/teams/:id             upsert team config
GET    /api/routing/agents                agent capacity profiles
PATCH  /api/routing/agents/:id            upsert agent profile
GET    /api/routing/decisions             routing decision audit log
POST   /api/routing/preview               dry-run routing

GET    /api/webhooks/outbound             list webhooks
POST   /api/webhooks/outbound             register webhook
PATCH  /api/webhooks/outbound/:id/toggle  enable / disable
POST   /api/webhooks/outbound/:id/ping    test ping
GET    /api/webhooks/outbound/:id/deliveries delivery history
```

---

## Governance & Observability

### Version tracking
Every `PATCH` to an `AutomationRule` increments `version`. The rule form
displays the version badge (`v3`, `v12`, etc.) alongside the modification
author and timestamp.

### Authorship
`createdById` and `updatedById` are always set. The Governance panel in the
UI shows: who created each rule, who last modified it, when, and current
version number.

### Execution audit trail
`AutomationExecution` + `AutomationExecutionStep` give a complete per-rule,
per-entity, per-action record. Every step logs:
- `applied: true/false`
- `skippedReason` (e.g. `"already_set"`, `"no_eligible_agents"`)
- `errorMessage` on failure
- `meta` for structured context (field values, agent IDs, etc.)

### Clone safety
Cloned rules are **always created disabled**. The operator must explicitly
enable them after reviewing. The UI shows a toast confirming this.

### Destructive action warnings
The rule form displays a visible amber warning panel when any action in the
rule is classified as destructive:
`suppress_creation`, `mark_spam`, `quarantine`, `close_stale`,
`merge_into_ticket`, `resolve`, `close`

### Dry-run test
`POST /api/automations/:id/test` evaluates the rule against a real entity and
returns the full engine result (conditions matched, each action result). The
test IS recorded in execution history so it appears in the Execution Log.

---

## UI Architecture

### Automation Platform Page (`/automations`)
Two-panel layout:

**Left sidebar:**
- All Rules
- Per-category nav (9 categories with rule count + active badges)
- Routing Config (link)
- Outbound Webhooks (link)
- Execution Log (section)
- Governance (section)

**Right content pane (category panel):**
- Category header + description + active/disabled counts
- Search + status filter (All / Active / Disabled) toolbar
- Dense rule table: order, status dot, name+description+author, triggers, actions, last run, total runs, toggle switch, actions menu

**Rule table features:**
- `▪` green dot = active, grey = disabled, red pulsing = active but last run failed
- Trigger/action cell shows count badge + first item label with tooltip listing all
- ⚠ icon on rows containing destructive actions
- `once` badge for `runOnce` rules
- Inline toggle switch (enable/disable without leaving the list)
- Row-level dropdown: Edit, Clone, Execution History, Enable/Disable, Delete (with confirm dialog)

### Execution Log Page (`/automations/executions`)
Full-page cross-rule execution log. Expandable rows show per-step detail.
Filters: category, status. Pagination.

### Governance Panel (inline in platform page)
Readonly table: rule name, category, status, version, created-by + date,
last-modified-by + relative time, total run count.

### Rule Form Page (`/automations/rules/:id`)
- Version badge (`v3`) + Active/Disabled status chip in header
- Rule summary auto-generated: "When [trigger] — [actions summary]"
- Author + last-modified line below title
- Destructive action warning banner (amber, lists each destructive action)
- Tabbed: Rule (form) | Execution Log (history panel)
- Test Run button → dry-run dialog with JSON result
- Clone button → creates disabled copy, navigates to it

---

## Permission Model

| Permission | Admin | Supervisor | Agent | ReadOnly |
|---|---|---|---|---|
| `automations.view` | ✓ | ✓ | | ✓ |
| `automations.manage` | ✓ | | | |
| `automations.test` | ✓ | ✓ | | |
| `webhooks.view` | ✓ | | | |
| `webhooks.manage` | ✓ | | | |

---

## Extension Points

### Adding a new action type
1. Add the type to `AutomationActionType` in `core/constants/automation.ts`
2. Add a label to `AUTOMATION_ACTION_LABELS`
3. Add a Zod schema in `core/schemas/automations.ts` and register in the union
4. Add a handler in the appropriate engine file (`enrichment.ts`, `lifecycle.ts`, or `actions.ts`)
5. Add a `case` in `executeAutomationAction()` in `actions.ts`
6. Add UI controls in `ActionRow` in `AutomationRuleFormPage.tsx`

### Adding a new trigger type
1. Add to `AutomationTriggerType` and `AUTOMATION_TRIGGER_LABELS`
2. Add the trigger to the relevant `CATEGORY_TRIGGERS` entries
3. Add a schema variant to `automationTriggerSchema`
4. Wire `fireEvent()` at the callsite in the relevant route
5. Add condition fields to `ConditionBuilder.tsx` if the trigger introduces new virtual fields

### Adding a new category
1. Add to `AutomationCategory` and `AUTOMATION_CATEGORIES`
2. Add an icon to `CATEGORY_ICONS` in the platform page
3. Add `CATEGORY_TRIGGERS` entries
4. Add `CATEGORY_DEFAULT_TRIGGERS` entry

### Adding new custom fields (no backend changes required)
Use `set_custom_field` action with the desired key. The field is read from
`ticket.customFields` JSON automatically. Add it to `ENRICHABLE_FIELDS`
in the form page for a nicer UI experience.
