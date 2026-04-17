/**
 * sections.tsx — All 12 settings section form components.
 *
 * Each section:
 *   1. Loads data via useSettings(section)
 *   2. Resets a React Hook Form when data arrives
 *   3. Submits via useUpdateSettings(section)
 *   4. Renders inside SettingsFormShell with SettingsField rows
 *
 * To add fields to an existing section:
 *   - Extend the Zod schema in core/schemas/settings.ts
 *   - Add the field to the useEffect reset and the JSX form
 *
 * To add a whole new section:
 *   - Add section key to settingsSections in core/schemas/settings.ts
 *   - Add its Zod schema to sectionSchemas
 *   - Create a new export here following the same pattern
 *   - Register it in SettingsPage.tsx sectionComponents map
 */
import { useEffect, useMemo, useRef } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import SettingsFormShell from "./SettingsFormShell";
import { SettingsField, SettingsSwitchRow, SettingsGroup } from "./SettingsField";
import { Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  generalSettingsSchema,
  brandingSettingsSchema,
  ticketsSettingsSchema,
  ticketNumberingSettingsSchema,
  seriesConfigSchema,
  slaSettingsSchema,
  knowledgeBaseSettingsSchema,
  templatesSettingsSchema,
  automationsSettingsSchema,
  usersRolesSettingsSchema,
  appearanceSettingsSchema,
  integrationsSettingsSchema,
  advancedSettingsSchema,
  incidentsSettingsSchema,
  requestsSettingsSchema,
  problemsSettingsSchema,
  changesSettingsSchema,
  approvalsSettingsSchema,
  cmdbSettingsSchema,
  notificationsSettingsSchema,
  securitySettingsSchema,
  auditSettingsSchema,
  businessHoursSettingsSchema,
  type GeneralSettings,
  type BrandingSettings,
  type TicketsSettings,
  type TicketNumberingSettings,
  type SeriesConfig,
  type SlaSettings,
  type KnowledgeBaseSettings,
  type TemplatesSettings,
  type AutomationsSettings,
  type UsersRolesSettings,
  type AppearanceSettings,
  type IntegrationsSettings,
  type AdvancedSettings,
  type IncidentsSettings,
  type RequestsSettings,
  type ProblemsSettings,
  type ChangesSettings,
  type ApprovalsSettings,
  type CmdbSettings,
  type NotificationsSettings,
  type SecuritySettings,
  type AuditSettings,
  type BusinessHoursSettings,
} from "core/schemas/settings.ts";
import {
  languages,
  timezones,
  dateFormats,
  timeFormats,
} from "core/constants/preferences.ts";
import { injectThemeColors } from "@/lib/theme-injector";
import { isValidHex, normalizeHex } from "@/lib/color-utils";

// ── Loading skeleton ──────────────────────────────────────────────────────────

