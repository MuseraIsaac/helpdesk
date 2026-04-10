import prisma from "../db";

/**
 * Find or create a Customer by email.
 *
 * - On first seen email: creates a new Customer record with the provided name.
 * - On repeat email: leaves the existing record untouched (name may have been
 *   updated manually by an agent, so we don't overwrite it here).
 *
 * Returns the customer id so callers can set ticket.customerId.
 */
export async function upsertCustomer(email: string, name: string): Promise<number> {
  const customer = await prisma.customer.upsert({
    where: { email },
    update: {},
    create: { email, name },
    select: { id: true },
  });
  return customer.id;
}
