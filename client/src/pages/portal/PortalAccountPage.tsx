/**
 * PortalAccountPage — customer self-service profile page.
 * Route: /portal/account
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import axios from "axios";
import { useSession } from "@/lib/auth-client";
import { useTheme, type Theme } from "@/lib/theme";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import { toast } from "sonner";
import {
  User, Mail, Building2, Phone, Briefcase,
  Save, Loader2, Calendar, KeyRound,
  Eye, EyeOff, Sun, Moon, Monitor,
  ShieldCheck, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name:     z.string().trim().min(1, "Name is required").max(100),
  jobTitle: z.string().max(100).optional(),
  phone:    z.string().max(50).optional(),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword:     z.string().min(8, "Must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type PasswordForm = z.infer<typeof passwordSchema>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MeData {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    preference: { jobTitle: string | null; phone: string | null; timezone: string | null } | null;
  };
  customer: {
    id: number;
    jobTitle: string | null;
    phone: string | null;
    organization: { id: number; name: string } | null;
  } | null;
}

// ── Password strength ─────────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw))   score++;
  if (/[0-9]/.test(pw))   score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak",   color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair",   color: "bg-amber-500" };
  if (score <= 3) return { score, label: "Good",   color: "bg-yellow-400" };
  if (score <= 4) return { score, label: "Strong", color: "bg-emerald-500" };
  return                  { score, label: "Very strong", color: "bg-emerald-600" };
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, iconColor = "text-primary", children, className,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card overflow-hidden shadow-sm", className)}>
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/20">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        </div>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

// ── Password input ────────────────────────────────────────────────────────────

function PasswordInput({ id, placeholder, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        className="h-9 pr-9"
        {...props}
      />
      <button
        type="button"
        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Theme option ──────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light",  label: "Light",  icon: Sun     },
  { value: "dark",   label: "Dark",   icon: Moon    },
  { value: "system", label: "System", icon: Monitor },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalAccountPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();

  // ── Profile data ────────────────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery<MeData>({
    queryKey: ["portal-me"],
    queryFn: async () => {
      const { data } = await axios.get<MeData>("/api/portal/me");
      return data;
    },
  });

  // ── Profile form ────────────────────────────────────────────────────────────
  const {
    register: regProfile,
    handleSubmit: handleProfile,
    reset: resetProfile,
    formState: { isDirty: profileDirty, isSubmitting: profileSaving, errors: profileErrors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", jobTitle: "", phone: "" },
  });

  useEffect(() => {
    if (!data) return;
    resetProfile({
      name:     data.user.name,
      jobTitle: data.customer?.jobTitle ?? data.user.preference?.jobTitle ?? "",
      phone:    data.customer?.phone    ?? data.user.preference?.phone    ?? "",
    });
  }, [data, resetProfile]);

  const profileMutation = useMutation({
    mutationFn: (v: ProfileForm) => axios.patch("/api/portal/me", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portal-me"] }); toast.success("Profile updated"); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to save"),
  });

  // ── Password form ────────────────────────────────────────────────────────────
  const {
    register: regPwd,
    handleSubmit: handlePwd,
    reset: resetPwd,
    watch: watchPwd,
    formState: { isSubmitting: pwdSaving, errors: pwdErrors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPwdValue = watchPwd("newPassword");
  const strength = passwordStrength(newPwdValue);

  const [pwdSuccess, setPwdSuccess] = useState(false);

  const pwdMutation = useMutation({
    mutationFn: (v: PasswordForm) =>
      axios.post("/api/portal/me/password", {
        currentPassword: v.currentPassword,
        newPassword:     v.newPassword,
      }),
    onSuccess: () => {
      resetPwd();
      setPwdSuccess(true);
      toast.success("Password changed successfully");
      setTimeout(() => setPwdSuccess(false), 4000);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to change password"),
  });

  // ── Derived ──────────────────────────────────────────────────────────────────
  const initials = (data?.user.name ?? session?.user?.name ?? "?")
    .split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  const joinDate = data
    ? new Date(data.user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* ── Hero banner ───────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500/10 via-primary/8 to-transparent border shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,theme(colors.emerald.500/12),transparent_60%)]" />
        <div className="relative px-6 py-6 flex items-center gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-bold text-xl shadow-lg select-none ring-4 ring-background">
              {isLoading ? "?" : initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-4.5 w-4.5 rounded-full bg-emerald-500 border-2 border-background" />
          </div>

          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-56" />
              </div>
            ) : (
              <>
                <h1 className="text-lg font-bold truncate leading-tight">{data?.user.name}</h1>
                <p className="text-sm text-muted-foreground truncate mt-0.5">{data?.user.email}</p>
                {joinDate && (
                  <p className="text-[11px] text-muted-foreground/60 mt-1.5 flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Member since {joinDate}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Org badge */}
          {data?.customer?.organization && (
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 shrink-0">
              <Building2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[12px] font-medium text-emerald-700 dark:text-emerald-300 max-w-[140px] truncate">
                {data.customer.organization.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load account" />}

      {/* ── Personal Information ──────────────────────────────────────────── */}
      <SectionCard title="Personal Information" icon={User}>
        {isLoading ? (
          <div className="space-y-4">{[1,2,3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <form onSubmit={handleProfile((d) => profileMutation.mutate(d))} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Name */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium" htmlFor="acc-name">
                  Full name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input id="acc-name" {...regProfile("name")} className="h-9 pl-8" />
                </div>
                {profileErrors.name && <p className="text-xs text-destructive">{profileErrors.name.message}</p>}
              </div>

              {/* Email — read-only */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">Email address</Label>
                <div className="flex items-center gap-2 h-9 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground cursor-not-allowed">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{data?.user.email}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  Email cannot be changed. Contact support to update it.
                </p>
              </div>

              {/* Job title */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium" htmlFor="acc-title">Job title</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input id="acc-title" {...regProfile("jobTitle")} placeholder="e.g. Software Engineer" className="h-9 pl-8" />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium" htmlFor="acc-phone">Phone number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input id="acc-phone" {...regProfile("phone")} placeholder="+1 555 000 0000" className="h-9 pl-8" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-border/40">
              <span className={cn("text-xs transition-opacity", profileDirty ? "text-amber-600 dark:text-amber-400 opacity-100" : "opacity-0")}>
                Unsaved changes
              </span>
              <Button type="submit" size="sm" disabled={!profileDirty || profileSaving} className="gap-1.5 min-w-[120px]">
                {profileSaving
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                  : <><Save className="h-3.5 w-3.5" />Save changes</>
                }
              </Button>
            </div>
          </form>
        )}
      </SectionCard>

      {/* ── Appearance ───────────────────────────────────────────────────── */}
      <SectionCard title="Appearance" icon={Sun} iconColor="text-amber-500">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose how the portal looks for you. Your preference is saved locally on this device.
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const isActive = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={cn(
                    "relative flex flex-col items-center gap-2.5 rounded-xl border p-4 transition-all duration-150",
                    isActive
                      ? "border-primary bg-primary/8 shadow-sm ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 hover:bg-muted/40"
                  )}
                >
                  {/* Theme preview swatch */}
                  <div className={cn(
                    "h-10 w-full rounded-lg border overflow-hidden flex shrink-0",
                    value === "light" ? "bg-white border-slate-200" :
                    value === "dark"  ? "bg-slate-900 border-slate-700" :
                    "bg-gradient-to-r from-white to-slate-900 border-slate-300"
                  )}>
                    <div className={cn(
                      "h-full w-1/3 flex items-center justify-center",
                      value === "light" ? "bg-slate-100" :
                      value === "dark"  ? "bg-slate-800" : "bg-slate-200"
                    )}>
                      <div className="space-y-1">
                        {[8, 10, 6].map((w, i) => (
                          <div
                            key={i}
                            className={cn("rounded-full h-0.5", `w-${w}px`,
                              value === "dark" ? "bg-slate-500" : "bg-slate-300"
                            )}
                            style={{ width: w }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className={cn(
                      "flex-1 flex flex-col gap-1 p-1.5 justify-center",
                      value === "dark" ? "bg-slate-900" : "bg-white"
                    )}>
                      {[30, 50, 20].map((w, i) => (
                        <div
                          key={i}
                          className={cn("rounded-full h-0.5",
                            value === "dark" ? "bg-slate-700" : "bg-slate-200"
                          )}
                          style={{ width: `${w}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <Icon className={cn("h-4 w-4 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className={cn("text-xs font-medium",
                      isActive ? "text-primary" : "text-foreground"
                    )}>
                      {label}
                    </span>
                  </div>

                  {isActive && (
                    <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                      <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <SectionCard title="Security" icon={ShieldCheck} iconColor="text-emerald-600">
        <form onSubmit={handlePwd((d) => pwdMutation.mutate(d))} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Use a strong, unique password with at least 8 characters.
          </p>

          {/* Current password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium" htmlFor="pwd-current">Current password</Label>
            <PasswordInput id="pwd-current" placeholder="Enter current password" {...regPwd("currentPassword")} />
            {pwdErrors.currentPassword && (
              <p className="text-xs text-destructive">{pwdErrors.currentPassword.message}</p>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                New password
              </span>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium" htmlFor="pwd-new">New password</Label>
            <PasswordInput id="pwd-new" placeholder="At least 8 characters" {...regPwd("newPassword")} />
            {pwdErrors.newPassword && (
              <p className="text-xs text-destructive">{pwdErrors.newPassword.message}</p>
            )}
            {/* Strength meter */}
            {newPwdValue.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((bar) => (
                    <div
                      key={bar}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-all duration-300",
                        bar <= strength.score ? strength.color : "bg-muted"
                      )}
                    />
                  ))}
                </div>
                <p className={cn(
                  "text-[11px] font-medium transition-colors",
                  strength.score <= 1 ? "text-red-500" :
                  strength.score <= 2 ? "text-amber-500" :
                  strength.score <= 3 ? "text-yellow-500" :
                  "text-emerald-600"
                )}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium" htmlFor="pwd-confirm">Confirm new password</Label>
            <PasswordInput id="pwd-confirm" placeholder="Repeat new password" {...regPwd("confirmPassword")} />
            {pwdErrors.confirmPassword && (
              <p className="text-xs text-destructive">{pwdErrors.confirmPassword.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            {pwdSuccess ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Password changed successfully
              </span>
            ) : <span />}
            <Button type="submit" size="sm" disabled={pwdSaving} variant="outline" className="gap-1.5 min-w-[140px] border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
              {pwdSaving
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Updating…</>
                : <><KeyRound className="h-3.5 w-3.5" />Change password</>
              }
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* ── Organisation (if linked) ──────────────────────────────────────── */}
      {data?.customer?.organization && (
        <SectionCard title="Organisation" icon={Building2} iconColor="text-blue-500">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">{data.customer.organization.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your account is linked to this organisation. Contact your IT team to change this.
              </p>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
