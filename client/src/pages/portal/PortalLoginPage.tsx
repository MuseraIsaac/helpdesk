import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn, useSession } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import { portalAccentVars } from "@/lib/portalColor";
import { Role } from "core/constants/role.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Mail, Lock, ChevronRight,
  Ticket, MessageSquare, Clock, CheckCircle2,
  ArrowLeft, Sparkles, HeadphonesIcon,
} from "lucide-react";

const loginSchema = z.object({
  email: z.email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginFormData = z.infer<typeof loginSchema>;

const PORTAL_FEATURES = [
  { icon: Ticket,         text: "Submit and track support tickets in real time" },
  { icon: MessageSquare,  text: "Communicate directly with our support team" },
  { icon: Clock,          text: "View ticket history and resolution timelines" },
  { icon: CheckCircle2,   text: "Access the self-service catalog for common requests" },
] as const;

function DotPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  );
}

export default function PortalLoginPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { data: branding } = useBranding();

  const logoDataUrl     = branding?.logoDataUrl;
  const companyName     = branding?.companyName     || "Zentra";
  const accentColor     = branding?.portalAccentColor || "#059669";
  const loginHeadline   = branding?.portalLoginHeadline  || "We're here";
  const loginHighlight  = branding?.portalLoginHighlight || "to help you.";
  const loginTagline    = branding?.portalLoginTagline   || "Access your support requests, track resolutions, and get help from our team — all in one place.";
  const loginBadge      = branding?.portalLoginBadge     || "Self-service support, anytime";
  const accentVars      = portalAccentVars(accentColor);

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
            <HeadphonesIcon className="h-5 w-5 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (session) {
    return session.user.role === Role.customer
      ? <Navigate to="/portal/tickets" replace />
      : <Navigate to="/" replace />;
  }

  const onSubmit = async (data: LoginFormData) => {
    setServerError("");
    const { error } = await signIn.email(data);
    if (error) {
      setServerError(error.message ?? "Login failed. Check your email and password.");
      return;
    }
    navigate("/portal/tickets", { replace: true });
  };

  return (
    <div className="min-h-screen flex" style={accentVars}>

      {/* ── Left brand panel ───────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] xl:w-[50%] relative flex-col overflow-hidden"
        style={{ background: "linear-gradient(135deg, var(--pa-dkr) 0%, var(--pa-dk) 40%, var(--pa) 100%)" }}
      >
        <DotPattern />

        {/* Glow orbs */}
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-[90px] opacity-20 pointer-events-none" style={{ backgroundColor: "var(--pa-lt)" }} />
        <div className="absolute -bottom-16 -right-16 h-64 w-64 rounded-full blur-[100px] opacity-15 pointer-events-none" style={{ backgroundColor: "var(--pa-lt)" }} />
        <div className="absolute top-1/2 right-0 h-48 w-48 rounded-full blur-[70px] opacity-10 pointer-events-none" style={{ backgroundColor: "var(--pa-lt)" }} />

        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo + name */}
          <div className="flex items-center gap-3">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt={companyName} className="h-10 w-10 rounded-xl object-contain shadow-lg" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shadow-lg backdrop-blur-sm">
                <HeadphonesIcon className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-base leading-tight tracking-tight">{companyName}</p>
              <p className="text-white/50 text-[10px] uppercase tracking-widest font-medium">Support Portal</p>
            </div>
          </div>

          {/* Hero */}
          <div className="mt-auto mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-xs text-white/70 mb-5 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" style={{ color: "var(--pa-lt)" }} />
              {loginBadge}
            </div>

            <h2 className="text-4xl xl:text-[2.75rem] font-black text-white leading-[1.1] tracking-tight mb-3">
              {loginHeadline}<br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, var(--pa-lt), white, var(--pa-lt))" }}
              >
                {loginHighlight}
              </span>
            </h2>
            <p className="text-white/55 text-sm leading-relaxed max-w-sm">
              {loginTagline}
            </p>

            <div className="mt-7 space-y-3">
              {PORTAL_FEATURES.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5" style={{ color: "var(--pa-lt)" }} />
                  </div>
                  <p className="text-white/65 text-sm leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-white/25 text-xs">
              © {new Date().getFullYear()} {companyName}. All rights reserved.
            </p>
            {/* Powered-by — white-toned pill for the dark brand panel */}
            <div className="flex items-center gap-2">
              <div className="h-px w-8 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
                <span className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-white/12 border border-white/10 shrink-0">
                  <img src="/favicon.png" alt="" aria-hidden className="h-2.5 w-2.5 object-contain opacity-70" />
                </span>
                <span className="text-[10px] font-medium text-white/28 tracking-wide">Powered by</span>
                <span className="text-[10px] font-black text-white/50 tracking-tight">Zentra</span>
                <div className="h-2.5 w-px bg-white/15 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/25">ITSM</span>
              </div>
              <div className="h-px w-8 bg-gradient-to-l from-transparent via-white/12 to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12 relative">

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.06),transparent)] pointer-events-none" />

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--pa)" }}>
              <HeadphonesIcon className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="font-bold text-lg tracking-tight">{companyName} Support</span>
        </div>

        <div className="w-full max-w-[400px] relative z-10">

          {/* Back to agent login */}
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Agent login
          </Link>

          <div className="mb-7">
            <h1 className="text-2xl font-black tracking-tight text-foreground">Support Portal</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in to view and manage your support requests
            </p>
          </div>

          {serverError && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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

            <Button
              type="submit"
              size="lg"
              className="w-full h-11 font-semibold gap-2 mt-2 text-white shadow-sm border-0"
              disabled={isSubmitting}
              style={{
                backgroundColor: "var(--pa)",
                boxShadow: isSubmitting ? undefined : "0 4px 16px var(--pa-18)",
              }}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</>
              ) : (
                <>Sign in to Portal <ChevronRight className="h-4 w-4 opacity-70" /></>
              )}
            </Button>
          </form>

          {/* Register link */}
          <div className="mt-6 pt-5 border-t border-border/40 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link
                to="/portal/register"
                className="font-semibold hover:underline underline-offset-4 transition-colors"
                style={{ color: "var(--pa)" }}
              >
                Create one free
              </Link>
            </p>
          </div>
        </div>

        {/* Powered-by footer — bottom of the right panel */}
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
