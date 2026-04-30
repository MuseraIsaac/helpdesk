import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn, useSession } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import { useAuthProviders } from "@/lib/useAuthProviders";
import { agentLoginVars } from "@/lib/portalColor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router";
import {
  Loader2, Shield, Zap, BarChart2, GitBranch,
  Mail, Lock, ChevronRight, Sparkles, CheckCircle2,
  ExternalLink,
} from "lucide-react";

const loginSchema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginFormData = z.infer<typeof loginSchema>;

// ── Feature highlights shown on the brand panel ────────────────────────────────

const FEATURES = [
  { icon: Zap,       text: "AI-powered ticket classification & auto-resolution" },
  { icon: Shield,    text: "SLA tracking, escalation rules, and audit logging" },
  { icon: GitBranch, text: "Full ITIL suite — incidents, changes, problems & more" },
  { icon: BarChart2, text: "Real-time analytics and customisable dashboards" },
] as const;

// ── Google "G" mark — multi-color official logo ──────────────────────────────

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.3h5.9c-.2 1.4-1 2.5-2.1 3.3v2.7h3.4c2-1.8 3.1-4.6 3.1-8z" />
      <path fill="#34A853" d="M12 23c2.8 0 5.2-.9 6.9-2.5l-3.4-2.7c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.6v2.7C4.3 20.7 7.9 23 12 23z" />
      <path fill="#FBBC05" d="M6.2 14.5c-.2-.6-.3-1.3-.3-1.9s.1-1.3.3-1.9V8H2.6C1.9 9.4 1.5 11 1.5 12.6s.4 3.2 1.1 4.6l3.6-2.7z" />
      <path fill="#EA4335" d="M12 6.4c1.5 0 2.9.5 3.9 1.5l3-2.9C17.2 3.4 14.8 2.5 12 2.5 7.9 2.5 4.3 4.8 2.6 8l3.6 2.7C7 8.2 9.3 6.4 12 6.4z" />
    </svg>
  );
}

// ── Decorative SVG grid ───────────────────────────────────────────────────────

function GridPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.07]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}

// ── Animated logo mark ────────────────────────────────────────────────────────

