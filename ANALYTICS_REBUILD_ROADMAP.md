# Analytics Rebuild Roadmap

## Architecture overview

The analytics section follows a domain-layered structure:

```
client/src/
├── lib/reports/
│   ├── types.ts        # All API response shape interfaces
│   ├── api.ts          # One typed async function per /api/reports/* endpoint
│   └── utils.ts        # fmtDuration, fmtDay, fmtPct, periodToRange, xInterval, complianceClass
│
├── components/reports/
│   ├── KpiCard.tsx     # Single-metric card (title, value, sub, valueClass)
│   ├── ChartCard.tsx   # Card wrapper (overflow-hidden, optional p-0 for tables)
│   └── ReportLoading.tsx  # Skeleton placeholder matching real content weight
│
├── components/
│   └── PermissionRoute.tsx  # Generic <Route> guard using can(role, permission)
│
└── pages/reports/
    ├── ReportsLayout.tsx    # Header, period selector, section nav, <Outlet>
    ├── OverviewReport.tsx   # /reports/overview
    ├── TicketsReport.tsx    # /reports/tickets
    ├── SlaReport.tsx        # /reports/sla  (leaderboard gated by advanced_view)
    ├── IncidentsReport.tsx  # /reports/incidents
    └── CsatReport.tsx       # /reports/csat
```

### Routing

```
<PermissionRoute permission="reports.view">          ← all non-customer roles
  <Route path="/reports" element={<ReportsLayout>}>
    <Route index → redirect to "overview" />
    <Route path="overview"  → OverviewReport />
    <Route path="tickets"   → TicketsReport />
    <Route path="sla"       → SlaReport />
    <Route path="incidents" → IncidentsReport />
    <Route path="csat"      → CsatReport />
  </Route>
</PermissionRoute>
```

The `/reports` group was moved **out of `AdminRoute`** (admin-only) and into
`PermissionRoute("reports.view")` which matches the permission matrix — all
roles except `customer` have `reports.view`.

### Period state

The selected period (`?period=7|30|90`) lives in URL search params managed by
`ReportsLayout`. Each report page reads it via `useSearchParams()`. All nav
links in the layout include the current period, so switching sections never
resets the filter.

### Permission gating within pages

`SlaReport` checks `reports.advanced_view` before rendering the agent
leaderboard. Users without that permission (agents, readonly) see a lock card
instead. The query is also skipped (`enabled: false`) so no data is fetched
unnecessarily.

---

## Phase 1 — Built ✅

| Section | Endpoints consumed | Key visuals |
|---------|-------------------|-------------|
| **Overview** | `/overview`, `/aging`, `/top-open-tickets` | 6 KPI cards · aging bar · longest-open tickets table |
| **Tickets** | `/volume`, `/backlog-trend`, `/breakdowns`, `/resolution-distribution`, `/fcr` | Volume line · opened-vs-closed line · priority/category bars · resolution histogram · FCR KPIs |
| **SLA & Agents** | `/sla-by-dimension`, `/agent-leaderboard` | Compliance tables by priority/category/team · ranked leaderboard (advanced_view gated) |
| **Incidents** | `/incidents` | MTTA/MTTR KPIs · volume line · status/priority bars |
| **CSAT** | `/csat-trend` | 4 KPI cards · daily average score line |

Infrastructure:
- Type-safe API layer (`lib/reports/api.ts`)
- Shared component library (`components/reports/`)
- `PermissionRoute` generic guard
- URL-driven period state (bookmarkable, navigation-preserving)

---

## Phase 2 — Service Requests + Channel Breakdown + Date Range Picker

**Estimated effort:** 1 day

### New report section: Service Requests

- **Route:** `/reports/requests`
- **New file:** `pages/reports/RequestsReport.tsx`
- **Endpoints:** `GET /api/reports/requests?period=N`
- **Content:**
  - KPIs: total requests, avg fulfillment time, SLA compliance %
  - Status breakdown horizontal bar chart
  - Top catalog items table (name, count, avg fulfillment)

### Channel breakdown (add to TicketsReport)

- **Endpoint:** `GET /api/reports/channel-breakdown?period=N`
- **Content:** Donut or pie chart showing share by intake channel (Email / Portal / Agent / Unknown)
- Add `fetchChannelBreakdown` to `lib/reports/api.ts` and the type to `types.ts`

### Custom date range picker

Replace the `Select` (7 / 30 / 90 days) in `ReportsLayout` with a
`DateRangePicker` built on shadcn `Popover` + `Calendar`.

- Store `from`/`to` in URL search params instead of `period`
- `lib/reports/utils.ts` already has `periodToRange` and `rangeQS`; the API
  functions already accept a period string _or_ a `DateRangeParams` object
