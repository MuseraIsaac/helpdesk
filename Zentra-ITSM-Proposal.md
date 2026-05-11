# Zentra ITSM — Product Proposal

> **Enterprise ITSM, built for service teams that own outcomes.**
> One platform for the full ITIL service lifecycle — incidents, requests, problems,
> changes, assets, and knowledge — on a single record of truth, with the automation,
> governance, and visibility a modern operation depends on.

---

## 01 · Executive summary

Zentra ITSM is an enterprise-grade service management platform that gives IT, operations, and service teams everything they need to run their day — and prove the outcome at the end of it. Tickets, incidents, requests, problems, changes, assets, knowledge, automation, and reporting are integrated on one data model, on one modern interface, with audit-grade traceability throughout.

Built for organisations that take service quality seriously, Zentra eliminates the sprawl of disconnected helpdesk tools and brings the entire service motion — capture, triage, resolve, govern, learn — into a single, configurable environment.

| | |
| ---: | :--- |
| **12** | ITIL practices |
| **30+** | Built-in reports |
| **100+** | Scoped permissions |
| **15+** | Integrated modules |

**Who this is for:** Internal IT organisations, shared-service operations teams, managed service providers, and any business whose service quality is a competitive asset.

---

## 02 · Product overview

Zentra is a unified ITSM platform that handles every stage of the service lifecycle on the same record of truth. Where most organisations stitch together a ticketing tool, a CMDB, a change-board spreadsheet, an asset register, a knowledge wiki, and a manual approvals chain, Zentra brings all of those into one coherent operation — without forcing teams to compromise on depth.

### Problems Zentra solves

- **Slow, inconsistent ticket handling** — agents lose time switching tools, re-typing context, chasing approvals.
- **No visibility into SLA risk** — breaches are noticed after the fact, not before.
- **Disconnected assets and operations** — incidents reference systems no one can trace.
- **Manual approval and routing** — change boards and intake rules live in people's heads.
- **Reporting that can't keep up** — leadership reaches for monthly counts, not real-time signal.
- **Governance without evidence** — audit trails are reconstructed in retrospect, not captured by the system.

---

## 03 · Key business value

| | Outcome |
| :--- | :--- |
| **Service delivery** | Faster, more consistent resolution via AI-assisted intake, knowledge surfacing, saved replies, and a keyboard-first agent console. |
| **SLA & control** | Breach risk surfaced before it breaches — per-priority SLAs with business calendars, pause/resume on hold, live operations console. |
| **Governance** | Audit-grade automation and approvals — every rule, every approval, every state change in an append-only log. |
| **Asset control** | Hardware, software, SaaS, and licenses on one ledger with real relationships. |
| **Workflow efficiency** | Intake routing, escalations, approvals, and integrations run automatically — every step recorded. |
| **Visibility** | Live dashboards, scheduled exports, leaderboards, curated reports — operational signal, not weekly spreadsheets. |
| **Accountability** | ITIL 4 practices configured by default — one record-of-truth across incident, request, problem, change, KB. |
| **Scale** | Multi-team routing, custom roles, custom fields, custom statuses, outbound webhooks. |

---

## 04 · Core features & modules

### Service Desk & Ticketing
Modern, keyboard-first ticketing with multi-channel intake (email, portal, agent UI, API), saved views, bulk actions, ticket merging, watchers, internal notes, AI summaries, customer history, and a full conversation timeline. Every ticket carries triage controls (priority, severity, impact, urgency), SLA deadlines, and escalation history.
**Why it matters:** agents spend their time resolving — not navigating.

### Incident Management
A dedicated incident track with severity grades (sev1–sev4), assignable commander, real-time presence, video bridge integration (Zoom · Teams · Google Meet · Webex), structured post-incident updates, and a major-incident command room. Incidents link to problems, changes, assets, CIs, and the source ticket.
**Why it matters:** when something is on fire, coordination is the bottleneck. Zentra turns major incidents into a controlled, recorded operation.

### Service Request Management
A configurable service catalog with category groupings, per-item approval requirements, and a complete request-to-fulfillment workflow including tasks, approvals, and status history.
**Why it matters:** standard work — onboarding, access, software installs — becomes documented, repeatable, auditable.

### Problem Management
Structured problem records with root-cause fields, workaround documentation, and links to the recurring incidents they explain.
**Why it matters:** stop solving the same incident twenty times.

### Change Management
Standard, normal, and emergency change types with rollback plans, real CAB groups, multi-step approvals, schedule conflict detection against other planned changes, and a rollback-used flag for PIR.
**Why it matters:** change is the most common source of unplanned downtime; Zentra puts a governance perimeter around it.

