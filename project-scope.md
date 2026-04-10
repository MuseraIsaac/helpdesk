# AI-Powered Ticket Management System

## Problem

Support teams receive large volumes of emails daily. Agents manually read, classify, and respond to each ticket — which is slow, inconsistent, and leads to impersonal canned responses.

## Solution

A ticket management system that uses AI to automatically classify, respond to, and route support tickets — delivering faster, more personalized responses while freeing agents for complex issues that need human judgment.

## Features

### Core Ticket Workflow
- Receive support emails via SendGrid inbound parse → auto-create tickets
- Create tickets manually from the agent UI
- Ticket list with filtering (status, category, priority, severity), sorting, search, and pagination
- Ticket detail view with full conversation, internal notes, compose area, and sidebar triage controls

### AI Capabilities
- Auto-classification of inbound tickets (category + priority) via OpenAI
- AI auto-resolution: generates and sends a reply, marks ticket resolved if confident
- AI reply polish — refines agent draft before sending
- AI ticket summary on the detail page

### Ticket Triage Fields
- **Status**: open, resolved, closed (new/processing are system-managed)
- **Category**: General Question, Technical Question, Refund Request
- **Priority**: low, medium, high, urgent
- **Severity**: sev4, sev3, sev2, sev1
- **Impact**: low, medium, high
- **Urgency**: low, medium, high

### SLA Tracking
- Per-priority first-response and resolution deadlines
- Background breach detection; persistent `slaBreached` flag
- At-risk (within 2 hours) and overdue (breached) filtered views
- Deadlines recalculated automatically when priority changes

### Escalation
- Auto-escalation on urgent priority or sev1 severity
- Manual escalate/de-escalate by agents
- Multiple escalation reasons tracked: SLA breach, priority, severity, manual, automation rule
- Full escalation event history per ticket

### Internal Collaboration
- Internal notes — visible only to agents and admins, never sent to the customer
- Notes clearly separated from customer-visible replies in the conversation timeline
- Note pinning, author attribution, and timestamp
- @mention-ready data structure

### Audit Trail
- Append-only event log for every significant ticket action
- Tracks: actor, action, timestamp, before/after values
- Events: ticket created/updated, SLA breached, escalated, reply sent, note added, rule applied
- Collapsible activity timeline in the ticket detail UI

### Business Automation Rules
- Code-defined rule engine, triggered on ticket create, update, and timed checks
- Conditions: keywords, category, priority, sender domain, unassigned time
- Actions: set category, set priority, assign agent, escalate
- All executions recorded in the audit trail; loop-safe

### Macros (Canned Responses)
- Admin-managed saved reply templates
- Searchable picker for agents in the reply composer
- Variable placeholders: `{{customer_name}}`, `{{customer_email}}`, `{{ticket_id}}`, `{{agent_name}}`

### Customer / Requester Model
- Customer entity auto-created from sender email on first contact
- Organization entity for grouping customers by company
- Customer profile with full ticket history visible to agents
- Prior tickets from the same customer shown inline on the ticket detail page

### User Management
- Admin-only agent management (create, edit, soft-delete)
- Roles: `admin` (full access) and `agent` (ticket management)

### Dashboard
- KPI stats: total tickets, open, AI resolution rate, avg resolution time
- 30-day daily volume chart
- Quick-filter cards for escalated / at-risk / overdue / unassigned-urgent tickets

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | All agent permissions + manage users, manage macros, view all macros |
| **Agent** | View and work tickets, post replies, write internal notes, insert macros |

## Data Model Summary

| Entity | Purpose |
|--------|---------|
| `User` | Agent/admin account (Better Auth-managed) |
| `Ticket` | Core support request with all triage/SLA/escalation state |
| `Reply` | Customer or agent message on a ticket (visible to customer) |
| `Note` | Internal agent note on a ticket (never sent to customer) |
| `Customer` | Requester entity, one per unique sender email |
| `Organization` | Company grouping for customers |
| `EscalationEvent` | Timestamped record of each escalation reason |
| `AuditEvent` | Append-only log of all ticket actions |
| `Macro` | Saved reply template with variable placeholders |
