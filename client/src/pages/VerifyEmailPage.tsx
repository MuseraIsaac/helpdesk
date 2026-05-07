import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import axios from "axios";
import { useBranding } from "@/lib/useBranding";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, AlertTriangle, MailCheck, ArrowRight,
} from "lucide-react";

/**
 * /verify-email?token=…
 *
 * Lands here from the verification email. POSTs the token to Better Auth's
 * built-in /api/auth/verify-email endpoint and shows a styled status panel.
 * On success, links the user straight to the sign-in screen.
 */
type Status = "verifying" | "success" | "error" | "missing-token";

export default function VerifyEmailPage() {
  const location = useLocation();
  const isPortal = location.pathname.startsWith("/portal");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { data: branding } = useBranding();

  const companyName = branding?.companyName || "Zentra";
  const logoDataUrl = branding?.logoDataUrl;
  const loginPath   = isPortal ? "/portal/login" : "/login";

  const accent = isPortal
    ? { bg: "bg-emerald-700 hover:bg-emerald-800", text: "text-emerald-700 dark:text-emerald-400" }
    : { bg: "bg-indigo-700 hover:bg-indigo-800", text: "text-indigo-700 dark:text-indigo-400" };

  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing-token");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // Better Auth's verify-email endpoint accepts ?token=… as a GET.
        await axios.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (!cancelled) setStatus("success");
      } catch (err) {
        if (cancelled) return;
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? "Verification link is invalid or has expired.";
        setMessage(msg);
        setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.06),transparent)] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex items-center gap-2.5 mb-10">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${accent.bg}`}>
              <MailCheck className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="text-base font-semibold tracking-tight text-foreground">{companyName}</span>
        </div>

        <div className="space-y-6">
          {status === "verifying" && (
            <Panel
              icon={<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
              title="Verifying your email…"
              description="Hang tight — this only takes a moment."
            />
          )}

          {status === "success" && (
            <Panel
              icon={<CheckCircle2 className={`h-7 w-7 ${accent.text}`} />}
              title="Email verified"
              description="Your address is confirmed. You can now sign in to your account."
            >
              <Button asChild size="lg" className={`w-full h-11 mt-2 font-semibold gap-2 text-white ${accent.bg}`}>
                <Link to={loginPath}>
                  Continue to sign in <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </Panel>
          )}

          {status === "error" && (
            <Panel
              icon={<AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />}
              title="We couldn't verify this link"
              description={message ?? "The verification link is invalid or has expired."}
            >
              <p className="text-xs text-muted-foreground mt-1">
                Ask an administrator to resend a new verification email, or try signing in — you'll be prompted again if verification is still required.
              </p>
              <Button asChild variant="outline" size="lg" className="w-full h-11 mt-3 font-semibold">
                <Link to={loginPath}>Back to sign in</Link>
              </Button>
            </Panel>
          )}

          {status === "missing-token" && (
            <Panel
              icon={<AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />}
              title="Verification token missing"
              description="This page must be opened from the link in your verification email."
            >
              <Button asChild variant="outline" size="lg" className="w-full h-11 mt-3 font-semibold">
                <Link to={loginPath}>Back to sign in</Link>
              </Button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  icon, title, description, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-6 text-center space-y-3">
      <div className="flex justify-center">{icon}</div>
      <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      {children}
    </div>
  );
}
