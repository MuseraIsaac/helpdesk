/**
 * /api/webhooks/outbound — Outbound Webhook endpoints.
 *
 * Outbound webhooks let external systems receive event payloads from the
 * platform. Each webhook subscribes to a list of event types and receives
 * authenticated POST requests when those events fire.
 *
 * Only admins can manage outbound webhooks.
 *
 * Endpoints:
 *   GET    /api/webhooks/outbound              — list webhooks
 *   POST   /api/webhooks/outbound              — register webhook
 *   GET    /api/webhooks/outbound/:id          — fetch webhook details
 *   PATCH  /api/webhooks/outbound/:id          — update webhook
 *   DELETE /api/webhooks/outbound/:id          — delete webhook
 *   PATCH  /api/webhooks/outbound/:id/toggle   — enable / disable
 *   POST   /api/webhooks/outbound/:id/ping     — send a test ping
 *   GET    /api/webhooks/outbound/:id/deliveries — delivery history
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createOutboundWebhookSchema,
  updateOutboundWebhookSchema,
  listWebhookDeliveriesQuerySchema,
} from "core/schemas/automations";
import prisma from "../db";

const router = Router();

const WEBHOOK_SELECT = {
  id: true,
  name: true,
  description: true,
  isEnabled: true,
  url: true,
  method: true,
  headers: true,
  events: true,
  retryLimit: true,
  timeoutMs: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { deliveries: true } },
} as const;

// Never return the signingSecret in list/fetch responses.

// ── GET /api/webhooks/outbound ────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("webhooks.view"),
  async (_req, res) => {
    const webhooks = await prisma.outboundWebhook.findMany({
      orderBy: { createdAt: "desc" },
      select: WEBHOOK_SELECT,
    });
    res.json({ webhooks });
  }
);

// ── POST /api/webhooks/outbound ───────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("webhooks.manage"),
  async (req, res) => {
    const data = validate(createOutboundWebhookSchema, req.body, res);
    if (!data) return;

    const webhook = await prisma.outboundWebhook.create({
      data: {
        name:          data.name,
        description:   data.description ?? null,
        isEnabled:     data.isEnabled ?? true,
        url:           data.url,
        method:        data.method ?? "POST",
        headers:       data.headers ?? {},
        signingSecret: data.signingSecret ?? null,
        events:        data.events,
        retryLimit:    data.retryLimit ?? 3,
        timeoutMs:     data.timeoutMs ?? 10000,
        createdById:   req.user.id,
      },
      select: WEBHOOK_SELECT,
    });

    res.status(201).json({ webhook });
  }
);

// ── GET /api/webhooks/outbound/:id ────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("webhooks.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid webhook ID" }); return; }

    const webhook = await prisma.outboundWebhook.findUnique({ where: { id }, select: WEBHOOK_SELECT });
    if (!webhook) { res.status(404).json({ error: "Webhook not found" }); return; }

    res.json({ webhook });
  }
);

// ── PATCH /api/webhooks/outbound/:id ─────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("webhooks.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid webhook ID" }); return; }

    const data = validate(updateOutboundWebhookSchema, req.body, res);
    if (!data) return;

    const existing = await prisma.outboundWebhook.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

    const webhook = await prisma.outboundWebhook.update({
      where: { id },
      data: {
        ...(data.name          !== undefined && { name: data.name }),
        ...(data.description   !== undefined && { description: data.description }),
        ...(data.isEnabled     !== undefined && { isEnabled: data.isEnabled }),
        ...(data.url           !== undefined && { url: data.url }),
        ...(data.method        !== undefined && { method: data.method }),
        ...(data.headers       !== undefined && { headers: data.headers }),
        ...(data.signingSecret !== undefined && { signingSecret: data.signingSecret }),
        ...(data.events        !== undefined && { events: data.events }),
        ...(data.retryLimit    !== undefined && { retryLimit: data.retryLimit }),
        ...(data.timeoutMs     !== undefined && { timeoutMs: data.timeoutMs }),
      },
      select: WEBHOOK_SELECT,
    });

    res.json({ webhook });
  }
);

// ── PATCH /api/webhooks/outbound/:id/toggle ───────────────────────────────────

router.patch(
  "/:id/toggle",
  requireAuth,
  requirePermission("webhooks.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid webhook ID" }); return; }

    const existing = await prisma.outboundWebhook.findUnique({ where: { id }, select: { isEnabled: true } });
    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

    const webhook = await prisma.outboundWebhook.update({
      where: { id },
      data: { isEnabled: !existing.isEnabled },
      select: WEBHOOK_SELECT,
    });

    res.json({ webhook });
  }
);

// ── DELETE /api/webhooks/outbound/:id ─────────────────────────────────────────

router.delete(
  "/:id",
  requireAuth,
  requirePermission("webhooks.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid webhook ID" }); return; }

    const existing = await prisma.outboundWebhook.findUnique({ where: { id }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Webhook not found" }); return; }

    await prisma.outboundWebhook.delete({ where: { id } });
    res.json({ ok: true });
  }
);

// ── POST /api/webhooks/outbound/:id/ping ──────────────────────────────────────

router.post(
  "/:id/ping",
  requireAuth,
  requirePermission("webhooks.manage"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid webhook ID" }); return; }

    const webhook = await prisma.outboundWebhook.findUnique({
      where: { id },
      select: { id: true, url: true, method: true, headers: true, timeoutMs: true },
    });
    if (!webhook) { res.status(404).json({ error: "Webhook not found" }); return; }

    const payload = {
      event: "webhook.ping",
      timestamp: new Date().toISOString(),
      webhookId: id,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), webhook.timeoutMs);
    const start = Date.now();

    let responseCode: number | null = null;
    let responseBody: string | null = null;
    let status = "failed";

    try {
      const resp = await fetch(webhook.url, {
        method: webhook.method,
        headers: {
          "Content-Type": "application/json",
          ...(webhook.headers as Record<string, string>),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      responseCode = resp.status;
      responseBody = (await resp.text()).slice(0, 2000);
      status = resp.ok ? "delivered" : "failed";
    } catch (e) {
      responseBody = e instanceof Error ? e.message : "unknown error";
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - start;

    await prisma.webhookDelivery.create({
      data: {
        webhookId: id,
        event: "webhook.ping",
        entityType: "webhook",
        entityId: String(id),
        status,
        requestBody: payload,
        responseCode,
        responseBody,
        durationMs,
        attempts: 1,
        deliveredAt: status === "delivered" ? new Date() : null,
        failedAt: status === "failed" ? new Date() : null,
      },
    });

    res.json({ status, responseCode, responseBody, durationMs });
  }
);

// ── GET /api/webhooks/outbound/:id/deliveries ─────────────────────────────────

router.get(
  "/:id/deliveries",
  requireAuth,
  requirePermission("webhooks.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid webhook ID" }); return; }

    const webhook = await prisma.outboundWebhook.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!webhook) { res.status(404).json({ error: "Webhook not found" }); return; }

    const query = validate(listWebhookDeliveriesQuerySchema, req.query, res);
    if (!query) return;

    const where: Record<string, unknown> = { webhookId: id };
    if (query.status) where.status = query.status;
    if (query.event)  where.event  = query.event;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          event: true,
          entityType: true,
          entityId: true,
          status: true,
          responseCode: true,
          durationMs: true,
          attempts: true,
          deliveredAt: true,
          failedAt: true,
          createdAt: true,
        },
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    res.json({ webhook, deliveries, total, limit: query.limit, offset: query.offset });
  }
);

export default router;
