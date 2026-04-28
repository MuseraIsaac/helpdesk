import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { getSection } from "../lib/settings";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

// GET /api/audit-log/export — download audit events as JSON or CSV
router.get(
  "/export",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const settings = await getSection("audit");
    if (!settings.exportEnabled) {
      res.status(403).json({ error: "Audit log export is disabled" });
      return;
    }

    const format = (req.query.format as string) ?? settings.exportFormat ?? "json";
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate   = req.query.endDate   ? new Date(req.query.endDate   as string) : undefined;

    const events = await prisma.auditEvent.findMany({
      where: {
        ...(startDate || endDate
          ? { createdAt: { gte: startDate, lte: endDate } }
          : {}),
      },
      select: {
        id: true,
        action: true,
        meta: true,
        createdAt: true,
        ticketId: true,
        actor: { select: { id: true, name: true, email: true } },
        ticket: { select: { ticketNumber: true, subject: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50000,
    });

    if (format === "csv") {
      const rows = [
        ["id", "createdAt", "action", "actorId", "actorName", "actorEmail", "ticketId", "ticketNumber", "ticketSubject", "meta"].join(","),
        ...events.map((e) =>
          [
            e.id,
            e.createdAt.toISOString(),
            e.action,
            e.actor?.id ?? "",
            csvEscape(e.actor?.name ?? ""),
            e.actor?.email ?? "",
            e.ticketId,
            e.ticket?.ticketNumber ?? "",
            csvEscape(e.ticket?.subject ?? ""),
            csvEscape(JSON.stringify(e.meta)),
          ].join(",")
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${dateSuffix()}.csv"`);
      res.send(rows);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${dateSuffix()}.json"`);
      res.json({ exportedAt: new Date().toISOString(), totalRows: events.length, events });
    }
  }
);

// GET /api/audit-log — paginated audit log viewer
router.get(
  "/",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const page     = Math.max(1, Number(req.query.page)     || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

    // Build filter
    const where: Prisma.AuditEventWhereInput = {};

    // Legacy substring match (kept for backward-compat)
    const actionSubstr = req.query.action as string | undefined;
    if (actionSubstr) where.action = { contains: actionSubstr, mode: "insensitive" };

    // Exact multi-action filter (new)
    const actionsParam = req.query.actions;
    if (actionsParam) {
      const list = (Array.isArray(actionsParam) ? actionsParam : [actionsParam]) as string[];
      if (list.length > 0) where.action = { in: list };
    }

    // Date range
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate   = req.query.endDate   ? new Date(req.query.endDate   as string) : undefined;
    if (startDate || endDate) {
      where.createdAt = { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) };
    }

    // Actor filter (exact ID or name/email search)
    const actorId     = req.query.actorId     as string | undefined;
    const actorSearch = req.query.actorSearch as string | undefined;
    if (actorId) {
      where.actorId = actorId;
    } else if (actorSearch) {
      where.actor = {
        OR: [
          { name:  { contains: actorSearch, mode: "insensitive" } },
          { email: { contains: actorSearch, mode: "insensitive" } },
        ],
      };
    }

    // Ticket filter
    const ticketId     = req.query.ticketId     ? Number(req.query.ticketId) : undefined;
    const ticketSearch = req.query.ticketSearch as string | undefined;
    if (ticketId && !isNaN(ticketId)) {
      where.ticketId = ticketId;
    } else if (ticketSearch) {
      where.ticket = {
        OR: [
          { ticketNumber: { contains: ticketSearch, mode: "insensitive" } },
          { subject:      { contains: ticketSearch, mode: "insensitive" } },
        ],
      };
    }

    const EVENT_SELECT = {
      id: true,
      action: true,
      meta: true,
      createdAt: true,
      ticketId: true,
      actor:  { select: { id: true, name: true, email: true } },
      ticket: { select: { ticketNumber: true, subject: true } },
    } as const;

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        select: EVENT_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    res.json({ events, total, page, pageSize });
  }
);

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function dateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

export default router;
