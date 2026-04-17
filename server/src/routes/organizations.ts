import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { parseId } from "../lib/parse-id";
import { validate } from "../lib/validate";
import { createOrganizationSchema, updateOrganizationSchema } from "core/schemas/organizations.ts";
import prisma from "../db";

const router = Router();

// ── List organizations ────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const take = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Math.max(Number(req.query.offset) || 0, 0);
  const activeOnly = req.query.active !== "false";

  const where = {
    ...(activeOnly && { isActive: true }),
    ...(search && {
      name: { contains: search, mode: "insensitive" as const },
    }),
  };

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { name: "asc" },
      take,
      skip,
      select: {
        id: true,
        name: true,
        domain: true,
        website: true,
        industry: true,
        country: true,
        supportTier: true,
        isActive: true,
        createdAt: true,
        accountManager: { select: { id: true, name: true } },
        _count: { select: { customers: true } },
      },
    }),
    prisma.organization.count({ where }),
  ]);

  res.json({ organizations, total });
});

// ── Get single organization ───────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      accountManager: { select: { id: true, name: true } },
      entitlements: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      customers: {
        orderBy: [{ isVip: "desc" }, { name: "asc" }],
        take: 100,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          jobTitle: true,
          isVip: true,
          supportTier: true,
          preferredChannel: true,
          _count: { select: { tickets: true } },
        },
      },
    },
  });

  if (!organization) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  // Ticket summary for the org (aggregate across all customers)
  const ticketStats = await prisma.ticket.groupBy({
    by: ["status"],
    where: { customer: { organizationId: id } },
    _count: { _all: true },
  });

  res.json({ organization, ticketStats });
});

// ── Create organization ───────────────────────────────────────────────────────

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const data = validate(createOrganizationSchema, req.body, res);
  if (!data) return;

  if (data.domain) {
    const existing = await prisma.organization.findUnique({ where: { domain: data.domain } });
    if (existing) {
      res.status(409).json({ error: "An organization with that domain already exists" });
      return;
    }
  }

  const organization = await prisma.organization.create({
    data: {
      name: data.name,
      domain: data.domain ?? null,
      website: data.website ?? null,
      industry: data.industry ?? null,
      employeeCount: data.employeeCount ?? null,
      country: data.country ?? null,
      address: data.address ?? null,
      supportTier: data.supportTier ?? "standard",
      accountManagerId: data.accountManagerId ?? null,
      notes: data.notes ?? null,
    },
    include: {
      accountManager: { select: { id: true, name: true } },
    },
  });

  res.status(201).json({ organization });
});

// ── Update organization ───────────────────────────────────────────────────────

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  const data = validate(updateOrganizationSchema, req.body, res);
  if (!data) return;

  const exists = await prisma.organization.findUnique({ where: { id } });
  if (!exists) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  if (data.domain && data.domain !== exists.domain) {
    const conflict = await prisma.organization.findUnique({ where: { domain: data.domain } });
    if (conflict) {
      res.status(409).json({ error: "An organization with that domain already exists" });
      return;
    }
  }

  const organization = await prisma.organization.update({
    where: { id },
    data,
    include: {
      accountManager: { select: { id: true, name: true } },
    },
  });

  res.json({ organization });
});

// ── Delete organization ───────────────────────────────────────────────────────

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  const exists = await prisma.organization.findUnique({
    where: { id },
    include: { _count: { select: { customers: true } } },
  });
  if (!exists) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  if (exists._count.customers > 0) {
    // Soft-delete: deactivate rather than deleting to preserve historical data
    const organization = await prisma.organization.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({ organization, deactivated: true });
    return;
  }

  await prisma.organization.delete({ where: { id } });
  res.status(204).send();
});

export default router;
