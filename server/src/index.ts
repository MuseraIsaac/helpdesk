import path from "path";
import Sentry from "./lib/sentry";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import { requireAuth } from "./middleware/require-auth";
import usersRouter from "./routes/users";
import ticketsRouter from "./routes/tickets";
import agentsRouter from "./routes/agents";
import webhooksRouter from "./routes/webhooks";
import repliesRouter from "./routes/replies";
import notesRouter from "./routes/notes";
import macrosRouter from "./routes/macros";
import customersRouter from "./routes/customers";
import organizationsRouter from "./routes/organizations";
import portalRouter from "./routes/portal";
import kbRouter from "./routes/kb";
import csatRouter from "./routes/csat";
import reportsRouter from "./routes/reports";
import reportsShareRouter from "./routes/reports-share";
import reportsExportRouter from "./routes/reports-export";
import insightsRouter from "./routes/insights";
import analyticsRouter from "./routes/analytics";
import attachmentsRouter from "./routes/attachments";
import teamsRouter from "./routes/teams";
import meRouter from "./routes/me";
import settingsRouter from "./routes/settings";
import themeRouter from "./routes/theme";
import dashboardsRouter from "./routes/dashboards";
import ticketViewsRouter from "./routes/ticket-views";
import workflowsRouter from "./routes/workflows";
import scenariosRouter from "./routes/scenarios";
import automationsRouter from "./routes/automations";
import outboundWebhooksRouter from "./routes/outbound-webhooks";
import routingRouter from "./routes/routing";
import dutyPlansRouter from "./routes/duty-plans";
import approvalsRouter from "./routes/approvals";
import incidentsRouter from "./routes/incidents";
import requestsRouter from "./routes/requests";
import problemsRouter from "./routes/problems";
import changesRouter from "./routes/changes";
import changeAttachmentsRouter from "./routes/change-attachments";
import incidentAttachmentsRouter from "./routes/incident-attachments";
import incidentPresenceRouter from "./routes/incident-presence";
import bridgeCallRouter, { testVideoBridge } from "./routes/bridge-call";
import ticketFollowersRouter from "./routes/ticket-followers";
import { createEntityFollowersRouter } from "./routes/entity-followers";
import templatesRouter from "./routes/templates";
import notificationTemplatesRouter from "./routes/notification-templates";
import formDefinitionsRouter from "./routes/form-definitions";
import customFieldsRouter from "./routes/custom-fields";
import cabGroupsRouter from "./routes/cab-groups";
import sseRouter from "./routes/sse";
import ticketTypesRouter from "./routes/ticket-types";
import ticketStatusConfigsRouter from "./routes/ticket-status-configs";
import escalationRulesRouter from "./routes/escalation-rules";
import presenceRouter from "./routes/presence";
import cmdbRouter from "./routes/cmdb";
import {
  incidentAssetLinksRouter,
  requestAssetLinksRouter,
  problemAssetLinksRouter,
  changeAssetLinksRouter,
  ciAssetLinksRouter,
} from "./routes/entity-asset-links";
import assetsRouter from "./routes/assets";
import assetViewsRouter from "./routes/asset-views";
import inventoryLocationsRouter from "./routes/inventory-locations";
import contractsRouter from "./routes/contracts";
import assetFinancialRouter from "./routes/asset-financial";
import softwareLicensesRouter from "./routes/software-licenses";
import saasSubscriptionsRouter from "./routes/saas-subscriptions";
import discoveryRouter from "./routes/discovery";
import catalogRouter from "./routes/catalog";
import notificationsRouter from "./routes/notifications";
import searchRouter from "./routes/search";
import demoDataRouter from "./routes/demo-data";
import trashRouter    from "./routes/trash";
import auditLogRouter from "./routes/audit-log";
import { startQueue, stopQueue } from "./lib/queue";
import { bootstrapMaterializedViews } from "./lib/materialized-views";
import { getSection } from "./lib/settings";
import { registerApprovalHook } from "./lib/approval-hooks";
import { onChangeApprovalResolved } from "./lib/change-approval";
import { registerChannelAdapter } from "./lib/intake/types";
import { emailAdapter } from "./lib/intake/email";
import { portalAdapter } from "./lib/intake/portal";
import { apiAdapter, chatAdapterStub, whatsappAdapterStub, slackTeamsAdapterStub, voiceAdapterStub, socialAdapterStub } from "./lib/intake/api";

// Register approval hooks — must run before any request is served
registerApprovalHook("change_request", onChangeApprovalResolved);

// Register all intake channel adapters
registerChannelAdapter(emailAdapter);
registerChannelAdapter(portalAdapter);
registerChannelAdapter(apiAdapter);
registerChannelAdapter(chatAdapterStub);
registerChannelAdapter(whatsappAdapterStub);
registerChannelAdapter(slackTeamsAdapterStub);
registerChannelAdapter(voiceAdapterStub);
registerChannelAdapter(socialAdapterStub);

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET environment variable is required");
}

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

const publicAppUrl =
  process.env.BETTER_AUTH_URL ||
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.APP_URL ||
  "";

const isHttps = publicAppUrl.startsWith("https://");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "upgrade-insecure-requests": isHttps ? [] : null,
        "script-src": ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

