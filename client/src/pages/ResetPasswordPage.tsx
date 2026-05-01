import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { resetPassword } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Lock, ArrowLeft, ChevronRight, CheckCircle2,
  HeadphonesIcon, AlertTriangle,
} from "lucide-react";

const schema = z
  .object({
    password:        z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const location = useLocation();
  const isPortal = location.pathname.startsWith("/portal");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { data: branding } = useBranding();

  const companyName = branding?.companyName || "Zentra";
  const logoDataUrl = branding?.logoDataUrl;
  const loginPath = isPortal ? "/portal/login" : "/login";

  const accent = isPortal
    ? { bg: "bg-emerald-700 hover:bg-emerald-800", text: "text-emerald-700 dark:text-emerald-400", glow: "0 4px 16px rgba(5,150,105,0.35)" }
    : { bg: "bg-indigo-700 hover:bg-indigo-800", text: "text-indigo-700 dark:text-indigo-400", glow: "0 4px 16px rgba(79,70,229,0.35)" };

  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      setServerError(null);
      const res = await resetPassword({ newPassword: data.password, token });
      if (res?.error) {
        // Better Auth surfaces token-expired / invalid as `error.message`.
        throw new Error(res.error.message ?? "Reset failed");
      }
    },
    onSuccess: () => {
      setDone(true);
      setTimeout(() => navigate(loginPath, { replace: true }), 2500);
    },
    onError: (err) => setServerError(err instanceof Error ? err.message : "Reset failed"),
  });

  const tokenMissing = !token;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.06),transparent)] pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        <div className="flex items-center gap-2.5 mb-10">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${isPortal ? "bg-emerald-600" : "bg-indigo-600"}`}>
              <HeadphonesIcon className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="font-bold text-lg tracking-tight">{companyName}</span>
        </div>

        <Link
          to={loginPath}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </Link>

        {tokenMissing ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Invalid reset link</p>
                <p className="mt-1 text-destructive/80">
                  This URL is missing the reset token. Request a new link from the{" "}
                  <Link
                    to={isPortal ? "/portal/forgot-password" : "/forgot-password"}
                    className="underline font-medium"
                  >
                    forgot password page
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-border/60 bg-card p-7 shadow-sm text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Password updated</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Your password has been reset. Redirecting you to sign in…
            </p>
            <Link
              to={loginPath}
              className={`mt-5 inline-block text-sm font-semibold ${accent.text} hover:underline`}
            >
              Sign in now
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Set a new password
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Choose something strong — at least 8 characters.
              </p>
            </div>

            {serverError && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{serverError}</span>
              </div>
            )}

            <form
              onSubmit={handleSubmit((d) => mutation.mutate(d))}
              noValidate
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  New password
                </Label>
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
                    onClick={() => setShowPassword((v) => !v)}
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

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm new password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Re-enter your password"
                    className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
                    {...register("confirmPassword")}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <span>•</span> {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className={`w-full h-11 font-semibold gap-2 mt-2 text-white ${accent.bg}`}
                disabled={mutation.isPending}
                style={!mutation.isPending ? { boxShadow: accent.glow } : undefined}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating password…
                  </>
                ) : (
                  <>
                    Update password
                    <ChevronRight className="h-4 w-4 opacity-70" />
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </div>

      <p className="absolute bottom-6 text-[11px] text-muted-foreground/40">
        {companyName} {isPortal ? "· Customer Support Portal" : ""}
      </p>
    </div>
  );
}
