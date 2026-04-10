/**
 * One-time backfill: create Customer records from existing ticket sender data
 * and link those tickets to their new customer.
 *
 * Safe to run multiple times — uses upsert and only updates tickets where
 * customerId is still NULL.
 *
 * Usage (from the server/ directory):
 *   bun run prisma/backfill-customers.ts
 */
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching all tickets without a customer link…");

  const tickets = await prisma.ticket.findMany({
    where: { customerId: null },
    select: {
      id: true,
      senderEmail: true,
      senderName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (tickets.length === 0) {
    console.log("Nothing to backfill — all tickets already have a customer.");
    return;
  }

  // Deduplicate: for each email keep the name from the earliest ticket.
  const customerMap = new Map<string, string>();
  for (const t of tickets) {
    if (!customerMap.has(t.senderEmail)) {
      customerMap.set(t.senderEmail, t.senderName);
    }
  }

  console.log(`Creating / upserting ${customerMap.size} customer record(s)…`);

  let customersUpserted = 0;
  let ticketsLinked = 0;

  for (const [email, name] of customerMap) {
    const customer = await prisma.customer.upsert({
      where: { email },
      update: {},
      create: { email, name },
      select: { id: true },
    });

    const { count } = await prisma.ticket.updateMany({
      where: { senderEmail: email, customerId: null },
      data: { customerId: customer.id },
    });

    customersUpserted++;
    ticketsLinked += count;
  }

  console.log(
    `Done. ${customersUpserted} customer(s) upserted, ${ticketsLinked} ticket(s) linked.`
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