app.use(
  cors({
    origin: process.env.TRUSTED_ORIGINS?.split(",") ?? [],
    credentials: true,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: () => !isProduction,
});

// Mount Better Auth handler BEFORE express.json()
// Better Auth parses its own request bodies
// toNodeHandler returns a promise; must be caught for Express 5
app.all("/api/auth/{*any}", authLimiter, (req, res, next) => {
  toNodeHandler(auth)(req, res).catch(next);
});

// Dynamic JSON body-size limit — reads maxAttachmentSizeMb from Advanced settings.
// Base64-encoded images embedded in reply HTML inflate raw file size by ~1.37×,
// so we allow 2× the configured attachment ceiling to be safe.
// The cache avoids a DB round-trip on every request while still picking up
// setting changes within 30 seconds.
let _bodyLimitCache: { bytes: number; expiresAt: number } | null = null;

async function getJsonBodyLimit(): Promise<number> {
  const now = Date.now();
  if (_bodyLimitCache && now < _bodyLimitCache.expiresAt) {
    return _bodyLimitCache.bytes;
  }
  try {
    const advanced = await getSection("advanced");
    const mb = advanced.maxAttachmentSizeMb ?? 10;
    const bytes = mb * 2 * 1024 * 1024;
    _bodyLimitCache = { bytes, expiresAt: now + 30_000 };
    return bytes;
  } catch {
    // DB unavailable at startup — fall back to a generous 50 MB
    return 50 * 1024 * 1024;
  }
}

app.use((req, res, next) => {
  getJsonBodyLimit()
    .then((limit) => express.json({ limit })(req, res, next))
    .catch(next);
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/me", meRouter);
app.use("/api/dashboards", dashboardsRouter);
app.use("/api/ticket-views", ticketViewsRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/scenarios", scenariosRouter);
app.use("/api/automations", automationsRouter);
app.use("/api/webhooks/outbound", outboundWebhooksRouter);
app.use("/api/routing", routingRouter);
app.use("/api/duty-plans", dutyPlansRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/incidents/:incidentId/attachments", incidentAttachmentsRouter);
app.use("/api/incidents/:incidentId/presence", incidentPresenceRouter);
app.use("/api/incidents/:incidentId/bridge", bridgeCallRouter);
app.use("/api/incidents/:entityId/followers", createEntityFollowersRouter("incident"));
app.use("/api/changes/:entityId/followers",   createEntityFollowersRouter("change"));
app.use("/api/requests/:entityId/followers",  createEntityFollowersRouter("service_request"));
app.use("/api/problems/:entityId/followers",  createEntityFollowersRouter("problem"));
app.use("/api/requests", requestsRouter);
app.use("/api/problems", problemsRouter);
app.use("/api/changes", changesRouter);
app.use("/api/changes/:changeId/attachments", changeAttachmentsRouter);
app.use("/api/cmdb", cmdbRouter);
app.use("/api/incidents",  incidentAssetLinksRouter);
app.use("/api/requests",   requestAssetLinksRouter);
app.use("/api/problems",   problemAssetLinksRouter);
app.use("/api/changes",    changeAssetLinksRouter);
app.use("/api/cmdb",       ciAssetLinksRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/asset-views", assetViewsRouter);
app.use("/api/inventory-locations", inventoryLocationsRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/assets/financial", assetFinancialRouter);
app.use("/api/software-licenses", softwareLicensesRouter);
app.use("/api/saas-subscriptions", saasSubscriptionsRouter);
app.use("/api/discovery", discoveryRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/search", searchRouter);
app.use("/api/demo-data", demoDataRouter);
app.use("/api/trash",     trashRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/reports", reportsShareRouter);
app.use("/api/reports", reportsExportRouter);
app.use("/api/reports/insights", insightsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/theme", themeRouter);
app.use("/api/users", usersRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/tickets/:ticketId/replies", repliesRouter);
app.use("/api/tickets/:ticketId/notes", notesRouter);
app.use("/api/tickets/:ticketId/attachments", attachmentsRouter);
app.use("/api/tickets/:ticketId/presence", presenceRouter);
app.use("/api/tickets/:ticketId/followers", ticketFollowersRouter);
app.use("/api/macros", macrosRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/notification-templates", notificationTemplatesRouter);
app.use("/api/form-definitions", formDefinitionsRouter);
app.use("/api/custom-fields", customFieldsRouter);
app.use("/api/cab-groups", cabGroupsRouter);
app.use("/api/ticket-types", ticketTypesRouter);
app.use("/api/ticket-status-configs", ticketStatusConfigsRouter);
app.use("/api/escalation-rules", escalationRulesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/portal", portalRouter);
app.use("/api/kb", kbRouter);
app.use("/api/csat", csatRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/sse",     sseRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/webhooks", webhooksRouter);

Sentry.setupExpressErrorHandler(app);

// Global JSON error handler — must have 4 params so Express recognises it as an error handler.
// Runs after Sentry has captured the exception. Ensures all unhandled errors (Prisma, etc.)
// return { error: "..." } JSON instead of an HTML 500 page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const anyErr = err as { status?: number; statusCode?: number; message?: string };
  const status  = anyErr.status ?? anyErr.statusCode ?? 500;
  const message =
    process.env.NODE_ENV === "production"
      ? (status < 500 ? (anyErr.message ?? "Bad request") : "Internal server error")
      : (anyErr.message ?? "Internal server error");
  res.status(status).json({ error: message });
});

// In production, serve the built React client as static files
if (isProduction) {
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
  app.use(express.static(clientDist));

  // SPA fallback: serve index.html for any non-API route
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

if (!process.env.WEBHOOK_SECRET) {
  console.warn("Warning: WEBHOOK_SECRET is not set. Webhook endpoints will return 500.");
}

async function boot() {
  await startQueue();
  await bootstrapMaterializedViews();

  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    server.close();
    await stopQueue();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

boot().catch((error) => {
  Sentry.captureException(error);
  console.error("Failed to start server:", error);
  process.exit(1);
});