### Asset Management & CMDB
Hardware, software, configuration items, SaaS subscriptions, software licenses, and contracts — with real CI relationships, lifecycle states, locations, financial details, and renewal tracking. Includes discovery-sync framework, CSV import, and renewal alerts.
**Why it matters:** incidents reference real systems; changes reference real CIs; procurement decisions reference real usage.

### Approval Engine
Multi-step approvals with parallel and sequential modes, configurable quorums, expiration windows, escalation chains, and full ApprovalEvent audit history. Used by Changes, Service Requests, and any record that needs a structured sign-off.
**Why it matters:** approvals become governance evidence with clear ownership and clear deadlines.

### Knowledge Base
First-class KB with categories, draft / in-review / approved workflow, public / internal visibility, and a separate public search endpoint for the customer portal. Articles surface inside the agent console at the moment of work.
**Why it matters:** the second time a ticket is solved is faster than the first — but only if the answer is captured.

### Automation Platform
A no-code rule engine with structured triggers, AND/OR conditions over any field or computed property, and a rich action catalog (assignment, status changes, notifications, tags, approvals, outbound webhooks, linked-record creation, custom-field updates, and more). Every run is recorded with applied / skipped / failed state per action.
**Why it matters:** rules previously living in shift handovers become captured, testable, and audited.

### AI & Intelligence
OpenAI-powered intake classification, AI auto-resolution for high-confidence tickets, reply polishing, AI ticket summaries, and a copilot surface on the ticket detail page. Governed and auditable — not a black box.

### Reporting & Analytics
Thirty-plus curated reports across SLA compliance, agent leaderboards, ticket aging, FCR, channel mix, and trends. Custom report views, scheduled exports, Excel / CSV export, and insight dashboards for service-health, asset-health, and ticket-volume signal.

### Operations Dashboards
Pre-built dashboards for Ops Command Center, Quality & SLA Monitor, Agent Performance, and Manager Summary — with a customizer for every leader. Real-time updates over a live event stream.

### Notifications
Unified template-driven notifications across email and in-app channels, with per-event templates and follower / watcher subscriptions.

### Teams & Intelligent Routing
Routing strategies — round-robin, least-loaded, skill-based, and "smart" (workload + expertise + SLA risk) — with per-team configuration and shift-aware availability.

### Customers, Organizations & Entitlements
CRM-grade view of every requester: customer entity, parent organisation, support tier, VIP flag, contract scope. Service entitlements drive SLA, priority caps, and routing scope per organisation.

### Admin, Customization & Configuration
Custom ticket types, custom statuses, custom fields, a visual form builder, custom roles, and a 100+ permission catalog — all editable by admins at runtime.

### Audit Log & Governance
Every privileged action — assignment, status change, rule execution, approval response — captured in an append-only audit log with actor, target, before/after values, and timestamp. Exportable to JSON or CSV.

### Email Integration
Inbound email via SendGrid Inbound Parse or IMAP, with full attachment handling, thread reconstruction by Message-ID, spam scoring, quarantine workflow, and intake routing rules.

### Customer Self-Service Portal
A polished portal where end-users can register, raise tickets and requests, track progress, exchange messages with agents, browse the public knowledge base, and view their own SLA status.

### System Monitoring
Built-in admin monitoring console surfacing health of API replicas, database, job queue, scheduled jobs, and upstream providers.

---

## 05 · Automation & intelligence

Zentra treats automation as a first-class part of the operation — not a side panel. Every routine action can be encoded as a rule, governed by conditions, and recorded in an audit log.

| Capability | What it does | Business outcome |
| :--- | :--- | :--- |
| Intake routing | Categorises and routes by keyword, domain, mailbox, requester profile, support tier, channel. | Right team, right priority, in seconds. |
| AI classification | OpenAI-driven category & priority prediction on every inbound. | Faster triage; fewer mis-routes. |
| AI auto-resolution | For high-confidence tickets, AI drafts and (optionally) sends a complete resolution. | Tier-zero deflection on repetitive questions. |
| Workflow rules | Trigger / condition / action chains across ticket, incident, change, request. | Standard work runs itself. |
| Escalation engine | Time-based, severity-based, SLA-breach, and approval-overdue escalations. | Nothing falls through the cracks. |
| Approval automation | Multi-step, parallel, sequential, quorum-based with expiry & escalation chains. | Change boards stop being calendar bottlenecks. |
| Outbound webhooks | HMAC-signed event delivery to Slack, Teams, PagerDuty, Jira, data lakes. | One source of truth, many destinations. |

> **Every rule, every run, fully recorded.** Zentra captures every rule execution with applied / skipped / failed state per action — automation becomes evidence, not magic.

---

## 06 · Reporting & visibility

