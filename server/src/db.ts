/**
 * Prisma client setup.
 *
 * The remote Postgres at 138.199.153.57 enforces an idle-connection timeout
 * — when an idle pooled connection exceeds it, the server sends 57P01
 * ("terminating connection due to administrator command") and the next query
 * on that socket fails fatally.
 *
 * Mitigations:
 *   - keepAlive:           sends TCP keepalive packets so the connection is
 *                          never seen as idle by the upstream firewall/server
 *   - idleTimeoutMillis:   recycle our own idle clients well before the
 *                          server's timeout fires
 *   - max:                 cap the pool so we don't exhaust the server's
 *                          per-IP connection limit when pg-boss + Prisma
 *                          run side-by-side
 *   - connectionTimeoutMs: fail fast on transient network blips so workers
 *                          retry instead of hanging the request
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const adapter = new PrismaPg({
  connectionString:    process.env.DATABASE_URL,
  // Keep idle sockets alive at the TCP layer so the server / NAT don't drop us
  keepAlive:           true,
  keepAliveInitialDelayMillis: 10_000,        // 10 s
  // Recycle our own idle clients after 30 s — well under typical server-side
  // idle timeouts (60 s+) so we never reuse a half-dead socket
  idleTimeoutMillis:   30_000,
  // Connection cap — sized for ~100 concurrent agents. Each agent's first
  // page fires ~8 parallel queries (session, me, teams, agents, status
  // configs, ticket types, tickets findMany+count); a small pool queues
  // requests under burst and shows up as latency spikes. Configurable via
  // DATABASE_POOL_MAX so ops can tune to the remote DB's actual per-IP
  // connection budget without a code change. pg-boss takes another 5 on
  // top of this. With Postgres `max_connections` typically at 100, 40 is
  // a comfortable middle ground (40 + 5 = 45 used, ≥55 free for other
  // services and headroom).
  max: Number(process.env.DATABASE_POOL_MAX) || 40,
  // The remote DB at 138.199.153.57 has ~140 ms RTT and occasional
  // slow-handshake bursts under load. 10s was tight; 30s gives the
  // Postgres SASL handshake enough room to complete without forcing the
  // server to abort boot and retry.
  connectionTimeoutMillis: 30_000,
  // Keep statements bounded; runaway queries shouldn't hold a connection open
  statement_timeout:   60_000,                 // 60 s
});

const prisma = new PrismaClient({ adapter });

export default prisma;
