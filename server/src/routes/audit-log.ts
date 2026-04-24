import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { getSection } from "../lib/settings";
import prisma from "../db";

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
    const action   = req.query.action as string | undefined;

    const where = action ? { action: { contains: action } } : {};

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
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
