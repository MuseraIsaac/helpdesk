/**
 * Reset (or set) a user's password using Better Auth's own password hasher.
 *
 * Why this exists
 * ───────────────
 * `prisma db seed` only creates the admin once — re-running install.sh on a
 * box that already has the admin user is a no-op for the password. If the
 * operator forgets the original password, OR install.sh seeded with a
 * different default than what the operator now wants, this is the recovery
 * path. Same script also doubles as a "set known password before first
 * login" helper for ops automation.
 *
 * Usage
 * ─────
 *   # From the server folder, with the helpdesk's .env in place
 *   cd /opt/zentra/app/server
 *   RESET_EMAIL='admin@example.com' RESET_PASSWORD='Zentr@2026' \
 *     /usr/local/bin/bun scripts/reset-admin-password.ts
 *
 * Idempotent: re-running with the same args is safe — it just overwrites
 * the password hash. The user's other fields, sessions, and preferences are
 * untouched. Active sessions are NOT invalidated; if you want to also force
 * sign-out everywhere, delete from `session` after this script runs.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "better-auth/crypto";

async function main() {
  const email    = process.env.RESET_EMAIL    || process.env.SEED_ADMIN_EMAIL;
  const password = process.env.RESET_PASSWORD || process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Set RESET_EMAIL and RESET_PASSWORD (or SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD).");
    process.exit(2);
  }
  if (password.length < 8) {
    console.error("Refusing: password must be at least 8 characters (Better Auth default).");
    process.exit(3);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma  = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`No user found with email '${email}'.`);
      process.exit(4);
    }

    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });
    const hash = await hashPassword(password);

    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data:  { password: hash, updatedAt: new Date() },
      });
      console.log(`Password reset for ${email} (account row #${account.id}).`);
    } else {
      // No credential account row exists yet (e.g. user was provisioned via
      // Google sign-in only). Create one so they can sign in with a password.
      await prisma.account.create({
        data: {
          userId:     user.id,
          providerId: "credential",
          accountId:  user.id,
          password:   hash,
          createdAt:  new Date(),
          updatedAt:  new Date(),
        },
      });
      console.log(`Created credential account + password for ${email}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
