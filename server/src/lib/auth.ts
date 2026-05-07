import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Role } from "core/constants/role.ts";
import prisma from "../db";
import { logSystemAudit } from "./audit";

// ── Reloadable Better Auth instance ──────────────────────────────────────────
//
// Google OAuth credentials can come from two sources:
//   1. Settings DB (Settings → Integrations → Google Sign-In). Active when
//      `googleSignInEnabled` is true and both client id + secret are present.
//   2. Env vars GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Used as fallback for
//      installations that pre-date the UI configuration.
//
// Because settings can change at runtime, we wrap the Better Auth instance in
// a Proxy. Callers (`auth.api.getSession(...)`, `toNodeHandler(auth)`) always
// see the current instance even after `reloadAuth()` rebuilds it.

function buildAuth(opts: {
  googleClientId?: string;
  googleClientSecret?: string;
  requireEmailVerification?: boolean;
}) {
  const googleEnabled = !!(opts.googleClientId && opts.googleClientSecret);

  return betterAuth({
    basePath: "/api/auth",
    trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") ?? [],
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    /**
     * Email verification — sends the one-time link via the existing outbound
     * email worker. The user lands on the in-app /verify-email page which
     * POSTs the token back to /api/auth/verify-email.
     */
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url, token }) => {
        const { sendEmailJob } = await import("./send-email");
        const appOrigin =
          process.env.APP_URL ||
          process.env.BETTER_AUTH_URL ||
          process.env.BETTER_AUTH_BASE_URL ||
          "";
        // Better Auth gives us its own callback URL; rewrite to our in-app
        // verification page so the user lands on a styled confirmation.
        const verifyUrl = appOrigin
          ? `${appOrigin.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`
          : url;
        const subject = "Verify your email";
        const text =
          `Hi ${user.name || "there"},\n\n` +
          `Welcome to the helpdesk! Please confirm your email address by ` +
          `opening the link below (valid for 24 hours):\n${verifyUrl}\n\n` +
          `If you didn't expect this email, you can safely ignore it.\n`;
        const html =
          `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#111;max-width:560px">` +
          `<p>Hi ${user.name || "there"},</p>` +
          `<p>Welcome to the helpdesk! Please confirm your email address by clicking the button below — the link is valid for 24 hours.</p>` +
          `<p style="margin:24px 0"><a href="${verifyUrl}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Verify email</a></p>` +
          `<p style="font-size:12px;color:#666">Or copy this link into your browser:<br><span style="word-break:break-all">${verifyUrl}</span></p>` +
          `<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">` +
          `<p style="font-size:12px;color:#666">If you didn't expect this email, you can safely ignore it.</p>` +
          `</div>`;
        await sendEmailJob({ to: user.email, subject, body: text, bodyHtml: html, purpose: "notifications" });
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      // Block sign-in for users with `emailVerified=false` when the policy is
      // on. Better Auth returns its standard EMAIL_NOT_VERIFIED error which
      // the login page converts into a friendly inline message.
      requireEmailVerification: opts.requireEmailVerification ?? false,
      /**
       * Better Auth invokes this when a user posts to /api/auth/forget-password.
       * The reset URL it provides already includes the secure token; we just
       * deliver it via the existing outbound-email worker. The link points to
       * the customer portal by default; the agent reset page accepts the same
       * `?token=` query string.
       */
      sendResetPassword: async ({ user, url }) => {
        const { sendEmailJob } = await import("./send-email");
        const appOrigin =
          process.env.APP_URL ||
          process.env.BETTER_AUTH_URL ||
          process.env.BETTER_AUTH_BASE_URL ||
          "";
        // Better Auth's default URL points to its own callback. We rewrite to
        // the in-app reset page so the user lands on a styled form, then the
        // form posts back to /api/auth/reset-password.
        const tokenMatch = url.match(/[?&]token=([^&]+)/);
        const token = tokenMatch?.[1] ?? "";
        const resetUrl = appOrigin
          ? `${appOrigin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`
          : url;

        const subject = "Reset your password";
        const text =
          `Hi ${user.name || "there"},\n\n` +
          `We received a request to reset the password for your account.\n\n` +
          `Click the link below to set a new password (valid for 1 hour):\n` +
          `${resetUrl}\n\n` +
          `If you didn't request this, you can safely ignore this email — your password won't change.\n`;
        const html =
          `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;color:#111;max-width:560px">` +
          `<p>Hi ${user.name || "there"},</p>` +
          `<p>We received a request to reset the password for your account. Click the button below to set a new password — the link is valid for 1 hour.</p>` +
          `<p style="margin:24px 0"><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Reset password</a></p>` +
          `<p style="font-size:12px;color:#666">Or copy this link into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>` +
          `<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">` +
          `<p style="font-size:12px;color:#666">If you didn't request this, you can safely ignore this email — your password won't change.</p>` +
          `</div>`;

        await sendEmailJob({ to: user.email, subject, body: text, bodyHtml: html, purpose: "notifications" });
      },
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    },
    ...(googleEnabled && {
      socialProviders: {
        google: {
          clientId:     opts.googleClientId!,
          clientSecret: opts.googleClientSecret!,
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
        mustChangePassword: {
          type: "boolean",
          required: false,
          defaultValue: false,
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
}

type AuthInstance = ReturnType<typeof buildAuth>;

// Initial sync build using only env vars. `reloadAuth()` is awaited at boot
// (see `index.ts`) so settings-based credentials are applied before listen.
let _instance: AuthInstance = buildAuth({
  googleClientId:     process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  requireEmailVerification: false,
});

let _googleEnabled =
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/**
 * Resolve the active Google Sign-In credentials from settings (preferred) or
 * env vars (back-compat). Returns `{}` when sign-in is disabled or unconfigured.
 */
async function resolveGoogleCreds(): Promise<{
  googleClientId?: string;
  googleClientSecret?: string;
}> {
  try {
    const { getSection } = await import("./settings");
    const s = (await getSection("integrations")) as Record<string, unknown>;
    const enabled = s.googleSignInEnabled === true;
    const id     = (s.googleSignInClientId     as string) || "";
    const secret = (s.googleSignInClientSecret as string) || "";

    if (enabled && id && secret) {
      return { googleClientId: id, googleClientSecret: secret };
    }
    // Settings exist but disabled / incomplete — fall back to env only when
    // the user hasn't started configuring via the UI.
    if (!enabled && !id && !secret) {
      return {
        googleClientId:     process.env.GOOGLE_CLIENT_ID,
        googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      };
    }
    // Explicitly disabled or partially configured — disable.
    return {};
  } catch {
    return {
      googleClientId:     process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
}

/** Read the current "require email verification" policy from Settings → Security. */
async function resolveEmailVerificationPolicy(): Promise<boolean> {
  try {
    const { getSection } = await import("./settings");
    const s = await getSection("security");
    return s.requireEmailVerification === true;
  } catch {
    return false;
  }
}

/**
 * Rebuild the Better Auth instance from the latest settings. Call this on
 * boot and after any change to integration / security settings that touches
 * sign-in (Google creds, email verification policy).
 */
export async function reloadAuth(): Promise<void> {
  const [creds, requireEmailVerification] = await Promise.all([
    resolveGoogleCreds(),
    resolveEmailVerificationPolicy(),
  ]);
  _instance = buildAuth({ ...creds, requireEmailVerification });
  _googleEnabled = !!(creds.googleClientId && creds.googleClientSecret);
}

/** Returns true when Google sign-in is currently active. */
export function isGoogleSignInEnabled(): boolean {
  return _googleEnabled;
}

/**
 * The exported `auth` is a Proxy that always forwards property access to the
 * current Better Auth instance. Existing call sites (`auth.api.getSession`,
 * `toNodeHandler(auth)`) work unchanged after `reloadAuth()`.
 */
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(_instance as object, prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(_instance as object, prop);
  },
  ownKeys() {
    return Reflect.ownKeys(_instance as object);
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(_instance as object, prop);
  },
});
