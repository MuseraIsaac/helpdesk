# Tech Stack

## Frontend

- **React 19** with TypeScript
- **Vite** — build tool and dev server (port 5173)
- **shadcn/ui** — component library (Radix UI primitives + Tailwind CSS)
- **Tailwind CSS** — utility-first styling with semantic design tokens
- **React Router v7** — client-side routing with `ProtectedRoute` / `AdminRoute` wrappers
- **TanStack React Query** — server state, caching, background refetch
- **React Hook Form** + **Zod** — form state and validation
- **Axios** — HTTP client (all API calls go through `/api/*` proxy)
- **Lucide React** — icon set

## Backend

- **Express 5** with TypeScript
- **Bun** — JavaScript runtime and package manager
- **Prisma ORM** — type-safe database access, migrations
- **pg-boss** — PostgreSQL-backed job queue (runs in `pgboss` schema)
- **Better Auth** — email/password authentication with database sessions
- **Helmet** — HTTP security headers
- **CORS** — cross-origin configuration
- **express-rate-limit** — auth endpoint rate limiting (production only)
- **multer** — multipart form parsing (inbound email webhook)
- **Sentry** — error tracking and performance monitoring

## Shared (core package)

- **Zod v4** — schema definitions shared between client and server
- TypeScript interfaces for all domain entities
- Constants (roles, statuses, categories, priorities, etc.)

## Database

- **PostgreSQL** — primary datastore
- **Prisma** — ORM, migration runner, and schema management
- pg-boss uses the same PostgreSQL instance (`pgboss` schema)

## AI

- **OpenAI GPT-4o mini** via **Vercel AI SDK** (`@ai-sdk/openai`)
  - Ticket classification (category + priority)
  - Auto-resolution reply generation
  - Reply polish
  - Ticket summary

## Email

- **SendGrid** — inbound parse webhook for receiving emails, outbound API for sending replies

## Testing

- **Vitest** + **React Testing Library** — component tests
- **Playwright** — end-to-end tests

## Deployment

- **Docker** — containerised single-service build
- **Railway** — cloud deployment (app + managed PostgreSQL)
- Express serves the built React client as static files in production (no separate frontend server)
