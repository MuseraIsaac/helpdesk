import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranding } from "@/lib/useBranding";
import {
  Loader2, Lock, ShieldCheck, KeyRound, ArrowRight,
  AlertTriangle,
} from "lucide-react";
import PasswordPolicyChecklist, {
  usePasswordPolicy,
  isPasswordCompliant,
} from "@/components/PasswordPolicyChecklist";

interface FormData {
  currentPassword: string;
  newPassword:     string;
  confirmPassword: string;
}

/**
 * /change-password — destination for users flagged with `mustChangePassword`.
 *
 * Looks like the login page (same brand chrome, same accent) so the transition
 * from sign-in feels seamless. The submit button stays disabled until every
 * password policy rule passes and the confirmation matches.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: branding } = useBranding();
  const { data: policy } = usePasswordPolicy();

  const companyName = branding?.companyName || "Zentra";
  const logoDataUrl = branding?.logoDataUrl;

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm<FormData>({ defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });

  const newPassword     = watch("newPassword")     ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";
  const policyOk        = isPasswordCompliant(newPassword, policy);
  const matches         = newPassword.length > 0 && newPassword === confirmPassword;

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      setServerError(null);
      if (!policyOk) throw new Error("Password doesn't meet the security requirements below.");
      if (!matches)  throw new Error("New password and confirmation don't match.");
      await axios.post("/api/users/me/change-password", {
        currentPassword: data.currentPassword,
        newPassword:     data.newPassword,
      });
    },
    onSuccess: async () => {
      // Bust the /me cache so ProtectedRoute reads the fresh `mustChangePassword=false`.
      await queryClient.invalidateQueries({ queryKey: ["users", "me"] });
      navigate("/", { replace: true });
    },
    onError: (err) => {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error ?? err.message
        : err instanceof Error ? err.message : "Something went wrong";
      setServerError(msg);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.06),transparent)] pointer-events-none" />

      <div className="w-full max-w-[440px] relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-8">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt={companyName} className="h-9 w-9 rounded-xl object-contain" />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-indigo-700 flex items-center justify-center">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="text-base font-semibold tracking-tight text-foreground">{companyName}</span>
        </div>

        {/* Welcome banner */}
        <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent p-5 mb-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 ring-2 ring-indigo-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-foreground">Set your password</h1>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Your administrator issued a temporary password and asked you
                to choose your own before continuing. This screen is required
                — you'll be back to your work right after.
              </p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          {serverError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate className="space-y-4">
            {/* Current */}
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword" className="text-sm font-medium">
                Current temporary password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  autoComplete="current-password"
                  className="pl-10 pr-12 h-11 bg-muted/30 border-border/60 focus:bg-background"
                  {...register("currentPassword", { required: true })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground"
                >
                  {showCurrent ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* New */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-medium">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  className="pl-10 pr-12 h-11 bg-muted/30 border-border/60 focus:bg-background"
                  {...register("newPassword", { required: true })}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground"
                >
                  {showNew ? "Hide" : "Show"}
                </button>
              </div>
              <PasswordPolicyChecklist password={newPassword} alwaysShow className="mt-1" />
            </div>

            {/* Confirm */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm new password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
                <Input
                  id="confirmPassword"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background"
                  {...register("confirmPassword", { required: true })}
                />
              </div>
              {confirmPassword.length > 0 && !matches && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <span>•</span> Passwords don't match.
                </p>
              )}
              {errors.confirmPassword && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <span>•</span> Please confirm your new password.
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-11 font-semibold gap-2 mt-1 bg-indigo-700 hover:bg-indigo-800 text-white"
              disabled={mutation.isPending || !policyOk || !matches}
              style={!mutation.isPending && policyOk && matches ? { boxShadow: "0 4px 16px rgba(79,70,229,0.35)" } : undefined}
            >
              {mutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</>
                : <>Set password & continue <ArrowRight className="h-4 w-4 opacity-80" /></>}
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-muted-foreground/60 text-center mt-6">
          {companyName} · Secure password update
        </p>
      </div>
    </div>
  );
}