| Dashboard | What it shows |
| :--- | :--- |
| **Ops Command Center** | Real-time queue depth, breach-risk alerts, team load, unassigned-urgent counts. |
| **SLA Monitor** | Compliance by priority, category, team, channel. Breach counts, at-risk volume, trends. |
| **Agent Leaderboard** | Resolve volume, average time-to-resolve, first-touch resolution rate, CSAT signal. |
| **Manager Summary** | Executive view of service health, productivity trends, satisfaction, asset state. |
| **Service-health insights** | Linked-asset health, problem hotspots, recurring incident clusters, root-cause visibility. |
| **Scheduled & on-demand exports** | Every report exports to Excel / CSV; schedules deliver to inboxes on the cadence leadership wants. |

---

## 07 · Asset & operational control

Most ITSM tools treat assets as an afterthought. Zentra treats them as the substrate of every operation.

- **Asset lifecycle visibility** — pending receipt → received → deployed → in use → retired → returned → disposed.
- **Real CMDB relationships** — assets and CIs link to each other and to the changes, incidents, problems, and requests that touch them.
- **Ownership, location, financials** — every asset carries its owner, location, cost, vendor, warranty, and renewal date.
- **License & SaaS subscription tracking** — seat counts, expiry, renewal alerts, over-utilisation warnings.
- **Discovery sync** — external connectors or CSV import, with validation and re-runnable jobs.
- **Change conflict detection** — overlapping changes and dependent systems surfaced before approval.

> Every change knows what it touches. Every incident knows what it depends on. Every renewal lands on the right calendar.

---

## 08 · Why Zentra stands out

- **Integrated, not stitched** — incident, request, problem, change, asset, knowledge on a single record of truth.
- **Modern stack** — Bun + TypeScript backend, React + shadcn UI, PostgreSQL with Prisma, pg-boss queue, multi-replica Caddy load balancing.
- **Real-time operations** — server-sent events push every meaningful change to every open agent screen.
- **Configurable** — custom ticket types, statuses, fields, roles, and permissions; editable at runtime, no consultancy lock-in.
- **Audit-grade** — append-only audit log; full execution log on every automation rule; full event log on every approval.
- **Deployable anywhere** — one-script self-host on CentOS/RHEL with systemd-managed replicas behind Caddy.

### Zentra against the traditional ITSM model

Legacy ITSM platforms were built for an era of heavyweight implementations and rigid vendor-managed configuration. This is an honest side-by-side on the dimensions that decide whether the platform will still serve the operation three years from now.

| Dimension | Traditional / legacy ITSM | **Zentra ITSM** |
| :--- | :--- | :--- |
| **Architecture** | Multiple bolted-together modules with their own data stores and brittle integrations. | **One data model** across the full ITIL lifecycle. Tickets, incidents, requests, problems, changes, assets, and KB on a single record-of-truth. |
| **Time to first value** | Three- to twelve-month implementation projects; vendor or partner consultancy required to "go live". | **Operational in days.** One-script installer; ITIL practices configured by default; customisation editable at runtime. |
| **Customisation** | Configuration locked behind vendor consultants, expensive change requests, and version-gated upgrade paths. | **Configuration-as-data.** Custom ticket types, statuses, fields, forms, roles, and 100+ permissions — all editable by admins at runtime. |
| **Total cost of ownership** | License + per-seat fees + integration vendor + implementation partner + annual customisation hours. | **Self-host or managed** on infrastructure you already run; no integration partner gating; no consultancy lock-in. |
| **User experience** | Dated form-and-table UI; full-page refreshes; clunky module navigation. | **Modern keyboard-first console** with shadcn-grade UI, live SSE updates, command palette, and a real customer portal. |
| **Real-time operations** | Refresh-driven dashboards; data is "true as of an hour ago". | **Server-sent events** push every meaningful change to every open screen — queues, banners, presence — without polling. |
| **AI capabilities** | Bolt-on add-on (separately priced) or absent. Generally limited to off-platform chatbots. | **Native AI in the workflow.** Inbound classification, AI auto-resolution, reply polishing, ticket summaries — governed and auditable. |
| **Automation** | Opaque rule editors with limited visibility into what fired, when, and why. | **Audit-grade automation.** Trigger / condition / action chains with per-action applied / skipped / failed execution records. |
| **Approval & change governance** | Light approval workflow; CAB is usually an external calendar; conflict detection is manual. | **Real CAB** with multi-step approvals, parallel/sequential, quorum & expiry, schedule-conflict detection, rollback plans. |
| **Asset & CMDB depth** | Flat asset inventory; "CMDB" often shipped as a separate, paid module. | **First-class CMDB** with real CI relationships, lifecycle states, discovery sync, SaaS & license tracking, renewal alerts. |
| **Reporting** | Report builder paywalled or limited; export gated; live dashboards rare. | **30+ curated reports** + custom views + Excel/CSV export + real-time dashboards (Ops, SLA, Agent, Manager). |
| **Audit & governance** | Audit trail partial; coverage varies by module; reconstruction in retrospect. | **Append-only audit log** on every privileged action; rule execution log; approval event history; exportable. |
| **Extensibility** | Paid connector marketplace; bespoke integrations require vendor SDK and certification. | **HMAC-signed outbound webhooks**, portal APIs, and the automation engine — clean integration paths without bespoke code. |
| **Data ownership** | Vendor-hosted only; data residency tied to provider regions; export is a project. | **Self-host on your infrastructure.** Every record inside the organisation's own perimeter; PostgreSQL backups under your control. |
| **Scalability** | Vertical scale; restart windows; upgrades are events. | **Horizontal replicas** behind a least-connection load balancer; rolling restarts; live event stream stays consistent. |