- Keep the preset buttons (7d / 30d / 90d) inside the picker for quick access

---

## Phase 3 — Problems + Approvals

**Estimated effort:** 0.5 day

### Problems report

- **Route:** `/reports/problems`
- **New file:** `pages/reports/ProblemsReport.tsx`
- **Endpoint:** `GET /api/reports/problems?period=N`
- **Content:**
  - KPIs: total, known errors, with incidents, recurring (≥ 2 linked incidents), avg resolution days
  - Status breakdown bar chart
  - Note: a "recurring" problem has ≥ 2 linked incidents; "with incidents" has ≥ 1

### Approvals report

- **Route:** `/reports/approvals`
- **New file:** `pages/reports/ApprovalsReport.tsx`
- **Endpoint:** `GET /api/reports/approvals?period=N`
- **Content:**
  - KPIs: total approvals, avg turnaround time, pending count
  - Status breakdown bar chart (pending / approved / rejected)
  - Oldest pending approvals table (title, subject type, days open)

---

## Phase 4 — Changes + CSV Export + Print Layout

**Estimated effort:** 2 days

### Changes report

No server endpoint exists yet. **New endpoint required in `server/src/routes/reports.ts`:**

```
GET /api/reports/changes?period=N
```

Suggested metrics:
- Total changes by state (draft → implemented → closed)
- By change type (standard / normal / emergency)
- By risk level (low / medium / high / critical)
- Lead time: avg days from `submittedAt` to `plannedStart`
- PIR completion rate (how many reviewed changes had PIR completed on time)
- Freeze window violations (changes scheduled during freeze windows)

Client: new `pages/reports/ChangesReport.tsx`, add endpoint to `lib/reports/api.ts`.

### CSV export

Add an **Export CSV** button to each report section header.

Implementation options:
- **Client-side (simpler):** install `papaparse`, convert the already-fetched
  JSON to CSV, trigger `URL.createObjectURL` download — no server changes needed
- **Server-side (more control):** add `?format=csv` to each endpoint; server
  sets `Content-Type: text/csv` and streams rows

Scope the `Export` button visibility to `reports.view` (available to all, since
they can already see the data).

### Print layout

Add a `?print=1` URL flag. In `ReportsLayout`, detect this flag and:
- Hide the nav, period selector, and sidebar
- Apply `@media print` friendly styles (white background, no shadows)
- Each `ChartCard` becomes a full-width print block

---

## Phase 5 — Advanced / Backlog

These require design decisions and/or significant new infrastructure.

| Feature | Notes |
|---------|-------|
| **Saved report views** | Persist selected section + period + filters to `dashboard_config` (model already exists in Prisma) |
| **Dashboard widget embeds** | Embed individual charts (volume, SLA compliance, CSAT trend) on `/` (HomePage) using the existing dashboard system |
| **Drill-down navigation** | Clicking a bar or table row navigates to the filtered ticket/incident list (e.g. all `urgent` open tickets → `/tickets?priority=urgent&status=open`) |
| **Comparative periods** | Show current period vs previous period with Δ % on each KPI card |
| **Scheduled email reports** | Add a `pg-boss` job that runs on a cron schedule, generates a report snapshot, and emails it via SendGrid |
| **Custom report builder** | Drag-and-drop widget composer stored per user — large effort, needs dedicated design spike |
| **Redis-backed presence** | Current presence store is in-memory; scale to multi-server with a Redis adapter |

---

## Server endpoints reference

All endpoints are in `server/src/routes/reports.ts`, mounted at `/api/reports`.

| Endpoint | Date param | Phase |
|----------|-----------|-------|
| `GET /overview` | `?from=&to=` | ✅ P1 |
| `GET /aging` | none (live) | ✅ P1 |
| `GET /top-open-tickets` | none (live) | ✅ P1 |
| `GET /volume` | `?from=&to=` or `?period=` | ✅ P1 |
| `GET /backlog-trend` | `?period=` | ✅ P1 |
| `GET /breakdowns` | `?from=&to=` | ✅ P1 |
| `GET /resolution-distribution` | `?period=` | ✅ P1 |
| `GET /fcr` | `?period=` | ✅ P1 |
| `GET /sla-by-dimension` | `?from=&to=` | ✅ P1 |
| `GET /agent-leaderboard` | `?period=` | ✅ P1 |
| `GET /incidents` | `?period=` | ✅ P1 |
| `GET /csat-trend` | `?period=` | ✅ P1 |
| `GET /requests` | `?period=` | Phase 2 |
| `GET /channel-breakdown` | `?period=` | Phase 2 |
| `GET /problems` | `?period=` | Phase 3 |
| `GET /approvals` | `?period=` | Phase 3 |
| `GET /changes` | `?period=` | **Phase 4 — endpoint not yet built** |
