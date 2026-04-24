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
import RichTextEditor from "@/components/RichTextEditor";
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">
      {children}
    </p>
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

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-semibold shrink-0">
          {getInitials(user?.name ?? "")}
        </div>
        <div>
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user?.role}</p>
        </div>
      </div>

      <div className="border-t" />

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

      <div className="border-t" />

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
                    {languages.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
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

      <div className="border-t" />

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
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile & Preferences</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal profile, regional settings, and interface preferences.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your name, job title, and contact details.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Language, timezone, display format, and interface defaults.</CardDescription>
            </CardHeader>
            <CardContent>
              <PreferencesTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Change your password.</CardDescription>
            </CardHeader>
            <CardContent>
              <SecurityTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