> **The summary.** Zentra is built for organisations that need the depth of an enterprise ITSM platform without the implementation overhead, the vendor lock-in, or the compromised user experience that the older generation made buyers accept.

---

## 09 · Ideal use cases

| Audience | The pain | How Zentra answers |
| :--- | :--- | :--- |
| Internal IT support | Backlog, SLA risk, agent utilisation, knowledge loss. | One console, live breach signal, AI-assisted triage, KB inline. |
| IT Operations & SRE | Change risk, incident coordination, on-call hand-off. | CAB groups, conflict detection, rollback plans, major-incident command room. |
| Managed Service Providers | Multi-customer, per-client SLAs, billing-ready reporting. | Organisations & service entitlements; shared automation library; per-org analytics. |
| Enterprise process owners | Process integrity, audit evidence, scope drift. | ITIL by default; append-only audit; 100+ scoped permissions; configuration-as-data. |
| Asset, procurement, finance | SaaS sprawl, missed renewals, over-licensing. | Living inventory with contracts, owners, expiry alerts, seat-utilisation visibility. |
| Service-focused organisations | Maturing from reactive support to a real service operation. | Full ITIL practice set out of the box — no six-month implementation. |

---

## 10 · Why an organisation should adopt Zentra

**Business efficiency** — intake routing, AI classification, and automation rules remove routine work from the agent's plate. Time saved goes back into the cases that need human judgement.

**Accountability** — every action carries an actor, a timestamp, a before/after state. Approvals carry explicit responses. Automation carries execution records. The audit question becomes "show me" rather than "let me check."

**Reduced downtime** — real CMDB relationships, conflict detection on changes, and a major-incident command room shorten the path from event to resolution.

**Service quality & user experience** — polished portal, threaded email conversations, AI-polished responses, knowledge surfacing — raised perceived quality without raised headcount.

**Process maturity** — ITIL 4 practices ship configured. Custom ticket types, statuses, fields, and roles mirror the organisation that already exists.

**Easier scaling** — multi-team routing, custom workflows, outbound webhooks, curated reports scale from a single shared inbox to a multi-region operation with hundreds of agents.

---

## 11 · Deployment & adoption confidence

| Concern | How Zentra answers |
| :--- | :--- |
| **Deployment** | Scripted, idempotent installer provisions PostgreSQL, runtime, N API replicas under systemd, and Caddy with automatic TLS — typically under an hour on CentOS/RHEL. |
| **High availability** | API runs as multiple identical replicas behind least-connection load balancing. Replicas restart automatically; database is the only stateful tier; job queue uses PostgreSQL. |
| **Observability** | Built-in admin monitoring console (API replicas, DB, queue, scheduled jobs, providers); Sentry integration; full audit log; live SSE event stream. |
| **Security & access** | Better Auth session model; RBAC with 100+ scoped permissions; custom roles; audit logging on every privileged action. |
| **Customisation** | Custom ticket types, statuses, fields, roles, and permissions — editable at runtime by admins. |
| **Extensibility** | HMAC-signed outbound webhooks, public portal APIs, and the automation engine give integrations a clean path — without bespoke code. |
| **Data ownership** | Self-hosted deployment keeps every record inside the organisation's own infrastructure. |

---

## 12 · Next step

Every service organisation is different. The fastest way to know whether Zentra fits yours is to put real workloads in front of it — your inbound channels, your team structure, your SLA policies, your change calendar — and see what comes out the other side.

We'd welcome the conversation:

- **Schedule a guided demo** against your real use cases.
- **Run a proof-of-concept** on a single team or service.
- **Structured pilot** against an existing operation with decision-grade evaluation criteria.

Each is structured to give you evidence — not a sales pitch.

---

*Zentra ITSM · zentraitsm.com · Confidential — for the intended recipient.*
