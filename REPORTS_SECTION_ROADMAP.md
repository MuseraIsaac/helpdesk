# Reports Section Roadmap

## What Was Built — Phase 1 ✅

**File:** `client/src/pages/ReportsPage.tsx`  
**Route:** `/reports` (admin/supervisor, guarded by `reports.view` permission)  
**Server:** All endpoints already existed in `server/src/routes/reports.ts` — this phase is client-only.

### Features shipped

| Tab | Endpoint(s) | Visualisations |
|-----|-------------|----------------|
| **Overview** | `/overview`, `/aging`, `/top-open-tickets` | 6 KPI cards · Open ticket age bar chart · Longest-waiting tickets table |
| **Tickets** | `/volume`, `/backlog-trend`, `/breakdowns`, `/resolution-distribution`, `/fcr` | Volume line · Opened-vs-Closed line · Priority & Category horizontal bars · Resolution time histogram · FCR KPI cards |
| **SLA & Agents** | `/sla-by-dimension`, `/agent-leaderboard` | SLA compliance tables by Priority / Category / Team · Agent leaderboard with avg resolution time |
| **Incidents** | `/incidents` | 5 KPI cards (total, major, SLA breached, MTTA, MTTR) · Volume line · Status & Priority horizontal bars |
| **CSAT** | `/csat-trend` | 4 KPI cards (avg score, total ratings, coverage) · Daily CSAT score line chart |

### Infrastructure in place
- Period selector (7 / 30 / 90 days) propagated to all tabs via React state
- Per-tab lazy loading — tabs only fetch when first rendered
- Shared `KpiCard` and `SectionLoading` components
- All charts use shadcn `ChartContainer` + Recharts for dark-mode-aware theming
- Helper functions: `fmtDuration`, `fmtDay`, `fmtPct`, `periodParams`, `xInterval`

---

## Phase 2 — Service Requests + Date Range Picker (medium priority)

**Effort:** ~1 day

### New tab: Service Requests
Endpoint: `GET /api/reports/requests?period=N`  
Display:
- KPI cards: total requests, avg fulfillment time, SLA compliance%
- Status breakdown horizontal bar chart
- Top catalog items table (name, request count, avg fulfillment time)

Also add channel breakdown to the Tickets tab:  
Endpoint: `GET /api/reports/channel-breakdown?period=N`  
Display: donut/pie chart showing volume by intake channel (Email / Portal / Agent)

### Custom date range picker
Replace the period `Select` (7 / 30 / 90) with a `DateRangePicker` using a shadcn `Popover` + `Calendar`.  
The `periodParams()` helper already accepts custom `from`/`to` strings, so this is a pure UI change.

---

## Phase 3 — Problems & Approvals (lower priority)

**Effort:** ~0.5 day

### New tab: Problems
Endpoint: `GET /api/reports/problems?period=N`  
Display:
- KPI cards: total problems, known errors, with-incidents count, recurring count, avg resolution days
- Status breakdown horizontal bar chart
- Note on recurrence threshold (≥ 2 linked incidents = "recurring")

### New tab: Approvals
Endpoint: `GET /api/reports/approvals?period=N`  
Display:
- KPI cards: total approvals, avg turnaround time, pending count
- Status breakdown bar chart (pending / approved / rejected)
- Oldest pending approvals table (title, subject type, days open)

---

## Phase 4 — Changes + Export (medium priority)

**Effort:** ~2 days

### New tab: Changes
No server endpoint exists yet for changes analytics — needs to be added to `server/src/routes/reports.ts`.

Suggested endpoint: `GET /api/reports/changes?period=N`  
Suggested metrics:
- Total changes by state (draft / submitted / scheduled / implemented / reviewed / closed / rejected / cancelled)
- By change type (standard / normal / emergency)
- By risk level
- Lead time: avg days from submission to scheduled start
- PIR completion rate (post-implementation reviews)

### CSV / Excel export
Add an **Export** button per tab that calls the same API endpoint and streams a CSV.  
Options:
- Client-side: use `papaparse` to convert the JSON to CSV and trigger a download
- Server-side: add `?format=csv` query param to each endpoint and stream CSV headers

---

## Phase 5 — Advanced Analytics (future / backlog)

These items have no server support yet and require larger design decisions.

| Feature | Notes |
|---------|-------|
| **Saved report views** | Persist selected tab + period + filters to `dashboard_config` (model already exists) |
| **Dashboard widgets** | Embed individual charts (volume, SLA compliance, CSAT) on the home page (`/`) |
| **Scheduled reports** | Email a PDF or CSV snapshot on a schedule — needs a pg-boss queue worker and email template |
| **Print / PDF export** | Add a `?print=1` URL flag that renders a print-friendly layout using `window.print()` |
| **Drill-down navigation** | Clicking a bar / row navigates to the filtered ticket/incident list (e.g. all "urgent" open tickets) |
| **Comparative periods** | Show current period vs previous period with % change on each KPI card |
| **Custom report builder** | Drag-and-drop widget composer stored per user — large effort, needs dedicated design spike |

---

## Server endpoints reference

All report endpoints live in `server/src/routes/reports.ts`, mounted at `/api/reports`.

| Endpoint | Date param style | Phase used |
|----------|-----------------|------------|
| `GET /overview` | `?from=&to=` | ✅ Phase 1 |
| `GET /volume` | `?from=&to=` or `?period=` | ✅ Phase 1 |
| `GET /breakdowns` | `?from=&to=` | ✅ Phase 1 |
| `GET /aging` | none (live snapshot) | ✅ Phase 1 |
| `GET /top-open-tickets` | none (live snapshot) | ✅ Phase 1 |
| `GET /backlog-trend` | `?period=` | ✅ Phase 1 |
| `GET /resolution-distribution` | `?period=` | ✅ Phase 1 |
| `GET /fcr` | `?period=` | ✅ Phase 1 |
| `GET /sla-by-dimension` | `?from=&to=` | ✅ Phase 1 |
| `GET /agent-leaderboard` | `?period=` | ✅ Phase 1 |
| `GET /incidents` | `?period=` | ✅ Phase 1 |
| `GET /csat-trend` | `?period=` | ✅ Phase 1 |
| `GET /requests` | `?period=` | Phase 2 |
| `GET /channel-breakdown` | `?period=` | Phase 2 |
| `GET /problems` | `?period=` | Phase 3 |
| `GET /approvals` | `?period=` | Phase 3 |
| `GET /changes` | `?period=` | **Phase 4 — endpoint not yet built** |
