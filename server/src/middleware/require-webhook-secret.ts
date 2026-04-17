import type { RequestHandler } from "express";
import { getSection } from "../lib/settings";

export const requireWebhookSecret: RequestHandler = async (req, res, next) => {
  // Read from settings DB first; fall back to env var
  const integrations = await getSection("integrations");
  const secret = integrations.webhookSecret || process.env.WEBHOOK_SECRET || "";

  if (!secret) {
    res.status(500).json({ error: "Webhook secret is not configured" });
    return;
  }

  const provided =
    req.headers["x-webhook-secret"] || req.query.secret;

  if (provided !== secret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  next();
};
