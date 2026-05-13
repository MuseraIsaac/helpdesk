import { useEffect, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import RichTextEditor from "@/components/RichTextEditorLazy";
import { ShortcutBoard } from "@/components/ShortcutBoard";
import { User, Sliders, ShieldCheck, Keyboard, Sparkles, Mail, BadgeCheck } from "lucide-react";
import { useMe, useUpdateProfile, useUpdatePreferences, useChangePassword } from "@/hooks/useMe";
import { useTheme } from "@/lib/theme";
import {
  updateProfileSchema,
  updatePreferencesSchema,
  changePasswordSchema,
  type UpdateProfileInput,
  type UpdatePreferencesInput,
  type ChangePasswordInput,
} from "core/schemas/preferences.ts";
import {
  languages,
  supportedLanguages,
  timezones,
  dateFormats,
  timeFormats,
  themes,
  ticketListDensities,
  defaultDashboards,
} from "core/constants/preferences.ts";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

/**
 * Deterministic gradient class derived from the user's name, so the avatar
 * always lands on the same visual identity across sessions and screens.
 */
function avatarGradient(name: string): string {
  const palettes = [
    "from-violet-500 to-fuchsia-500",
    "from-sky-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-amber-500 to-orange-500",
    "from-rose-500 to-pink-500",
    "from-indigo-500 to-blue-500",
    "from-lime-500 to-emerald-500",
    "from-purple-500 to-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length] ?? palettes[0]!;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="h-[2px] w-4 rounded-full bg-gradient-to-r from-primary to-primary/0" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 font-mono">
        {children}
      </p>
    </div>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { data, isLoading } = useMe();
  const updateProfile = useUpdateProfile();
  const user = data?.user;

  // Signature is a rich text field — managed outside react-hook-form
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureLoaded, setSignatureLoaded] = useState(false);

  const handleSignatureChange = useCallback((html: string) => {
    setSignatureHtml(html);
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: "", jobTitle: null, phone: null, signature: null },
  });

  // Seed form when data loads
  useEffect(() => {
    if (user) {
      const sig = user.preference?.signature ?? "";
      reset({
        name: user.name,
        jobTitle: user.preference?.jobTitle ?? null,
        phone: user.preference?.phone ?? null,
        signature: sig,
      });
      setSignatureHtml(sig);
      setSignatureLoaded(true);
    }
  }, [user, reset]);

  if (isLoading) {
    return <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  function onSubmitProfile(d: UpdateProfileInput) {
    updateProfile.mutate({ ...d, signature: signatureHtml || null });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmitProfile)}
      className="space-y-6"
    >
      {updateProfile.error && (
        <ErrorAlert error={updateProfile.error} fallback="Failed to save profile" />
      )}
      {updateProfile.isSuccess && (
        <p className="text-sm text-green-600">Profile saved.</p>
      )}

      {/* Identity strip — gradient avatar + name / email / role chip */}
      <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <div
          className={`relative h-14 w-14 rounded-full bg-gradient-to-br ${avatarGradient(user?.name ?? "?")} text-white flex items-center justify-center text-xl font-semibold shrink-0 shadow-md ring-2 ring-background`}
        >
          {getInitials(user?.name ?? "?")}
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{user?.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Mail className="h-3 w-3 text-muted-foreground/70 shrink-0" />
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          {user?.role && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary uppercase tracking-wider">
              <BadgeCheck className="h-2.5 w-2.5" />
              {user.role}
            </span>
          )}
        </div>
      </div>

      <SectionTitle>Identity</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name <span className="text-destructive">*</span></Label>
          <Input id="name" {...register("name")} />
          {errors.name && <ErrorMessage message={errors.name.message} />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jobTitle">Job title</Label>
          <Input
            id="jobTitle"
            placeholder="e.g. Support Engineer"
            {...register("jobTitle")}
          />
          {errors.jobTitle && <ErrorMessage message={errors.jobTitle.message} />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone / contact</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 555 000 0000"
            {...register("phone")}
          />
          {errors.phone && <ErrorMessage message={errors.phone.message} />}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div>
        <SectionTitle>Reply Signature</SectionTitle>
        <p className="text-xs text-muted-foreground mb-3">
          This signature will be automatically appended when you reply to tickets.
        </p>
        {signatureLoaded && (
          <RichTextEditor
            content={signatureHtml}
            onChange={handleSignatureChange}
            placeholder="Add your signature… e.g. name, title, contact info"
            minHeight="120px"
          />
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

// ── Preferences tab ────────────────────────────────────────────────────────────

function PreferencesTab() {
  const { data, isLoading } = useMe();
  const updatePrefs = useUpdatePreferences();
  const { setTheme } = useTheme();
  const user = data?.user;
  const pref = user?.preference;

  const { control, handleSubmit, reset, formState: { isDirty } } =
    useForm<UpdatePreferencesInput>({
      resolver: zodResolver(updatePreferencesSchema),
      defaultValues: {
        language: "en",
        timezone: "UTC",
        dateFormat: "MMM d, yyyy",
        timeFormat: "12h",
        theme: "system",
        sidebarCollapsed: false,
        defaultDashboard: "overview",
        ticketListDensity: "comfortable",
      },
    });

  useEffect(() => {
    if (pref) {
      reset({
        language: pref.language,
        timezone: pref.timezone,
        dateFormat: pref.dateFormat,
        timeFormat: pref.timeFormat,
        theme: pref.theme,
        sidebarCollapsed: pref.sidebarCollapsed,
        defaultDashboard: pref.defaultDashboard,
        ticketListDensity: pref.ticketListDensity,
      });
    }
  }, [pref, reset]);

  if (isLoading) {
    return <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  function onSubmit(data: UpdatePreferencesInput) {
    updatePrefs.mutate(data, {
      onSuccess: () => {
        // Sync theme immediately
        if (data.theme) setTheme(data.theme);
        // Sync sidebar preference immediately — update localStorage AND notify Layout
        if (data.sidebarCollapsed !== undefined) {
          try {
            localStorage.setItem("sidebar-collapsed", String(data.sidebarCollapsed));
          } catch {}
          window.dispatchEvent(
            new CustomEvent("sidebar-pref-changed", { detail: { collapsed: data.sidebarCollapsed } })
          );
        }
      },
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {updatePrefs.error && (
        <ErrorAlert error={updatePrefs.error} fallback="Failed to save preferences" />
      )}
      {updatePrefs.isSuccess && (
        <p className="text-sm text-green-600">Preferences saved.</p>
      )}

      {/* Locale */}
      <div>
        <SectionTitle>Locale & Format</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Controller
              name="language"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {languages.map((l) => {
                      const supported = supportedLanguages.has(l.value);
                      return (
                        <SelectItem
                          key={l.value}
                          value={l.value}
                          disabled={!supported}
                          className={!supported ? "opacity-60" : undefined}
                        >
                          <span className="flex items-center gap-2">
                            <span>{l.label}</span>
                            {!supported && (
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                                coming soon
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              Only English is currently translated. The other languages will activate as their translations ship.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Controller
              name="timezone"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {timezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Date format</Label>
            <Controller
              name="dateFormat"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dateFormats.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Time format</Label>
            <Controller
              name="timeFormat"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {timeFormats.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* UI */}
      <div>
        <SectionTitle>Interface</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Controller
              name="theme"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sidebar default</Label>
            <Controller
              name="sidebarCollapsed"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value ? "collapsed" : "expanded"}
                  onValueChange={(v) => field.onChange(v === "collapsed")}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expanded">Expanded</SelectItem>
                    <SelectItem value="collapsed">Collapsed</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ticket list density</Label>
            <Controller
              name="ticketListDensity"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ticketListDensities.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default landing page</Label>
            <Controller
              name="defaultDashboard"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {defaultDashboards.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || updatePrefs.isPending}>
          {updatePrefs.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}

// ── Security tab ───────────────────────────────────────────────────────────────

function SecurityTab() {
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  function onSubmit(data: ChangePasswordInput) {
    changePassword.mutate(data, { onSuccess: () => reset() });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-sm">
      {changePassword.error && (
        <ErrorAlert error={changePassword.error} fallback="Failed to change password" />
      )}
      {changePassword.isSuccess && (
        <p className="text-sm text-green-600">Password changed successfully.</p>
      )}

      <SectionTitle>Change Password</SectionTitle>

      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" type="password" {...register("currentPassword")} />
        {errors.currentPassword && <ErrorMessage message={errors.currentPassword.message} />}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" type="password" {...register("newPassword")} />
        {errors.newPassword && <ErrorMessage message={errors.newPassword.message} />}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
        {errors.confirmPassword && <ErrorMessage message={errors.confirmPassword.message} />}
      </div>

      <Button type="submit" disabled={changePassword.isPending}>
        {changePassword.isPending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data } = useMe();
  const user = data?.user;
  const initials = getInitials(user?.name ?? "?");
  const gradient = avatarGradient(user?.name ?? "?");

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        {/* Subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.10] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:24px_24px]"
          aria-hidden="true"
        />
        {/* Glow accent */}
        <div
          className={`pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-3xl`}
          aria-hidden="true"
        />
        <div className="relative px-6 py-6 flex items-start gap-5">
          {user && (
            <div
              className={`relative h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center text-2xl font-semibold shadow-lg ring-2 ring-background`}
            >
              {initials}
              <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary font-mono">
                Account · Profile
              </span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight">
              {user?.name ?? "Profile & Preferences"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Manage your personal profile, regional settings, security, and interface preferences — all in one place.
            </p>
            {user && (
              <div className="mt-3 flex items-center flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </span>
                {user.role && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary uppercase tracking-wider">
                    <BadgeCheck className="h-2.5 w-2.5" />
                    {user.role}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="profile">
        <TabsList className="mb-4 h-auto p-1 bg-muted/40 rounded-xl border border-border/60">
          <TabsTrigger value="profile"     className="gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
            <User className="h-3.5 w-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
            <Sliders className="h-3.5 w-3.5" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="security"    className="gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="shortcuts"   className="gap-1.5 px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
            <Keyboard className="h-3.5 w-3.5" />
            Shortcuts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <TabCard
            icon={User}
            title="Profile"
            description="Your name, job title, and contact details."
          >
            <ProfileTab />
          </TabCard>
        </TabsContent>

        <TabsContent value="preferences">
          <TabCard
            icon={Sliders}
            title="Preferences"
            description="Language, timezone, display format, and interface defaults."
          >
            <PreferencesTab />
          </TabCard>
        </TabsContent>

        <TabsContent value="security">
          <TabCard
            icon={ShieldCheck}
            title="Security"
            description="Change your password and manage account safety."
          >
            <SecurityTab />
          </TabCard>
        </TabsContent>

        <TabsContent value="shortcuts">
          <TabCard
            icon={Keyboard}
            title="Keyboard shortcuts"
            description={
              <>
                Every shortcut available across the platform. Search to filter, or press{" "}
                <kbd className="font-mono text-[11px] rounded-sm border border-border bg-muted px-1.5 py-0.5 align-middle">?</kbd>{" "}
                anywhere in the app to summon this list as an overlay.
              </>
            }
          >
            <ShortcutBoard />
          </TabCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Tabbed card chrome — adds a status-coloured top accent line and an
 * icon-led header so each tab feels like a distinct surface rather than
 * an undifferentiated panel.
 */
function TabCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" aria-hidden="true" />
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
