# Helpdesk

> This project is built as part of my [Claude Code](https://codewithmosh.com/p/claude-code) course, showing how to build and ship a production-ready full-stack app with AI-assisted development.

An AI-powered ticket management system that automatically classifies, responds to, and routes support tickets.

## Features

### Ticket Management
- Receive support emails via SendGrid inbound parse and create tickets automatically
- Create tickets manually from the agent UI
- Full CRUD: list, filter, sort, paginate, search, update
- Ticket statuses: `new` → `processing` → `open` → `resolved` → `closed`
- Triage fields: category, priority (low/medium/high/urgent), severity (sev1–sev4), impact, urgency
- Assign tickets to agents

### AI Features
- Auto-classification of inbound tickets (category) via OpenAI
- AI auto-resolution: generates a reply, sends it, marks ticket resolved if confident
- AI reply polish — refines an agent's draft before sending
- AI ticket summary card on the ticket detail page

### SLA Tracking
- Per-priority SLA deadlines (first response + resolution)
- Background breach detection (pg-boss job every 5 minutes)
- At-risk view (deadline within 2 hours) and overdue view
- SLA status badge on every ticket; deadlines recalculated if priority changes

### Escalation
- Auto-escalation on urgent priority or sev1 severity
- Manual escalation and de-escalation by agents
- Full escalation event history per ticket
- Escalation badge visible in ticket list subject column

### Internal Collaboration
- Internal notes on tickets — never sent to the customer
- Notes are visible to agents and admins only, clearly distinguished from replies
- Pin important notes to float them to the top
- @mention-ready data structure for future notification routing
- Unified conversation timeline combining customer messages, agent replies, and internal notes

### Audit Trail
- Append-only audit log for every significant ticket action
- Tracked events: ticket created, status changed, priority/severity/category changed, agent assigned, SLA breached, escalated, de-escalated, reply sent, internal note added, automation rule applied
- Records actor, action, timestamp, and before/after values
- Collapsible activity timeline on the ticket detail page (collapsed by default)

### Business Automation Rules
- Code-defined rule engine triggered on ticket create, update, and a scheduled time-based check
- Supported conditions: keyword match, category, priority, sender email domain, unassigned duration
- Supported actions: set category, set priority, assign to agent, escalate
- Built-in rules: keyword → category/priority, unassigned urgent tickets → escalate after 15 min
- All rule executions are recorded in the audit trail
- Loop-safe: each rule fires at most once per trigger invocation

### Macros (Canned Responses)
- Admin-managed saved reply templates with title, body, optional category, and active/inactive status
- Agents insert macros into the reply composer via a searchable picker dialog
- Variable placeholders resolved at insertion time: `{{customer_name}}`, `{{customer_email}}`, `{{ticket_id}}`, `{{agent_name}}`
- Template remains editable before sending
- Admin UI at `/macros`

### Customer / Requester Model
- Customer entity automatically created from ticket sender email on first contact
- Organization entity for grouping customers by company (with optional domain for future auto-linking)
- Customer history panel in the ticket detail sidebar: name, email, organization, and prior tickets
- `GET /api/customers/:id` endpoint for full customer profile with ticket history
- Backfill script to link existing tickets to customer records

### User Management
- Admin-only user management page (`/users`)
- Create, edit (name/role), and soft-delete agents
- Role-based access: `admin` (full access) and `agent` (tickets only)

### Dashboard
- Live stats: total tickets, open tickets, AI resolution rate, average resolution time
- 30-day daily ticket volume chart
- Quick-filter cards for overdue, at-risk, and unassigned-urgent tickets

## Tech Stack

- **Frontend**: React, TypeScript, Vite, shadcn/ui, TanStack Query, React Hook Form, Zod
- **Backend**: Express 5, TypeScript, Bun
- **Database**: PostgreSQL, Prisma ORM
- **AI**: OpenAI GPT-4o mini via Vercel AI SDK (`@ai-sdk/openai`)
- **Auth**: Better Auth (email/password, database sessions)
- **Job Queue**: pg-boss (PostgreSQL-backed)
- **Error Tracking**: Sentry
- **Email**: SendGrid (inbound parse + outbound replies)

## Project Structure

```
client/   — React frontend (Vite, port 5173)
server/   — Express backend (Bun, port 3000)
core/     — Shared code: Zod schemas, TypeScript types, constants
e2e/      — Playwright end-to-end tests
```

## Prerequisites

- [Bun](https://bun.sh) (runtime and package manager)
- PostgreSQL

## Getting Started

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Set up environment variables**

   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

   Edit `server/.env` and fill in the required values. At minimum:
   - `DATABASE_URL` — PostgreSQL connection string
   - `BETTER_AUTH_SECRET` — generate with `openssl rand -base64 32`
   - `OPENAI_API_KEY` — for AI features

3. **Set up the database**

   ```bash
   cd server
   bunx prisma migrate dev
   bunx prisma db seed
   ```

4. **Backfill customer records** (only needed if upgrading an existing database)

   ```bash
   bun run prisma/backfill-customers.ts
   ```

5. **Start the dev servers**

   ```bash
   # Terminal 1 — backend
   cd server && bun run dev

   # Terminal 2 — frontend
   cd client && bun run dev
   ```

   The client runs on `http://localhost:5173` and proxies API requests to the server on port 3000.

## Testing

```bash
# Component tests (Vitest + React Testing Library)
cd client && bun run test

# E2E tests (Playwright — requires both servers running)
bun run test:e2e
```

## Deployment (Railway)

The app is configured for single-service deployment on Railway. The Express server serves the built React client as static files in production.

1. **Build the Docker image**

   ```bash
   docker build -t helpdesk .
   ```

2. **Run locally with Docker**

   ```bash
   docker run -p 3000:3000 --env-file server/.env -e NODE_ENV=production helpdesk
   ```

3. **Deploy to Railway**

   - Create a new project and link this repo
   - Add a PostgreSQL database
   - Set the required environment variables (see `server/.env.example`)
   - After the first deploy, seed the database:
     ```bash
     railway run -- bun run --cwd server prisma db seed
     ```

### Required Environment Variables (Production)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Railway) |
| `BETTER_AUTH_SECRET` | Auth secret key |
| `BETTER_AUTH_URL` | App URL (e.g. `https://yourapp.up.railway.app`) |
| `TRUSTED_ORIGINS` | Same as `BETTER_AUTH_URL` |
| `WEBHOOK_SECRET` | For inbound email webhook verification |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `SENDGRID_API_KEY` | SendGrid API key for outbound email |
| `SENDGRID_FROM_EMAIL` | Verified sender email address |
| `SEED_ADMIN_EMAIL` | Initial admin user email |
| `SEED_ADMIN_PASSWORD` | Initial admin user password |

Optional: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`
