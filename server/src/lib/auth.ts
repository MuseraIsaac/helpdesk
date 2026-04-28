import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Role } from "core/constants/role.ts";
import prisma from "../db";
import { logSystemAudit } from "./audit";

// ── Social provider config ────────────────────────────────────────────────────
//
// Google OAuth is enabled when both env vars are set. If they're absent we
// don't include the `socialProviders` block at all — Better Auth then simply
// hides the provider and the client-side button reports an error.

const googleClientId     = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled      = !!(googleClientId && googleClientSecret);

export const auth = betterAuth({
  basePath: "/api/auth",
  trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") ?? [],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  ...(googleEnabled && {
    socialProviders: {
      google: {
        clientId:     googleClientId!,
        clientSecret: googleClientSecret!,
      },
    },
  }),
  /**
   * Account linking — when someone signs in with Google using an email that
   * already matches a user record, Better Auth attaches the Google `account`
   * row to the existing user instead of failing. The existing user's role
   * is preserved (admin / supervisor / agent / readonly), so internal staff
   * can use Google sign-in too without losing their permissions.
   */
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: Role.agent,
        input: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        /**
         * Fires when Better Auth itself creates a user — i.e. only on social
         * OAuth sign-up (email/password sign-up is disabled, and admin-created
         * users go through /api/users which writes Prisma directly).
         *
         * Any user who arrives via Google without a pre-existing account is
         * a new customer self-onboarding through the portal, so we force
         * their role to `customer`. Existing users matched by email are
         * linked via accountLinking above and never reach this hook.
         */
        before: async (user) => {
          return {
            data: {
              ...user,
              role: Role.customer,
            },
          };
        },
      },
    },
    session: {
      create: {
        // Fires after a session row is inserted — i.e. on every successful login.
        after: async (session) => {
          void logSystemAudit(session.userId, "auth.login", {
            ip:        (session as { ipAddress?: string }).ipAddress ?? null,
            userAgent: (session as { userAgent?: string }).userAgent ?? null,
          });
        },
      },
    },
  },
});
