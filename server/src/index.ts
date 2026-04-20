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
import attachmentsRouter from "./routes/attachments";
import teamsRouter from "./routes/teams";
import meRouter from "./routes/me";
import settingsRouter from "./routes/settings";
import themeRouter from "./routes/theme";
import dashboardsRouter from "./routes/dashboards";
import ticketViewsRouter from "./routes/ticket-views";
import workflowsRouter from "./routes/workflows";
import scenariosRouter from "./routes/scenarios";
import approvalsRouter from "./routes/approvals";
import incidentsRouter from "./routes/incidents";
import requestsRouter from "./routes/requests";
import problemsRouter from "./routes/problems";
import changesRouter from "./routes/changes";
import changeAttachmentsRouter from "./routes/change-attachments";
import templatesRouter from "./routes/templates";
import notificationTemplatesRouter from "./routes/notification-templates";
import formDefinitionsRouter from "./routes/form-definitions";
import customFieldsRouter from "./routes/custom-fields";
import cabGroupsRouter from "./routes/cab-groups";
import ticketTypesRouter from "./routes/ticket-types";
import ticketStatusConfigsRouter from "./routes/ticket-status-configs";
import escalationRulesRouter from "./routes/escalation-rules";
import cmdbRouter from "./routes/cmdb";
import catalogRouter from "./routes/catalog";
import notificationsRouter from "./routes/notifications";
import searchRouter from "./routes/search";
import { startQueue, stopQueue } from "./lib/queue";
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

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/me", meRouter);
app.use("/api/dashboards", dashboardsRouter);
app.use("/api/ticket-views", ticketViewsRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/scenarios", scenariosRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/incidents", incidentsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/problems", problemsRouter);
app.use("/api/changes", changesRouter);
app.use("/api/changes/:changeId/attachments", changeAttachmentsRouter);
app.use("/api/cmdb", cmdbRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/search", searchRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/theme", themeRouter);
app.use("/api/users", usersRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/tickets/:ticketId/replies", repliesRouter);
app.use("/api/tickets/:ticketId/notes", notesRouter);
app.use("/api/tickets/:ticketId/attachments", attachmentsRouter);
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
app.use("/api/teams", teamsRouter);
app.use("/api/webhooks", webhooksRouter);

Sentry.setupExpressErrorHandler(app);

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