function SectionLoading() {
  return (
    <div className="space-y-4 max-w-2xl">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-80" />
      <div className="space-y-3 mt-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-[1fr_1.5fr] gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 1. General ────────────────────────────────────────────────────────────────

export function GeneralSection() {
  const { data, isLoading } = useSettings("general");
  const update = useUpdateSettings("general");

  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<GeneralSettings>({ resolver: zodResolver(generalSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="General"
      description="Organisation name, support email, and locale defaults."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsGroup title="Identity">
        <SettingsField label="Organisation name" description="Used in email subjects and notifications sent to customers." htmlFor="helpdeskName">
          <Input id="helpdeskName" {...register("helpdeskName")} />
          {errors.helpdeskName && <p className="text-xs text-destructive mt-1">{errors.helpdeskName.message}</p>}
        </SettingsField>
        <SettingsField label="Support email" description="Reply-to address for outbound emails." htmlFor="supportEmail">
          <Input id="supportEmail" type="email" placeholder="support@example.com" {...register("supportEmail")} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Locale">
        <SettingsField label="Language" htmlFor="language">
          <Controller name="language" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {languages.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsField label="Timezone" description="Used for SLA calculations and timestamps." htmlFor="timezone">
          <Controller name="timezone" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-64">
                {timezones.map((tz) => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsField label="Date format">
          <Controller name="dateFormat" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {dateFormats.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsField label="Time format">
          <Controller name="timeFormat" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {timeFormats.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 2. Branding ───────────────────────────────────────────────────────────────

export function BrandingSection() {
  const { data, isLoading } = useSettings("branding");
  const update = useUpdateSettings("branding");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, watch, setValue, formState: { isDirty } } =
    useForm<BrandingSettings>({ resolver: zodResolver(brandingSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  const primaryColor = watch("primaryColor");
  const logoDataUrl = watch("logoDataUrl");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setValue("logoDataUrl", reader.result as string, { shouldDirty: true });
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Branding"
      description="Company identity shown in emails and the public help center."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsGroup title="Company">
        <SettingsField label="Company name" htmlFor="companyName">
          <Input id="companyName" placeholder="Acme Corp" {...register("companyName")} />
        </SettingsField>

        <SettingsField
          label="Logo"
          description="Used as the Zentra app logo and browser favicon. PNG or SVG recommended, square format."
        >
          <div className="space-y-3">
            {logoDataUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={logoDataUrl}
                  alt="Logo preview"
                  className="h-14 w-14 object-contain rounded-lg border bg-muted p-1 shrink-0"
                />
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setValue("logoDataUrl", "", { shouldDirty: true })}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload logo
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </SettingsField>

        <SettingsField label="Primary color" description="Used for buttons and accents in emails.">
          <div className="flex items-center gap-2">
            <input type="color" {...register("primaryColor")} className="h-9 w-14 rounded border bg-background cursor-pointer p-0.5" />
            <Input {...register("primaryColor")} className="font-mono" maxLength={7} />
            <span className="h-7 w-7 rounded-full border shrink-0" style={{ backgroundColor: primaryColor }} />
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Help Center">
        <SettingsField label="Page title" htmlFor="helpCenterTitle">
          <Input id="helpCenterTitle" placeholder="Help Center" {...register("helpCenterTitle")} />
        </SettingsField>
        <SettingsField label="Tagline" description="Short subtitle shown below the title." htmlFor="helpCenterTagline">
          <Input id="helpCenterTagline" placeholder="How can we help you?" {...register("helpCenterTagline")} />
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 3. Tickets ────────────────────────────────────────────────────────────────

export function TicketsSection() {
  const { data, isLoading } = useSettings("tickets");
  const update = useUpdateSettings("tickets");

  const { handleSubmit, reset, control, register, watch, formState: { isDirty, errors } } =
    useForm<TicketsSettings>({ resolver: zodResolver(ticketsSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Tickets"
      description="Default values and behavioral rules for new and existing tickets."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsGroup title="Defaults">
        <SettingsField label="Default priority" description="Applied when no priority is set on inbound tickets.">
          <Controller name="defaultPriority" control={control} render={({ field }) => (
            <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (unset)</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Behavior">
        <SettingsSwitchRow label="Auto-assignment" description="Automatically assign new tickets to available agents based on workload.">
          <Controller name="autoAssignment" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require category on create" description="Agents must pick a category before creating a ticket manually.">
          <Controller name="requireCategoryOnCreate" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Allow customers to re-open resolved tickets">
          <Controller name="allowCustomerReopenResolved" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="CSAT surveys" description="Send customer satisfaction surveys when tickets are resolved.">
          <Controller name="csatEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Auto-close">
        <SettingsField
          label="Close resolved tickets after"
          description="Automatically close tickets that have been resolved for this many days. Set to 0 to disable."
          htmlFor="autoCloseResolvedAfterDays"
        >
          <div className="flex items-center gap-2">
            <Input
              id="autoCloseResolvedAfterDays"
              type="number"
              min={0}
              max={365}
              className="w-24"
              {...register("autoCloseResolvedAfterDays", { valueAsNumber: true })}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          {errors.autoCloseResolvedAfterDays && (
            <p className="text-xs text-destructive mt-1">{errors.autoCloseResolvedAfterDays.message}</p>
          )}
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 4. Ticket Numbering ───────────────────────────────────────────────────────

type TicketSeriesKey = "incident" | "service_request" | "change_request" | "problem" | "generic";

const SERIES_META: { key: TicketSeriesKey; label: string; description: string }[] = [
  { key: "incident",        label: "Incident",        description: "INC — system outages, failures, unexpected disruptions" },
  { key: "service_request", label: "Service Request",  description: "SR — standard, pre-approved requests" },
  { key: "change_request",  label: "Change Request",   description: "CHG — changes to systems or infrastructure" },
  { key: "problem",         label: "Problem",          description: "PRB — root cause investigations" },
  { key: "generic",         label: "Generic",          description: "TKT — tickets with no specific type assigned" },
];

function buildPreview(config: Partial<SeriesConfig>, now = new Date()): string {
  const prefix    = config?.prefix        ?? "???";
  const padding   = config?.paddingLength ?? 4;
  const startAt   = config?.startAt       ?? 1;
  const dateSeg   = config?.includeDateSegment ?? "none";
  const resetP    = config?.resetPeriod   ?? "never";

  let ds = "";
  if (dateSeg === "year")       ds = String(now.getUTCFullYear());
  if (dateSeg === "year_month") {
    ds = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  // For yearly/monthly resets, show sequence=1; otherwise show startAt
  const seq = resetP !== "never" ? 1 : startAt;
  return `${prefix}${ds}${String(seq).padStart(padding, "0")}`;
}

// One row in the series table (uses its own watch for a live preview)
function SeriesRow({
  seriesKey,
  label,
  description,
  control,
  register,
}: {
  seriesKey: TicketSeriesKey;
  label: string;
  description: string;
  control: ReturnType<typeof useForm<TicketNumberingSettings>>["control"];
  register: ReturnType<typeof useForm<TicketNumberingSettings>>["register"];
}) {
  const config = useWatch({ control, name: seriesKey });
  const preview = useMemo(() => buildPreview(config), [config]);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0 rounded-md bg-muted px-3 py-1.5 font-mono text-sm font-bold tracking-wide">
          {preview}
        </div>
      </div>

      {/* Config fields — horizontal row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Prefix */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Prefix</p>
          <Input
            maxLength={10}
            className="font-mono uppercase text-sm h-8"
            {...register(`${seriesKey}.prefix`)}
          />
        </div>

        {/* Digits */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Digits</p>
          <Input
            type="number"
            min={1}
            max={10}
            className="text-sm h-8"
            {...register(`${seriesKey}.paddingLength`, { valueAsNumber: true })}
          />
        </div>

        {/* Start At */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Start At</p>
          <Input
            type="number"
            min={1}
            className="text-sm h-8"
            {...register(`${seriesKey}.startAt`, { valueAsNumber: true })}
          />
        </div>

        {/* Date segment */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Date</p>
          <Controller
            name={`${seriesKey}.includeDateSegment`}
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="year">Year (2024)</SelectItem>
                  <SelectItem value="year_month">Year+Month (202403)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Reset period */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Reset</p>
          <Controller
            name={`${seriesKey}.resetPeriod`}
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function TicketNumberingSection() {
  const { data, isLoading } = useSettings("ticket_numbering");
  const update = useUpdateSettings("ticket_numbering");

  const defaultValues = useMemo(() => ticketNumberingSettingsSchema.parse({}), []);

  const { register, handleSubmit, reset, control, formState: { isDirty } } =
    useForm<TicketNumberingSettings>({ resolver: zodResolver(ticketNumberingSettingsSchema), defaultValues });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Ticket Numbering"
      description="One numbering series per ticket type. Numbers are generated at creation and are permanent — changing settings here only affects new tickets."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <div className="space-y-3">
        {SERIES_META.map(({ key, label, description }) => (
          <SeriesRow
            key={key}
            seriesKey={key}
            label={label}
            description={description}
            control={control}
            register={register}
          />
        ))}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><span className="font-semibold text-foreground">Start At</span> — seeds the counter only when no ticket in that series exists yet. It has no effect once the first number has been issued.</p>
        <p><span className="font-semibold text-foreground">Reset</span> — resets the sequence each year or month. Combine with a date segment to produce formats like <span className="font-mono">INC20240001</span>.</p>
        <p><span className="font-semibold text-foreground">Generic</span> — used when a ticket has no type (e.g. inbound emails before AI classification).</p>
      </div>
    </SettingsFormShell>
  );
}

// ── 5. SLA ────────────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITIES = [
  { key: "Urgent", fr: "frUrgent", res: "resUrgent" },
  { key: "High",   fr: "frHigh",   res: "resHigh" },
  { key: "Medium", fr: "frMedium", res: "resMedium" },
  { key: "Low",    fr: "frLow",    res: "resLow" },
] as const;

export function SlaSection() {
  const { data, isLoading } = useSettings("sla");
  const update = useUpdateSettings("sla");

  const { register, handleSubmit, reset, control, watch, setValue, formState: { isDirty, errors } } =
    useForm<SlaSettings>({ resolver: zodResolver(slaSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  const enabled = watch("enabled");
  const businessDays = watch("businessDays") ?? [1, 2, 3, 4, 5];

  function toggleDay(day: number) {
    const current = businessDays;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    setValue("businessDays", next, { shouldDirty: true });
  }

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="SLA"
      description="Define service-level targets and business hours for breach calculations."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsSwitchRow label="Enable SLA tracking" description="Calculate first-response and resolution deadlines on tickets.">
        <Controller name="enabled" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>

      {enabled && (
        <>
          <SettingsGroup title="Business Hours">
            <SettingsSwitchRow label="Business hours only" description="SLA clock pauses outside business hours and on non-business days.">
              <Controller name="businessHoursOnly" control={control} render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )} />
            </SettingsSwitchRow>
            <SettingsField label="Hours">
              <div className="flex items-center gap-2">
                <Input type="time" className="w-32" {...register("businessHoursStart")} />
                <span className="text-muted-foreground text-sm">to</span>
                <Input type="time" className="w-32" {...register("businessHoursEnd")} />
              </div>
            </SettingsField>
            <SettingsField label="Business days">
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={[
                      "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                      businessDays.includes(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-foreground",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </SettingsField>
          </SettingsGroup>

          <SettingsGroup title="Response & Resolution Targets">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Priority</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">First response</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PRIORITIES.map(({ key, fr, res }) => (
                    <tr key={key}>
                      <td className="px-3 py-2 font-medium">{key}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            className="w-20 h-7 text-xs"
                            {...register(fr, { valueAsNumber: true })}
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            className="w-20 h-7 text-xs"
                            {...register(res, { valueAsNumber: true })}
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">All values in minutes. 60 = 1 h, 480 = 8 h, 1440 = 24 h.</p>
          </SettingsGroup>
        </>
      )}
    </SettingsFormShell>
  );
}

// ── 6. Knowledge Base ─────────────────────────────────────────────────────────

export function KnowledgeBaseSection() {
  const { data, isLoading } = useSettings("knowledge_base");
  const update = useUpdateSettings("knowledge_base");

  const { handleSubmit, reset, control, register, formState: { isDirty, errors } } =
    useForm<KnowledgeBaseSettings>({ resolver: zodResolver(knowledgeBaseSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Knowledge Base"
      description="Help center visibility and article display configuration."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsSwitchRow label="Enable knowledge base" description="Show the public help center at /help.">
        <Controller name="enabled" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsSwitchRow label="Public access" description="Anyone can read published articles without logging in.">
        <Controller name="publicAccess" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsSwitchRow label="Require account to search" description="Visitors must be logged in to use the help center search.">
        <Controller name="requireAccountToSearch" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsSwitchRow label="Show related articles" description="Display a list of related articles at the bottom of each article.">
        <Controller name="showRelatedArticles" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsSwitchRow label="Article voting" description="Let visitors vote articles as helpful or not.">
        <Controller name="enableArticleVoting" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsField label="Articles per page" htmlFor="articlesPerPage">
        <Input
          id="articlesPerPage"
          type="number"
          min={1}
          max={100}
          className="w-24"
          {...register("articlesPerPage", { valueAsNumber: true })}
        />
        {errors.articlesPerPage && <p className="text-xs text-destructive mt-1">{errors.articlesPerPage.message}</p>}
      </SettingsField>
    </SettingsFormShell>
  );
}

// ── 7. Templates ──────────────────────────────────────────────────────────────

export function TemplatesSection() {
  const { data, isLoading } = useSettings("templates");
  const update = useUpdateSettings("templates");

  const { handleSubmit, reset, control, formState: { isDirty } } =
    useForm<TemplatesSettings>({ resolver: zodResolver(templatesSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Templates"
      description="Manage response template (macro) settings."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsSwitchRow label="Enable templates" description="Allow agents to insert saved response templates into replies.">
        <Controller name="enabled" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsSwitchRow label="Allow agents to create templates" description="If disabled, only admins and supervisors can create templates.">
        <Controller name="allowAgentCreate" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Manage individual templates in{" "}
          <Link to="/templates" className="text-primary underline underline-offset-2">
            Templates →
          </Link>
        </p>
      </div>
    </SettingsFormShell>
  );
}

// ── 8. Automations ────────────────────────────────────────────────────────────

export function AutomationsSection() {
  const { data, isLoading } = useSettings("automations");
  const update = useUpdateSettings("automations");

  const { handleSubmit, reset, control, register, formState: { isDirty, errors } } =
    useForm<AutomationsSettings>({ resolver: zodResolver(automationsSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Automations"
      description="Configure the automation rule engine behaviour."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsSwitchRow label="Enable automations" description="Run automation rules on ticket events.">
        <Controller name="enabled" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsField label="Max actions per rule" description="Hard limit on actions a single rule can execute per trigger." htmlFor="maxActionsPerRule">
        <Input
          id="maxActionsPerRule"
          type="number"
          min={1}
          max={50}
          className="w-24"
          {...register("maxActionsPerRule", { valueAsNumber: true })}
        />
        {errors.maxActionsPerRule && <p className="text-xs text-destructive mt-1">{errors.maxActionsPerRule.message}</p>}
      </SettingsField>
      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Manage automation rules in{" "}
          <Link to="/automations" className="text-primary underline underline-offset-2">
            Automations →
          </Link>
        </p>
      </div>
    </SettingsFormShell>
  );
}

// ── 9. Users & Roles ──────────────────────────────────────────────────────────

export function UsersRolesSection() {
  const { data, isLoading } = useSettings("users_roles");
  const update = useUpdateSettings("users_roles");

  const { handleSubmit, reset, control, formState: { isDirty } } =
    useForm<UsersRolesSettings>({ resolver: zodResolver(usersRolesSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Users & Roles"
      description="Agent account defaults and permission policies."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsField label="Default role for new agents" description="Role assigned when an admin creates a new agent account.">
        <Controller name="defaultAgentRole" control={control} render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="readonly">Read-only</SelectItem>
            </SelectContent>
          </Select>
        )} />
      </SettingsField>
      <SettingsSwitchRow label="Allow agent self-assignment" description="Agents can assign open tickets to themselves.">
        <Controller name="allowAgentSelfAssignment" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <SettingsSwitchRow label="Require email verification" description="New accounts must verify their email before logging in.">
        <Controller name="requireEmailVerification" control={control} render={({ field }) => (
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        )} />
      </SettingsSwitchRow>
      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Manage individual users in{" "}
          <Link to="/users" className="text-primary underline underline-offset-2">
            Users →
          </Link>
        </p>
      </div>
    </SettingsFormShell>
  );
}

// ── Color picker helper ───────────────────────────────────────────────────────
// A swatch + hex text input for a single color field.

interface ColorPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function ColorPicker({ value = "", onChange, placeholder = "#000000" }: ColorPickerProps) {
  // Native <input type="color"> needs a valid 6-digit hex
  const safe = value ?? "";
  const normalized = isValidHex(safe) ? safe : (safe.length === 4 && isValidHex(normalizeHex(safe)) ? normalizeHex(safe) : placeholder);

  return (
    <div className="flex items-center gap-2">
      {/* Swatch — clicking opens the native color picker */}
      <label className="relative cursor-pointer shrink-0">
        <span
          className="block h-8 w-8 rounded border border-input shadow-sm transition-opacity"
          style={{ backgroundColor: isValidHex(safe) ? safe : "transparent" }}
        />
        <input
          type="color"
          value={normalized}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </label>
      {/* Hex text input */}
      <Input
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-28 font-mono text-xs"
        maxLength={7}
      />
      {/* Reset to default */}
      {safe && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  );
}

// ── 10. Appearance ────────────────────────────────────────────────────────────

export function AppearanceSection() {
  const { data, isLoading } = useSettings("appearance");
  const update = useUpdateSettings("appearance");

  const { handleSubmit, reset, control, watch, formState: { isDirty } } =
    useForm<AppearanceSettings>({ resolver: zodResolver(appearanceSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  // Keep a ref to the last server-loaded data so we can restore on unmount
  const serverDataRef = useRef<AppearanceSettings | undefined>(undefined);
  useEffect(() => { if (data) serverDataRef.current = data; }, [data]);

  // Live preview: watch color fields and inject as they change
  const [
    customPrimaryColor,
    customSuccessColor,
    customWarningColor,
    customDangerColor,
    customSecondaryColor,
    customAccentColor,
    customSidebarLightColor,
    customSidebarDarkColor,
  ] = watch([
    "customPrimaryColor",
    "customSuccessColor",
    "customWarningColor",
    "customDangerColor",
    "customSecondaryColor",
    "customAccentColor",
    "customSidebarLightColor",
    "customSidebarDarkColor",
  ]);

  useEffect(() => {
    injectThemeColors({
      customPrimaryColor,
      customSuccessColor,
      customWarningColor,
      customDangerColor,
      customSecondaryColor,
      customAccentColor,
      customSidebarLightColor,
      customSidebarDarkColor,
    });
  }, [ // eslint-disable-next-line react-hooks/exhaustive-deps
    customPrimaryColor, customSuccessColor, customWarningColor, customDangerColor,
    customSecondaryColor, customAccentColor, customSidebarLightColor, customSidebarDarkColor,
  ]);

  // On unmount, restore the saved (server) colors so unsaved previews are discarded
  useEffect(() => {
    return () => {
      if (serverDataRef.current) injectThemeColors(serverDataRef.current);
    };
  }, []);

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Appearance"
      description="Interface defaults for all users. Individual users can override their own theme in Profile settings."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      {/* ── Theme defaults ─────────────────────────────────────────────── */}
      <SettingsGroup title="Theme">
        <SettingsField label="Default theme" description="Applied for users who haven't set a preference.">
          <Controller name="defaultTheme" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System default</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsSwitchRow label="Allow users to override theme" description="Users can change their own theme in Profile settings.">
          <Controller name="allowUserThemeOverride" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Collapse sidebar by default" description="Sidebar starts collapsed for all users who haven't set a preference.">
          <Controller name="sidebarCollapsedDefault" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      {/* ── Brand colors ───────────────────────────────────────────────── */}
      <SettingsGroup title="Brand Colors">
        <SettingsField
          label="Primary"
          description="Main interactive color — buttons, links, active states. Dark mode variant is derived automatically."
        >
          <Controller name="customPrimaryColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#6366f1" />
          )} />
        </SettingsField>
        <SettingsField
          label="Success"
          description="Used for positive confirmations, resolved states, and success badges."
        >
          <Controller name="customSuccessColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#22c55e" />
          )} />
        </SettingsField>
        <SettingsField
          label="Warning"
          description="Used for caution states, pending SLA breaches, and warning badges."
        >
          <Controller name="customWarningColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#f59e0b" />
          )} />
        </SettingsField>
        <SettingsField
          label="Danger"
          description="Used for destructive actions, errors, and critical alerts."
        >
          <Controller name="customDangerColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#ef4444" />
          )} />
        </SettingsField>
      </SettingsGroup>

      {/* ── Surface colors ─────────────────────────────────────────────── */}
      <SettingsGroup title="Surface Colors">
        <SettingsField
          label="Secondary"
          description="Subtle background for secondary buttons and chips. Dark mode darkened automatically."
        >
          <Controller name="customSecondaryColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#f1f5f9" />
          )} />
        </SettingsField>
        <SettingsField
          label="Accent"
          description="Hover and highlight surface color used in dropdowns and nav items."
        >
          <Controller name="customAccentColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#f1f5f9" />
          )} />
        </SettingsField>
      </SettingsGroup>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <SettingsGroup title="Sidebar">
        <SettingsField
          label="Sidebar background (light)"
          description="Background color of the left sidebar in light mode."
        >
          <Controller name="customSidebarLightColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#f9fafb" />
          )} />
        </SettingsField>
        <SettingsField
          label="Sidebar background (dark)"
          description="Background color of the left sidebar in dark mode."
        >
          <Controller name="customSidebarDarkColor" control={control} render={({ field }) => (
            <ColorPicker value={field.value} onChange={field.onChange} placeholder="#1a1a2e" />
          )} />
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 11. Integrations ──────────────────────────────────────────────────────────

export function IntegrationsSection() {
  const { data, isLoading } = useSettings("integrations");
  const update = useUpdateSettings("integrations");

  const { handleSubmit, reset, control, register, watch, formState: { isDirty, errors } } =
    useForm<IntegrationsSettings>({ resolver: zodResolver(integrationsSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  const emailEnabled = watch("emailEnabled");
  const emailProvider = watch("emailProvider");
  const slackEnabled = watch("slackEnabled");

  if (isLoading) return <SectionLoading />;

  return (
    <SettingsFormShell
      title="Integrations"
      description="Connect email providers, Slack, and third-party services. API keys are stored encrypted and never echoed back."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      <SettingsGroup title="Email">
        <SettingsSwitchRow label="Enable email integration" description="Send outbound replies via an email provider.">
          <Controller name="emailEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>

        {emailEnabled && (
          <>
            <SettingsField label="Email provider">
              <Controller name="emailProvider" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sendgrid">SendGrid</SelectItem>
                    <SelectItem value="smtp">Custom SMTP</SelectItem>
                    <SelectItem value="ses">Amazon SES</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </SettingsField>

            {emailProvider === "sendgrid" && (
              <SettingsField label="SendGrid API key" description="Stored securely. Displayed as ••••••••.">
                <Input type="password" {...register("sendgridApiKey")} autoComplete="off" />
              </SettingsField>
            )}

            {emailProvider === "smtp" && (
              <>
                <SettingsField label="SMTP host" htmlFor="smtpHost">
                  <Input id="smtpHost" placeholder="smtp.example.com" {...register("smtpHost")} />
                </SettingsField>
                <SettingsField label="SMTP port" htmlFor="smtpPort">
                  <Input id="smtpPort" type="number" className="w-24" {...register("smtpPort", { valueAsNumber: true })} />
                </SettingsField>
                <SettingsField label="SMTP username" htmlFor="smtpUser">
                  <Input id="smtpUser" {...register("smtpUser")} />
                </SettingsField>
                <SettingsField label="SMTP password">
                  <Input type="password" {...register("smtpPassword")} autoComplete="off" />
                </SettingsField>
              </>
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="Slack">
        <SettingsSwitchRow label="Enable Slack notifications" description="Post ticket events to a Slack channel.">
          <Controller name="slackEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        {slackEnabled && (
          <SettingsField label="Webhook URL" description="Incoming webhook URL from your Slack app configuration.">
            <Input type="password" {...register("slackWebhookUrl")} autoComplete="off" />
          </SettingsField>
        )}
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 12. Advanced ──────────────────────────────────────────────────────────────

export function AdvancedSection() {
  const { data, isLoading } = useSettings("advanced");
  const update = useUpdateSettings("advanced");

  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<AdvancedSettings>({ resolver: zodResolver(advancedSettingsSchema) });

  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="Advanced"
      description="Debug settings, maintenance mode, and file upload configuration. Change with care."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending}
      isDirty={isDirty}
      error={update.error}
      isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Maintenance">
        <SettingsSwitchRow
          label="Maintenance mode"
          description="Show a maintenance message to all users except admins. Use for database migrations or deployments."
        >
          <Controller name="maintenanceMode" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsField label="Maintenance message" description="Shown to users when maintenance mode is active." htmlFor="maintenanceMessage">
          <Input id="maintenanceMessage" placeholder="We'll be back shortly." {...register("maintenanceMessage")} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="File Uploads">
        <SettingsField label="Max attachment size" description="Maximum file size per upload." htmlFor="maxAttachmentSizeMb">
          <div className="flex items-center gap-2">
            <Input
              id="maxAttachmentSizeMb"
              type="number"
              min={1}
              max={100}
              className="w-24"
              {...register("maxAttachmentSizeMb", { valueAsNumber: true })}
            />
            <span className="text-sm text-muted-foreground">MB</span>
          </div>
          {errors.maxAttachmentSizeMb && <p className="text-xs text-destructive mt-1">{errors.maxAttachmentSizeMb.message}</p>}
        </SettingsField>
        <SettingsField label="Allowed file types" description="Comma-separated list of file extensions." htmlFor="allowedFileExtensions">
          <Input id="allowedFileExtensions" placeholder="pdf,png,jpg,docx" {...register("allowedFileExtensions")} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Security">
        <SettingsField label="Session timeout" description="Idle sessions are invalidated after this many minutes." htmlFor="sessionTimeoutMinutes">
          <div className="flex items-center gap-2">
            <Input
              id="sessionTimeoutMinutes"
              type="number"
              min={5}
              max={43200}
              className="w-28"
              {...register("sessionTimeoutMinutes", { valueAsNumber: true })}
            />
            <span className="text-sm text-muted-foreground">minutes</span>
          </div>
          {errors.sessionTimeoutMinutes && <p className="text-xs text-destructive mt-1">{errors.sessionTimeoutMinutes.message}</p>}
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Debug">
        <SettingsSwitchRow label="Debug logging" description="Write verbose server logs. Disable in production.">
          <Controller name="debugLogging" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 13. Incidents ─────────────────────────────────────────────────────────────

export function IncidentsSection() {
  const { data, isLoading } = useSettings("incidents");
  const update = useUpdateSettings("incidents");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<IncidentsSettings>({ resolver: zodResolver(incidentsSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="Incidents"
      description="Configure severity levels, escalation behaviour, and major-incident thresholds."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Module">
        <SettingsSwitchRow label="Enable Incident Management" description="Track incidents separately from generic tickets.">
          <Controller name="enabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Major Incidents">
        <SettingsField label="Major incident threshold" description="Severity level that triggers the major-incident workflow." htmlFor="majorIncidentSeverity">
          <Controller name="majorIncidentSeverity" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sev1">Sev 1 (Critical)</SelectItem>
                <SelectItem value="sev2">Sev 2 (High)</SelectItem>
                <SelectItem value="sev3">Sev 3 (Medium)</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsSwitchRow label="Notify stakeholders on major incident" description="Send notifications to stakeholder list when a major incident is declared.">
          <Controller name="notifyStakeholdersOnMajor" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="MTTA / MTTR Targets (minutes)">
        <SettingsField label="Sev 1 MTTA" htmlFor="mttaSev1">
          <div className="flex items-center gap-2">
            <Input id="mttaSev1" type="number" min={1} className="w-24" {...register("mttaSev1", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
          {errors.mttaSev1 && <p className="text-xs text-destructive mt-1">{errors.mttaSev1.message}</p>}
        </SettingsField>
        <SettingsField label="Sev 1 MTTR" htmlFor="mttrSev1">
          <div className="flex items-center gap-2">
            <Input id="mttrSev1" type="number" min={1} className="w-24" {...register("mttrSev1", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </SettingsField>
        <SettingsField label="Sev 2 MTTA" htmlFor="mttaSev2">
          <div className="flex items-center gap-2">
            <Input id="mttaSev2" type="number" min={1} className="w-24" {...register("mttaSev2", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </SettingsField>
        <SettingsField label="Sev 2 MTTR" htmlFor="mttrSev2">
          <div className="flex items-center gap-2">
            <Input id="mttrSev2" type="number" min={1} className="w-24" {...register("mttrSev2", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </SettingsField>
        <SettingsField label="Sev 3 MTTA" htmlFor="mttaSev3">
          <div className="flex items-center gap-2">
            <Input id="mttaSev3" type="number" min={1} className="w-24" {...register("mttaSev3", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </SettingsField>
        <SettingsField label="Sev 3 MTTR" htmlFor="mttrSev3">
          <div className="flex items-center gap-2">
            <Input id="mttrSev3" type="number" min={1} className="w-24" {...register("mttrSev3", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Escalation & Linking">
        <SettingsField label="Auto-escalate before breach" description="Minutes before SLA breach to trigger auto-escalation." htmlFor="autoEscalateMinutesBefore">
          <div className="flex items-center gap-2">
            <Input id="autoEscalateMinutesBefore" type="number" min={0} className="w-24" {...register("autoEscalateMinutesBefore", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
        </SettingsField>
        <SettingsField label="Auto-link to problem threshold" description="Automatically link incidents to a problem record when this many related incidents exist." htmlFor="autoProblemLinkThreshold">
          <div className="flex items-center gap-2">
            <Input id="autoProblemLinkThreshold" type="number" min={2} className="w-24" {...register("autoProblemLinkThreshold", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">incidents</span>
          </div>
        </SettingsField>
        <SettingsField label="Require RCA above severity" description="Mandate a Root Cause Analysis for incidents at or above this severity." htmlFor="requireRcaAboveSeverity">
          <Controller name="requireRcaAboveSeverity" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sev1">Sev 1 only</SelectItem>
                <SelectItem value="sev2">Sev 2 and above</SelectItem>
                <SelectItem value="sev3">Sev 3 and above</SelectItem>
                <SelectItem value="none">Never required</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 14. Requests ──────────────────────────────────────────────────────────────

export function RequestsSection() {
  const { data, isLoading } = useSettings("requests");
  const update = useUpdateSettings("requests");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<RequestsSettings>({ resolver: zodResolver(requestsSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="Requests"
      description="Service request approval, fulfillment targets, and catalog visibility."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Module">
        <SettingsSwitchRow label="Enable Service Requests" description="Track service requests as a distinct ticket type.">
          <Controller name="enabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Allow self-service" description="Let customers submit requests without agent involvement where catalog items allow it.">
          <Controller name="allowSelfService" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Public service catalog" description="Show the service catalog to unauthenticated portal visitors.">
          <Controller name="catalogPubliclyVisible" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Approvals">
        <SettingsSwitchRow label="Require approval by default" description="New catalog items require approval unless overridden per item.">
          <Controller name="requireApprovalByDefault" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsField label="Require justification above impact" description="Mandate a justification text for requests at or above this impact level." htmlFor="requireJustificationAboveImpact">
          <Controller name="requireJustificationAboveImpact" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low and above</SelectItem>
                <SelectItem value="medium">Medium and above</SelectItem>
                <SelectItem value="high">High only</SelectItem>
                <SelectItem value="none">Never required</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Fulfillment">
        <SettingsField label="Default fulfillment SLA" description="Hours allowed to fulfill a request when no catalog item SLA is set." htmlFor="defaultFulfillmentHours">
          <div className="flex items-center gap-2">
            <Input id="defaultFulfillmentHours" type="number" min={1} className="w-24" {...register("defaultFulfillmentHours", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
          {errors.defaultFulfillmentHours && <p className="text-xs text-destructive mt-1">{errors.defaultFulfillmentHours.message}</p>}
        </SettingsField>
        <SettingsField label="Auto-close after" description="Close fulfilled requests with no activity after this many days." htmlFor="autoCloseFulfilledAfterDays">
          <div className="flex items-center gap-2">
            <Input id="autoCloseFulfilledAfterDays" type="number" min={0} className="w-24" {...register("autoCloseFulfilledAfterDays", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 15. Problems ──────────────────────────────────────────────────────────────

export function ProblemsSection() {
  const { data, isLoading } = useSettings("problems");
  const update = useUpdateSettings("problems");
  const { register, handleSubmit, reset, control, formState: { isDirty } } =
    useForm<ProblemsSettings>({ resolver: zodResolver(problemsSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="Problems"
      description="Problem management, known-error tracking, and recurrence detection."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Module">
        <SettingsSwitchRow label="Enable Problem Management" description="Track problems and link them to related incidents.">
          <Controller name="enabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Known-error KB integration" description="Automatically suggest known-error articles when opening incidents.">
          <Controller name="enableKnownErrorIntegration" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Auto-publish known errors to KB" description="Publish known-error workarounds as KB articles when a problem is marked as known error.">
          <Controller name="autoPublishKnownErrorToKb" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Templates">
        <SettingsSwitchRow label="Require RCA template" description="Force agents to complete the RCA template before resolving a problem.">
          <Controller name="requireRcaTemplate" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Post-Incident Review (PIR) template" description="Enable the PIR template for major incidents linked to this problem.">
          <Controller name="pirTemplateEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Recurrence Detection">
        <SettingsField label="Recurrence window" description="Look back this many days when detecting recurring incidents." htmlFor="recurrenceWindowDays">
          <div className="flex items-center gap-2">
            <Input id="recurrenceWindowDays" type="number" min={1} className="w-24" {...register("recurrenceWindowDays", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </SettingsField>
        <SettingsField label="Auto-create problem threshold" description="Automatically create a problem record when this many linked incidents exist." htmlFor="autoCreateProblemThreshold">
          <div className="flex items-center gap-2">
            <Input id="autoCreateProblemThreshold" type="number" min={2} className="w-24" {...register("autoCreateProblemThreshold", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">incidents</span>
          </div>
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 16. Changes ───────────────────────────────────────────────────────────────

export function ChangesSection() {
  const { data, isLoading } = useSettings("changes");
  const update = useUpdateSettings("changes");
  const { register, handleSubmit, reset, control, formState: { isDirty } } =
    useForm<ChangesSettings>({ resolver: zodResolver(changesSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);
  const freezeEnabled = useWatch({ control, name: "freezeWindowEnabled" });

  return (
    <SettingsFormShell
      title="Changes"
      description="Change types, CAB requirements, risk assessment, and freeze windows."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Module">
        <SettingsSwitchRow label="Enable Change Management" description="Track change requests through a review and approval workflow.">
          <Controller name="enabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Standard changes" description="Allow pre-approved standard changes that bypass the CAB review.">
          <Controller name="standardChangesEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Auto-approve standard changes" description="Automatically approve change requests classified as Standard.">
          <Controller name="autoApproveStandardChanges" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="CAB Approval">
        <SettingsSwitchRow label="Require CAB for normal changes" description="Normal and major changes must be reviewed by the Change Advisory Board.">
          <Controller name="requireCabForNormal" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require CAB for emergency changes" description="Emergency changes must also pass CAB review (may be expedited).">
          <Controller name="requireCabForEmergency" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require rollback plan" description="Mandate a rollback/back-out plan on all change requests.">
          <Controller name="requireRollbackPlan" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Risk Matrix">
        <SettingsField label="Require test plan above risk" description="Mandate a test plan for changes with risk scores at or above this level." htmlFor="requireTestPlanAboveRisk">
          <Controller name="requireTestPlanAboveRisk" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low and above</SelectItem>
                <SelectItem value="medium">Medium and above</SelectItem>
                <SelectItem value="high">High only</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsField label="Low risk score ≤" htmlFor="lowRiskMaxScore">
          <div className="flex items-center gap-2">
            <Input id="lowRiskMaxScore" type="number" min={1} max={10} className="w-20" {...register("lowRiskMaxScore", { valueAsNumber: true })} />
            <span className="text-xs text-muted-foreground">(1–10)</span>
          </div>
        </SettingsField>
        <SettingsField label="High risk score ≥" htmlFor="highRiskMinScore">
          <div className="flex items-center gap-2">
            <Input id="highRiskMinScore" type="number" min={1} max={10} className="w-20" {...register("highRiskMinScore", { valueAsNumber: true })} />
            <span className="text-xs text-muted-foreground">(1–10)</span>
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Freeze Window">
        <SettingsSwitchRow label="Enable freeze window" description="Normal and major changes are blocked during the freeze window. Emergency changes are still allowed.">
          <Controller name="freezeWindowEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        {freezeEnabled && (
          <>
            <SettingsField label="Freeze start" description="ISO 8601 date-time (e.g. 2025-12-20T00:00:00)." htmlFor="freezeWindowStart">
              <Input id="freezeWindowStart" placeholder="YYYY-MM-DDTHH:MM:SS" {...register("freezeWindowStart")} />
            </SettingsField>
            <SettingsField label="Freeze end" htmlFor="freezeWindowEnd">
              <Input id="freezeWindowEnd" placeholder="YYYY-MM-DDTHH:MM:SS" {...register("freezeWindowEnd")} />
            </SettingsField>
          </>
        )}
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 17. Approvals ─────────────────────────────────────────────────────────────

export function ApprovalsSection() {
  const { data, isLoading } = useSettings("approvals");
  const update = useUpdateSettings("approvals");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<ApprovalsSettings>({ resolver: zodResolver(approvalsSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="Approvals"
      description="Approval workflow reminders, timeouts, delegation, and quorum rules."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Workflow">
        <SettingsField label="Reminder interval" description="Re-send approval reminders every N hours until a decision is made." htmlFor="reminderIntervalHours">
          <div className="flex items-center gap-2">
            <Input id="reminderIntervalHours" type="number" min={1} className="w-24" {...register("reminderIntervalHours", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
          {errors.reminderIntervalHours && <p className="text-xs text-destructive mt-1">{errors.reminderIntervalHours.message}</p>}
        </SettingsField>
        <SettingsField label="Escalation timeout" description="Escalate to the next approver level after this many hours of inaction." htmlFor="escalationTimeoutHours">
          <div className="flex items-center gap-2">
            <Input id="escalationTimeoutHours" type="number" min={1} className="w-24" {...register("escalationTimeoutHours", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
        </SettingsField>
        <SettingsField label="Max approval levels" description="Maximum number of sequential approval levels in a chain." htmlFor="maxApprovalLevels">
          <div className="flex items-center gap-2">
            <Input id="maxApprovalLevels" type="number" min={1} max={10} className="w-20" {...register("maxApprovalLevels", { valueAsNumber: true })} />
            <span className="text-xs text-muted-foreground">(1–10)</span>
          </div>
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Decision Rules">
        <SettingsField label="Quorum mode" description="How many approvers must approve before the request advances." htmlFor="quorumMode">
          <Controller name="quorumMode" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All must approve</SelectItem>
                <SelectItem value="majority">Majority (50%+)</SelectItem>
                <SelectItem value="any_one">Any one approver</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
        <SettingsSwitchRow label="Require comment on rejection" description="Approvers must add a comment when rejecting a request.">
          <Controller name="requireCommentOnRejection" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Auto-approve on timeout" description="If no decision is reached after the escalation timeout, auto-approve the request.">
          <Controller name="autoApproveOnTimeout" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Allow delegation" description="Approvers can delegate to another agent.">
          <Controller name="allowDelegation" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Notify requester on decision" description="Send the requester an email when their request is approved or rejected.">
          <Controller name="notifyRequesterOnDecision" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 18. CMDB & Services ───────────────────────────────────────────────────────

export function CmdbSection() {
  const { data, isLoading } = useSettings("cmdb");
  const update = useUpdateSettings("cmdb");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<CmdbSettings>({ resolver: zodResolver(cmdbSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="CMDB & Services"
      description="Configuration item types, service catalog, and impact analysis settings."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Module">
        <SettingsSwitchRow label="Enable CMDB" description="Track configuration items and their relationships to services and tickets.">
          <Controller name="enabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Auto-discovery" description="Attempt automatic CI discovery via installed agents or integrations.">
          <Controller name="autoDiscoveryEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="CI Types">
        <SettingsSwitchRow label="Software CIs" description="Track software applications and versions.">
          <Controller name="trackSoftwareCIs" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Hardware CIs" description="Track physical hardware assets.">
          <Controller name="trackHardwareCIs" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Service CIs" description="Track logical services and business applications.">
          <Controller name="trackServiceCIs" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Network CIs" description="Track network infrastructure (routers, switches, load balancers).">
          <Controller name="trackNetworkCIs" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Linking & Analysis">
        <SettingsSwitchRow label="Auto-link tickets to CIs" description="Suggest and automatically link tickets to relevant CIs based on category and affected system.">
          <Controller name="autoLinkTicketsToCIs" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Impact analysis" description="Show upstream/downstream impact when a CI is affected by an incident.">
          <Controller name="impactAnalysisEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsField label="Dependency tree depth" description="Maximum depth to render CI dependency chains." htmlFor="dependencyTreeDepth">
          <div className="flex items-center gap-2">
            <Input id="dependencyTreeDepth" type="number" min={1} max={10} className="w-20" {...register("dependencyTreeDepth", { valueAsNumber: true })} />
            <span className="text-xs text-muted-foreground">(1–10 levels)</span>
          </div>
          {errors.dependencyTreeDepth && <p className="text-xs text-destructive mt-1">{errors.dependencyTreeDepth.message}</p>}
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 19. Notifications ─────────────────────────────────────────────────────────

export function NotificationsSection() {
  const { data, isLoading } = useSettings("notifications");
  const update = useUpdateSettings("notifications");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<NotificationsSettings>({ resolver: zodResolver(notificationsSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);
  const digestEnabled = useWatch({ control, name: "digestModeEnabled" });

  return (
    <SettingsFormShell
      title="Notifications"
      description="Control which events generate notifications and how they are delivered."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Channels">
        <SettingsSwitchRow label="Email notifications" description="Send agent and customer notifications via email.">
          <Controller name="emailNotificationsEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="In-app notifications" description="Show notification badges and pop-ups inside the agent interface.">
          <Controller name="inAppNotificationsEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Notification sounds" description="Play a sound when a new notification arrives.">
          <Controller name="notificationSoundEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Digest Mode">
        <SettingsSwitchRow label="Enable digest mode" description="Batch non-urgent notifications and deliver them periodically rather than instantly.">
          <Controller name="digestModeEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        {digestEnabled && (
          <SettingsField label="Digest interval" description="Deliver batched notifications every N hours." htmlFor="digestIntervalHours">
            <div className="flex items-center gap-2">
              <Input id="digestIntervalHours" type="number" min={1} max={24} className="w-20" {...register("digestIntervalHours", { valueAsNumber: true })} />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
            {errors.digestIntervalHours && <p className="text-xs text-destructive mt-1">{errors.digestIntervalHours.message}</p>}
          </SettingsField>
        )}
      </SettingsGroup>

      <SettingsGroup title="Agent Events">
        <SettingsSwitchRow label="Ticket assigned" description="Notify when a ticket is assigned or re-assigned to the agent.">
          <Controller name="notifyOnNewTicketAssigned" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Ticket replied" description="Notify when a customer replies to an assigned ticket.">
          <Controller name="notifyOnTicketReplied" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="SLA breach imminent" description="Notify when a ticket is approaching its SLA deadline.">
          <Controller name="notifyOnSlaBreachImminent" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Ticket escalated" description="Notify when a ticket is escalated.">
          <Controller name="notifyOnTicketEscalated" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="@mentioned" description="Notify when mentioned in a note or reply.">
          <Controller name="notifyOnMentioned" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Approval required" description="Notify when an approval request is assigned to the agent.">
          <Controller name="notifyOnApprovalRequired" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Approval decision" description="Notify requesters when their approval request is approved or rejected.">
          <Controller name="notifyOnApprovalDecision" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 20. Security ──────────────────────────────────────────────────────────────

export function SecuritySection() {
  const { data, isLoading } = useSettings("security");
  const update = useUpdateSettings("security");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<SecuritySettings>({ resolver: zodResolver(securitySettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);
  const lockoutEnabled = useWatch({ control, name: "failedLoginLockoutEnabled" });
  const ipAllowlistEnabled = useWatch({ control, name: "ipAllowlistEnabled" });

  return (
    <SettingsFormShell
      title="Security"
      description="Password policy, MFA enforcement, IP allowlisting, and login security."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Password Policy">
        <SettingsField label="Minimum length" htmlFor="passwordMinLength">
          <div className="flex items-center gap-2">
            <Input id="passwordMinLength" type="number" min={6} max={128} className="w-20" {...register("passwordMinLength", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">characters</span>
          </div>
          {errors.passwordMinLength && <p className="text-xs text-destructive mt-1">{errors.passwordMinLength.message}</p>}
        </SettingsField>
        <SettingsSwitchRow label="Require uppercase letter" description="Passwords must contain at least one uppercase character.">
          <Controller name="passwordRequireUppercase" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require number" description="Passwords must contain at least one digit.">
          <Controller name="passwordRequireNumber" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require symbol" description="Passwords must contain at least one special character.">
          <Controller name="passwordRequireSymbol" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Multi-Factor Authentication">
        <SettingsSwitchRow label="Enable MFA" description="Allow agents to enrol in multi-factor authentication.">
          <Controller name="mfaEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require MFA for admins" description="Administrators must have MFA enrolled to sign in.">
          <Controller name="mfaRequiredForAdmins" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Require MFA for all agents" description="All agents must have MFA enrolled to sign in.">
          <Controller name="mfaRequiredForAll" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Login Security">
        <SettingsSwitchRow label="Failed login lockout" description="Lock accounts after repeated failed sign-in attempts.">
          <Controller name="failedLoginLockoutEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        {lockoutEnabled && (
          <>
            <SettingsField label="Max failed attempts" htmlFor="failedLoginMaxAttempts">
              <div className="flex items-center gap-2">
                <Input id="failedLoginMaxAttempts" type="number" min={3} max={20} className="w-20" {...register("failedLoginMaxAttempts", { valueAsNumber: true })} />
                <span className="text-sm text-muted-foreground">attempts</span>
              </div>
              {errors.failedLoginMaxAttempts && <p className="text-xs text-destructive mt-1">{errors.failedLoginMaxAttempts.message}</p>}
            </SettingsField>
            <SettingsField label="Lockout duration" htmlFor="lockoutDurationMinutes">
              <div className="flex items-center gap-2">
                <Input id="lockoutDurationMinutes" type="number" min={1} max={1440} className="w-24" {...register("lockoutDurationMinutes", { valueAsNumber: true })} />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </SettingsField>
          </>
        )}
        <SettingsSwitchRow label="Enforce session timeout" description="Force re-authentication after the session timeout period (set in Advanced).">
          <Controller name="enforceSessionTimeout" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="IP Allowlist">
        <SettingsSwitchRow label="Enable IP allowlist" description="Restrict agent sign-ins to specific IP addresses or CIDR ranges.">
          <Controller name="ipAllowlistEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        {ipAllowlistEnabled && (
          <SettingsField label="Allowed IPs / CIDRs" description="Comma-separated list of IP addresses or CIDR ranges (e.g. 10.0.0.0/8, 192.168.1.1)." htmlFor="ipAllowlist">
            <Input id="ipAllowlist" placeholder="10.0.0.0/8, 203.0.113.0" {...register("ipAllowlist")} />
          </SettingsField>
        )}
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 21. Audit Log ─────────────────────────────────────────────────────────────

export function AuditSection() {
  const { data, isLoading } = useSettings("audit");
  const update = useUpdateSettings("audit");
  const { register, handleSubmit, reset, control, formState: { isDirty, errors } } =
    useForm<AuditSettings>({ resolver: zodResolver(auditSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  return (
    <SettingsFormShell
      title="Audit Log"
      description="Control what events are captured, how long they are retained, and export options."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Retention">
        <SettingsSwitchRow label="Enable audit logging" description="Capture system events in the audit log.">
          <Controller name="enabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsField label="Retention period" description="Audit log entries older than this are automatically purged." htmlFor="retentionDays">
          <div className="flex items-center gap-2">
            <Input id="retentionDays" type="number" min={30} max={3650} className="w-24" {...register("retentionDays", { valueAsNumber: true })} />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
          {errors.retentionDays && <p className="text-xs text-destructive mt-1">{errors.retentionDays.message}</p>}
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Event Categories">
        <SettingsSwitchRow label="Authentication events" description="Sign-in, sign-out, and failed login attempts.">
          <Controller name="captureAuthEvents" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Ticket events" description="Ticket creation, status changes, assignments, and closures.">
          <Controller name="captureTicketEvents" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Settings changes" description="Any modification to system settings.">
          <Controller name="captureSettingsChanges" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="User management" description="User creation, deletion, role changes.">
          <Controller name="captureUserManagement" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsSwitchRow label="Knowledge base events" description="Article publish, archive, and review actions.">
          <Controller name="captureKbEvents" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Export">
        <SettingsSwitchRow label="Allow export" description="Let admins export the audit log to file.">
          <Controller name="exportEnabled" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
        <SettingsField label="Export format" htmlFor="exportFormat">
          <Controller name="exportFormat" control={control} render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          )} />
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}

// ── 22. Business Hours ────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BusinessHoursSection() {
  const { data, isLoading } = useSettings("business_hours");
  const update = useUpdateSettings("business_hours");
  const { register, handleSubmit, reset, control, watch, setValue, formState: { isDirty } } =
    useForm<BusinessHoursSettings>({ resolver: zodResolver(businessHoursSettingsSchema) });
  useEffect(() => { if (data) reset(data); }, [data, reset]);

  const workDays = watch("workDays") ?? [1, 2, 3, 4, 5];

  const toggleDay = (day: number) => {
    const next = workDays.includes(day)
      ? workDays.filter((d) => d !== day)
      : [...workDays, day].sort((a, b) => a - b);
    setValue("workDays", next, { shouldDirty: true });
  };

  return (
    <SettingsFormShell
      title="Business Hours"
      description="Define working days, hours, public holidays, and exclusion periods for Zentra."
      onSubmit={handleSubmit((d) => update.mutate(d))}
      isPending={update.isPending} isDirty={isDirty} error={update.error} isSuccess={update.isSuccess}
    >
      {isLoading && <SectionLoading />}

      <SettingsGroup title="Calendar">
        <SettingsField label="Calendar name" description="Displayed to agents and in the portal." htmlFor="defaultCalendarName">
          <Input id="defaultCalendarName" {...register("defaultCalendarName")} placeholder="Default" />
        </SettingsField>
        <SettingsField label="Timezone" description="Overrides the general timezone for this calendar (leave blank to inherit)." htmlFor="calendarTimezone">
          <Input id="calendarTimezone" {...register("calendarTimezone")} placeholder="UTC" />
        </SettingsField>
        <SettingsSwitchRow label="Show hours in portal" description="Display business hours information on the customer help center.">
          <Controller name="showHoursInPortal" control={control} render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </SettingsSwitchRow>
      </SettingsGroup>

      <SettingsGroup title="Working Hours">
        <SettingsField label="Working days">
          <div className="flex gap-1">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={`w-9 h-9 rounded text-xs font-medium transition-colors ${
                  workDays.includes(idx)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </SettingsField>
        <SettingsField label="Start time" htmlFor="workStart">
          <Input id="workStart" type="time" className="w-32" {...register("workStart")} />
        </SettingsField>
        <SettingsField label="End time" htmlFor="workEnd">
          <Input id="workEnd" type="time" className="w-32" {...register("workEnd")} />
        </SettingsField>
      </SettingsGroup>

      <SettingsGroup title="Holidays & Exclusions">
        <SettingsField label="Public holidays" description="Comma-separated dates (YYYY-MM-DD) when Zentra is closed." htmlFor="publicHolidays">
          <Input id="publicHolidays" placeholder="2025-12-25, 2026-01-01" {...register("publicHolidays")} />
        </SettingsField>
        <SettingsField label="Exclusion periods" description="Date ranges when the helpdesk is closed, e.g. company shutdown. Format: YYYY-MM-DD:YYYY-MM-DD (comma-separated)." htmlFor="exclusionPeriods">
          <Input id="exclusionPeriods" placeholder="2025-12-26:2026-01-02" {...register("exclusionPeriods")} />
        </SettingsField>
      </SettingsGroup>
    </SettingsFormShell>
  );
}
