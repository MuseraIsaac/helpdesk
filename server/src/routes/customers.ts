import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import { validate } from "../lib/validate";
import { createCustomerSchema, updateCustomerSchema } from "core/schemas/customers.ts";
import prisma from "../db";

const router = Router();

// ── List customers ────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const orgId = parseId(req.query.orgId as string);
  const take = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Math.max(Number(req.query.offset) || 0, 0);

  const where = {
    ...(search && {
      OR: [
        { name:  { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(orgId && { organizationId: orgId }),
  };

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ isVip: "desc" }, { name: "asc" }],
      take,
      skip,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        jobTitle: true,
        isVip: true,
        supportTier: true,
        preferredChannel: true,
        avatarUrl: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
        _count: { select: { tickets: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  res.json({ customers, total });
});

// ── Create customer ───────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res) => {
  const data = validate(createCustomerSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.customer.findUnique({ where: { email: data.email } });
  if (existing) {
    res.status(409).json({ error: "A customer with that email already exists" });
    return;
  }

  const customer = await prisma.customer.create({
    data: {
      name:             data.name,
      email:            data.email,
      phone:            data.phone ?? null,
      jobTitle:         data.jobTitle ?? null,
      timezone:         data.timezone ?? "UTC",
      language:         data.language ?? "en",
      preferredChannel: data.preferredChannel ?? null,
      isVip:            data.isVip ?? false,
      supportTier:      data.supportTier ?? "standard",
      organizationId:   data.organizationId ?? null,
      notes:            data.notes ?? null,
    },
    include: {
      organization: { select: { id: true, name: true } },
    },
  });

  res.status(201).json({ customer });
});

// ── Get single customer ───────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid customer ID" });
    return;
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      organization: {
        select: {
          id: true, name: true, domain: true, website: true,
          industry: true, supportTier: true, isActive: true,
        },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          category: true,
          slaBreached: true,
          isEscalated: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
      serviceRequests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          requestNumber: true,
          title: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json({ customer });
});

// ── Update customer ───────────────────────────────────────────────────────────

router.patch("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid customer ID" });
    return;
  }

  const data = validate(updateCustomerSchema, req.body, res);
  if (!data) return;

  const exists = await prisma.customer.findUnique({ where: { id } });
  if (!exists) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const customer = await prisma.customer.update({
    where: { id },
    data,
    include: {
      organization: { select: { id: true, name: true } },
    },
  });

  res.json({ customer });
});

export default router;
