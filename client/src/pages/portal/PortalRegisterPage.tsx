import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useSession } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import { Role } from "core/constants/role.ts";
import { portalRegisterSchema, type PortalRegisterInput } from "core/schemas/portal.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Mail, Lock, User, ChevronRight,
  ArrowLeft, HeadphonesIcon, Sparkles,
  ShieldCheck, Zap, Users,
} from "lucide-react";

const BENEFITS = [
  { icon: Zap,         text: "Instant ticket creation and status tracking" },
  { icon: ShieldCheck, text: "Secure, private communication with support staff" },
  { icon: Users,       text: "Access the self-service catalog and knowledge base" },
] as const;

function DotPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dots-reg" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="white" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots-reg)" />
    </svg>
  );
}

export default function PortalRegisterPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const { data: branding } = useBranding();

  const logoDataUrl = branding?.logoDataUrl;
  const companyName = branding?.companyName || "Zentra";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PortalRegisterInput>({ resolver: zodResolver(portalRegisterSchema) });

  const mutation = useMutation({
    mutationFn: async (data: PortalRegisterInput) => {
      await axios.post("/api/portal/register", data);
    },
    onSuccess: () => {
      navigate("/portal/login", { replace: true });
    },
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center animate-pulse">
            <HeadphonesIcon className="h-5 w-5 text-emerald-700" />
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

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] xl:w-[50%] relative flex-col overflow-hidden"
        style={{ background: "linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%)" }}
      >
        <DotPattern />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-[90px] opacity-20 pointer-events-none bg-emerald-300" />
        <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full blur-[100px] opacity-20 pointer-events-none bg-teal-400" />

        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo */}
          <div className="flex items-center gap-3">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt={companyName} className="h-10 w-10 rounded-xl object-contain shadow-lg" />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shadow-lg">
                <HeadphonesIcon className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-base leading-tight">{companyName}</p>
              <p className="text-white/50 text-[10px] uppercase tracking-widest font-medium">Support Portal</p>
            </div>
          </div>

          {/* Hero */}
          <div className="mt-auto mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-xs text-white/70 mb-5 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 text-emerald-300" />
              Free account, instant access
            </div>

            <h2 className="text-4xl xl:text-[2.75rem] font-black text-white leading-[1.1] tracking-tight mb-3">
              Get support,<br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, #6ee7b7, #a7f3d0, #d1fae5)" }}
              >
                on your terms.
              </span>
            </h2>
            <p className="text-white/55 text-sm leading-relaxed max-w-sm">
              Create a free account and start getting the help you need — submit tickets, track progress, and communicate with our team.
            </p>

            <div className="mt-7 space-y-3">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-emerald-300" />
                  </div>
                  <p className="text-white/65 text-sm leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/25 text-xs">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12 relative">

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.06),transparent)] pointer-events-none" />

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <HeadphonesIcon className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="font-bold text-lg tracking-tight">{companyName} Support</span>
        </div>

        <div className="w-full max-w-[400px] relative z-10">

          <Link
            to="/portal/login"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to sign in
          </Link>

          <div className="mb-7">
            <h1 className="text-2xl font-black tracking-tight text-foreground">Create account</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Get support by submitting and tracking your tickets
            </p>
          </div>

          {mutation.error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>
                {axios.isAxiosError(mutation.error)
                  ? (mutation.error.response?.data as { error?: string })?.error
                    ?? "Registration failed. Please try again."
                  : "Registration failed. Please try again."}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit((data) => mutation.mutate(data))} noValidate className="space-y-4">

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium">Full name</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Smith"
                  className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
                  {...register("name")}
                />
              </div>
              {errors.name && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <span>•</span> {errors.name.message}
                </p>
              )}
            </div>

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
                  placeholder="At least 8 characters"
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
              className="w-full h-11 font-semibold gap-2 mt-2 bg-emerald-700 hover:bg-emerald-800 text-white"
              disabled={mutation.isPending}
              style={!mutation.isPending ? { boxShadow: "0 4px 16px rgba(5,150,105,0.35)" } : undefined}
            >
              {mutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Creating account…</>
              ) : (
                <>Create account <ChevronRight className="h-4 w-4 opacity-70" /></>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-border/40 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/portal/login"
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="absolute bottom-6 text-[11px] text-muted-foreground/40">
          {companyName} · Customer Support Portal
        </p>
      </div>
    </div>
  );
}