function LogoMark({ src, company }: { src?: string; company?: string }) {
  const letter = (company ?? "Z")[0]?.toUpperCase() ?? "Z";
  if (src) {
    return (
      <img
        src={src}
        alt={company ?? "Logo"}
        className="h-11 w-11 rounded-2xl object-contain shadow-lg"
      />
    );
  }
  return (
    <div className="h-11 w-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shadow-lg backdrop-blur-sm">
      <span className="text-white font-black text-xl">{letter}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { data: branding } = useBranding();
  const { data: authProviders } = useAuthProviders();
  const googleEnabled = authProviders?.google ?? false;

  const logoDataUrl      = branding?.logoDataUrl;
  const companyName      = branding?.companyName      || "Zentra";
  const platformSubtitle = branding?.platformSubtitle || "Service Desk";
  const primaryColor     = branding?.primaryColor     || "#4F46E5";
  const panelColor     = branding?.agentLoginPanelColor || "#6366f1";
  const agentHeadline  = branding?.agentLoginHeadline   || "Resolve faster.";
  const agentHighlight = branding?.agentLoginHighlight  || "Deliver better.";
  const agentTagline   = branding?.agentLoginTagline    || "The modern helpdesk built for IT teams who want to move fast without breaking things.";
  const agentBadge     = branding?.agentLoginBadge      || "AI-Powered Service Management";
  const panelVars      = agentLoginVars(panelColor);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (data: LoginFormData) => {
    setServerError("");
    const { error } = await signIn.email(data);
    if (error) { setServerError(error.message ?? "Login failed"); return; }
    navigate("/", { replace: true });
  };

  async function handleGoogleSignIn() {
    setServerError("");
    // Anchor the callback to the SPA origin so the OAuth round-trip lands on
    // the React client (e.g. http://localhost:5173/) and not on the Express
    // API host (which would 404).
    const { error } = await signIn.social({
      provider:    "google",
      callbackURL: `${window.location.origin}/`,
    });
    if (error) setServerError(error.message ?? "Google sign-in failed");
  }

  return (
    <div className="min-h-screen flex" style={panelVars}>

      {/* ── Left brand panel ───────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col overflow-hidden"
        style={{ background: "linear-gradient(135deg, var(--al-dk1) 0%, var(--al-dk2) 45%, var(--al-dk3) 100%)" }}
      >
        <GridPattern />

        {/* Glow orbs */}
        <div
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full blur-[100px] opacity-30 pointer-events-none"
          style={{ backgroundColor: "var(--al-glow)" }}
        />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full blur-[120px] opacity-15 pointer-events-none"
          style={{ backgroundColor: "var(--al-dk2)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full blur-[80px] opacity-10 pointer-events-none"
          style={{ backgroundColor: "var(--al-lt)" }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo + name */}
          <div className="flex items-center gap-3">
            <LogoMark src={logoDataUrl} company={companyName} />
            <div>
              <p className="text-white font-bold text-lg leading-tight tracking-tight">{companyName}</p>
              <p className="text-white/50 text-[11px] uppercase tracking-widest font-medium">{platformSubtitle}</p>
            </div>
          </div>

          {/* Hero text */}
          <div className="mt-auto mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-xs text-white/70 mb-6 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 text-indigo-300" />
              {agentBadge}
            </div>

            <h2 className="text-4xl xl:text-5xl font-black text-white leading-[1.1] tracking-tight mb-4">
              {agentHeadline}<br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, #a78bfa, #60a5fa, #34d399)` }}
              >
                {agentHighlight}
              </span>
            </h2>
            <p className="text-white/55 text-base leading-relaxed max-w-sm">
              {agentTagline}
            </p>

            {/* Feature list */}
            <div className="mt-8 space-y-3.5">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-indigo-300" />
                  </div>
                  <p className="text-white/65 text-sm leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-white/25 text-xs mt-auto">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right form panel ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12 relative">

        {/* Subtle background texture */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.08),transparent)] pointer-events-none" />

        {/* Mobile-only logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-base">{companyName[0]?.toUpperCase()}</span>
            </div>
          )}
          <span className="font-bold text-lg tracking-tight">{companyName}</span>
        </div>

        <div className="w-full max-w-[400px] relative z-10">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-black tracking-tight text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in to your {platformSubtitle} account to continue
            </p>
          </div>

          {/* Error banner */}
          {serverError && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{serverError}</span>
            </div>
          )}

          {/* Google sign-in — only shown when configured in Settings → Integrations */}
          {googleEnabled && (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full h-11 font-medium gap-2 mb-4"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
              >
                <GoogleIcon />
                Continue with Google
              </Button>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-[11px] uppercase tracking-widest text-muted-foreground/70">
                    or sign in with email
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <span>•</span> {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className="pl-10 pr-12 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
                  {...register("password")}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <span>•</span> {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              size="lg"
              className="w-full h-11 font-semibold gap-2 mt-2 shadow-sm"
              disabled={isSubmitting}
              style={!isSubmitting ? {
                background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
                boxShadow: `0 4px 16px ${primaryColor}40`,
              } : undefined}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
              ) : (
                <>Sign in <ChevronRight className="h-4 w-4 opacity-70" /></>
              )}
            </Button>
          </form>

          {/* Trust badges */}
          <div className="mt-8 pt-5 border-t border-border/40">
            <div className="flex items-center justify-center gap-5 text-[11px] text-muted-foreground/50">
              {[
                { icon: Shield,       label: "Secure login" },
                { icon: CheckCircle2, label: "SOC 2 ready" },
                { icon: Lock,         label: "Encrypted" },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Customer portal link */}
          <div className="mt-5 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Need support as a customer?</p>
              <Link
                to="/portal/login"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-4 transition-colors"
              >
                Go to Support Portal
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom footer */}
        <div className="absolute bottom-6 flex items-center gap-3">
          <div className="h-px w-8 bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5 shadow-[0_1px_8px_0_rgba(0,0,0,0.07)] backdrop-blur-sm">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-muted border border-border/60 shrink-0 shadow-sm">
              <img src="/favicon.png" alt="" aria-hidden className="h-2.5 w-2.5 object-contain" />
            </span>
            <span className="text-[10.5px] text-muted-foreground/50 font-medium tracking-wide">Powered by</span>
            <span className="text-[10.5px] font-black tracking-tight text-foreground/65">Zentra</span>
            <div className="h-3 w-px bg-border/70 shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/40">ITSM</span>
          </div>
          <div className="h-px w-8 bg-gradient-to-l from-transparent via-border/40 to-transparent" />
        </div>
      </div>
    </div>
  );
}
