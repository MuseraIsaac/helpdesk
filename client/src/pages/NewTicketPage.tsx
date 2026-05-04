/**
 * NewTicketPage — full-page form for creating a new support ticket.
 */

import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useForm, FormProvider, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createTicketSchema, type CreateTicketInput } from "core/schemas/tickets.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityLabel } from "core/constants/ticket-severity.ts";
import { ticketImpacts, impactLabel } from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel } from "core/constants/ticket-urgency.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/SearchableSelect";
import RichTextEditor from "@/components/RichTextEditor";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";
import { useFormConfig } from "@/hooks/useFormConfig";
import { useCustomFields } from "@/hooks/useCustomFields";
import DynamicCustomFields from "@/components/DynamicCustomFields";
import OrganizationSelect from "@/components/OrganizationSelect";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TicketPlus,
  ArrowRight,
  X,
  User,
  AlertTriangle,
  Users,
  FileText,
  Tag,
  AlertCircle,
  Wrench,
  Bug,
  GitBranch,
  Ticket,
  MonitorSmartphone,
  UserCircle,
  Headphones,
  Pencil,
  Star,
  Mail,
  Building2,
  FileStack,
  Lock,
  Globe,
  ChevronDown,
  Search as SearchIcon,
  Sparkles,
  Settings2,
  ExternalLink,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";

interface Agent { id: string; name: string }
interface Team  { id: number; name: string; color: string }
interface CustomTicketType { id: number; name: string; slug: string; color: string; isActive: boolean }
interface TicketTemplate {
  id: number;
  title: string;
  body: string;
  bodyHtml: string | null;
  isActive: boolean;
  visibility: "private" | "team" | "everyone";
  team: { id: number; name: string; color: string } | null;
  createdBy: { id: string; name: string };
  updatedAt: string;
  /** Snapshot of the source ticket's structured fields, replayed onto the
   *  new ticket form when this template is applied. */
  fields?: {
    category?:           string | null;
    ticketType?:         string | null;
    customTicketTypeId?: number | null;
    priority?:           string | null;
    severity?:           string | null;
    impact?:             string | null;
    urgency?:            string | null;
    affectedSystem?:     string | null;
    teamId?:             number | null;
    assignedToId?:       string | null;
    customFields?:       Record<string, unknown>;
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SidebarCard({
  icon: Icon,
  iconColor,
  title,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {title}
        </span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function FieldLabel({ htmlFor, required, children }: {
  htmlFor?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
  );
}

function FieldSelect<T extends string>({
  name, control, options, labelMap, placeholder, allowNone = true,
}: {
  name: keyof CreateTicketInput;
  control: ReturnType<typeof useForm<CreateTicketInput>>["control"];
  options: readonly T[];
  labelMap: Record<T, string>;
  placeholder: string;
  allowNone?: boolean;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <SearchableSelect
          value={(field.value as string | null) ?? "none"}
          onChange={(val) => field.onChange(val === "none" ? null : val)}
          options={[
            ...(allowNone ? [{ value: "none", label: "None" }] : []),
            ...options.map((o) => ({ value: o, label: labelMap[o] })),
          ]}
          placeholder={placeholder}
        />
      )}
    />
  );
}

// ── Requester picker ──────────────────────────────────────────────────────────
//
// Three modes for entering "who's this ticket from":
//   1. Customer — pick from /api/customers; auto-fills name + email + org
//   2. Agent    — pick from /api/agents (with "Me" pinned at top); auto-fills
//                 name + email
//   3. Manual   — free-text fallback (current behaviour)
//
// Mode is local UI state — the underlying form fields (senderName,
// senderEmail, organizationId) are populated regardless of which mode the
// agent uses, so server-side validation stays the same.

interface CustomerLite {
  id: number;
  name: string;
  email: string;
  isVip: boolean;
  organization: { id: number; name: string } | null;
}

const REQUESTER_AVATAR_TONES = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
];

function avatarTone(name: string): string {
  return REQUESTER_AVATAR_TONES[(name.charCodeAt(0) || 0) % REQUESTER_AVATAR_TONES.length]!;
}

type RequesterMode = "customer" | "agent" | "manual";

interface RequesterPickerProps {
  setValue:  ReturnType<typeof useForm<CreateTicketInput>>["setValue"];
  control:   ReturnType<typeof useForm<CreateTicketInput>>["control"];
  register:  ReturnType<typeof useForm<CreateTicketInput>>["register"];
  errors:    ReturnType<typeof useForm<CreateTicketInput>>["formState"]["errors"];
  cfg:       ReturnType<typeof useFormConfig>;
}

function RequesterPicker({ setValue, control, register, errors, cfg }: RequesterPickerProps) {
  const [mode, setMode] = useState<RequesterMode>("manual");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedAgentId,    setSelectedAgentId]    = useState<string>("");

  const { data: session } = useSession();
  const meId    = session?.user?.id    ?? "";
  const meName  = session?.user?.name  ?? "";
  const meEmail = session?.user?.email ?? "";

  // Customers — fetched lazily when the customer tab is active
  const { data: customers = [], isLoading: loadingCustomers } = useQuery<CustomerLite[]>({
    queryKey: ["customers", "for-new-ticket"],
    queryFn: () =>
      axios.get<{ customers: CustomerLite[] }>("/api/customers?limit=200").then(r => r.data.customers),
    staleTime: 60_000,
    enabled: mode === "customer",
  });

  // Agents
  const { data: agents = [], isLoading: loadingAgents } = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: ["agents"],
    queryFn: () =>
      axios.get<{ agents: { id: string; name: string; email: string }[] }>("/api/agents").then(r => r.data.agents),
    staleTime: 60_000,
    enabled: mode === "agent",
  });

  // Build options
  const customerOptions = customers.map((c) => ({
    value: String(c.id),
    label: c.name,
    hint: [c.email, c.organization?.name].filter(Boolean).join(" · "),
    prefix: (
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 relative ${avatarTone(c.name)}`}>
        {c.name.charAt(0).toUpperCase()}
        {c.isVip && (
          <Star className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-label="VIP" />
        )}
      </span>
    ),
  }));

  // Agent options — "Me" pinned at the top when the current user is an agent
  const agentOptions = (() => {
    const opts: Array<{ value: string; label: string; hint: string; prefix: React.ReactNode }> = [];
    if (meId && agents.some((a) => a.id === meId)) {
      opts.push({
        value: meId,
        label: `Me — ${meName}`,
        hint: meEmail,
        prefix: (
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 bg-primary text-primary-foreground shadow-sm">
            <UserCircle className="h-3.5 w-3.5" />
          </span>
        ),
      });
    }
    for (const a of agents) {
      if (a.id === meId) continue; // already pinned as "Me"
      opts.push({
        value: a.id,
        label: a.name,
        hint: a.email,
        prefix: (
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${avatarTone(a.name)}`}>
            {a.name.charAt(0).toUpperCase()}
          </span>
        ),
      });
    }
    return opts;
  })();

  function handlePickCustomer(value: string) {
    setSelectedCustomerId(value);
    const c = customers.find((x) => String(x.id) === value);
    if (!c) return;
    setValue("senderName",     c.name,         { shouldValidate: true });
    setValue("senderEmail",    c.email,        { shouldValidate: true });
    setValue("organizationId" as any, c.organization?.id ?? null, { shouldValidate: true });
  }

  function handlePickAgent(value: string) {
    setSelectedAgentId(value);
    const a = agents.find((x) => x.id === value);
    if (!a) return;
    setValue("senderName",  a.name,  { shouldValidate: true });
    setValue("senderEmail", a.email, { shouldValidate: true });
    // Agents typically don't have an org — clear it on switch
    setValue("organizationId" as any, null, { shouldValidate: true });
  }

  function handleModeChange(next: RequesterMode) {
    setMode(next);
    if (next === "manual") {
      // Don't wipe values — let the agent edit whatever was filled before
    }
  }

  // ── Mode chip ────────────────────────────────────────────────────────────
  const modes: Array<{ key: RequesterMode; label: string; icon: React.ElementType }> = [
    { key: "customer", label: "Customer", icon: UserCircle },
    { key: "agent",    label: "Agent",    icon: Headphones },
    { key: "manual",   label: "Manual",   icon: Pencil },
  ];

  return (
    <div className="space-y-3">
      {/* Mode segmented control */}
      <div className="flex gap-1 p-1 rounded-lg border bg-muted/40">
        {modes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleModeChange(key)}
            className={[
              "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all",
              mode === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Mode-specific picker */}
      {mode === "customer" && (
        <div className="space-y-1.5">
          <FieldLabel>Pick a customer</FieldLabel>
          <SearchableSelect
            options={customerOptions}
            value={selectedCustomerId}
            onChange={handlePickCustomer}
            placeholder={loadingCustomers ? "Loading customers…" : "Search by name or email…"}
            searchPlaceholder="Search by name, email, or organization…"
            disabled={loadingCustomers}
            className="w-full"
          />
          {selectedCustomerId && (() => {
            const c = customers.find((x) => String(x.id) === selectedCustomerId);
            if (!c) return null;
            return (
              <div className="rounded-md border border-primary/20 bg-primary/[0.04] px-2.5 py-2 text-[11px] space-y-1">
                <p className="flex items-center gap-1.5 text-foreground/80">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{c.email}</span>
                </p>
                {c.organization && (
                  <p className="flex items-center gap-1.5 text-foreground/80">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{c.organization.name}</span>
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {mode === "agent" && (
        <div className="space-y-1.5">
          <FieldLabel>Pick an agent</FieldLabel>
          <SearchableSelect
            options={agentOptions}
            value={selectedAgentId}
            onChange={handlePickAgent}
            placeholder={loadingAgents ? "Loading agents…" : "Search by name or email…"}
            searchPlaceholder="Search by name or email…"
            disabled={loadingAgents}
            className="w-full"
          />
        </div>
      )}

      {/* The actual form fields — always rendered, but read-only when a
          customer / agent has been picked so the agent visually confirms
          what's about to be submitted. Manual mode keeps them editable. */}
      <div className="space-y-3 pt-1 border-t border-border/40">
        {cfg.visible("senderName") && (
          <div className="space-y-1.5">
            <FieldLabel required={cfg.required("senderName")}>{cfg.label("senderName")}</FieldLabel>
            <Input
              {...register("senderName")}
              placeholder={cfg.placeholder("senderName") || "Full name"}
              className="h-8 text-xs"
              readOnly={mode !== "manual"}
            />
            {errors.senderName && <ErrorMessage message={errors.senderName.message} />}
          </div>
        )}
        {cfg.visible("senderEmail") && (
          <div className="space-y-1.5">
            <FieldLabel required={cfg.required("senderEmail")}>{cfg.label("senderEmail")}</FieldLabel>
            <Input
              type="email"
              {...register("senderEmail")}
              placeholder={cfg.placeholder("senderEmail") || "email@example.com"}
              className="h-8 text-xs"
              readOnly={mode !== "manual"}
            />
            {errors.senderEmail && <ErrorMessage message={errors.senderEmail.message} />}
          </div>
        )}
        {cfg.visible("organizationId") && (
          <div className="space-y-1.5">
            <FieldLabel required={cfg.required("organizationId")}>{cfg.label("organizationId")}</FieldLabel>
            <Controller
              name={"organizationId" as any}
              control={control}
              render={({ field }) => (
                <OrganizationSelect
                  value={field.value ?? null}
                  onChange={(id) => field.onChange(id ?? null)}
                  placeholder={cfg.placeholder("organizationId")}
                  disabled={mode === "customer" && !!selectedCustomerId}
                />
              )}
            />
            {mode === "customer" && selectedCustomerId && (
              <p className="text-[10px] text-muted-foreground italic">
                Auto-filled from the selected customer.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Ticket type definitions for the chip selector
const BUILTIN_TYPES = [
  { value: "none",           label: "General",         icon: Ticket,          color: "text-muted-foreground", ring: "ring-border", bg: "bg-muted/50",      active: "bg-primary/10 text-primary border-primary/40 ring-primary/20" },
  { value: "incident",       label: "Incident",        icon: AlertCircle,     color: "text-red-500",          ring: "ring-red-200 dark:ring-red-900", bg: "bg-red-500/5 hover:bg-red-500/10",      active: "bg-red-500/15 text-red-600 border-red-400/50 dark:text-red-400" },
  { value: "service_request",label: "Service Request", icon: Wrench,          color: "text-blue-500",         ring: "ring-blue-200 dark:ring-blue-900", bg: "bg-blue-500/5 hover:bg-blue-500/10",    active: "bg-blue-500/15 text-blue-600 border-blue-400/50 dark:text-blue-400" },
  { value: "problem",        label: "Problem",         icon: Bug,             color: "text-orange-500",       ring: "ring-orange-200 dark:ring-orange-900", bg: "bg-orange-500/5 hover:bg-orange-500/10", active: "bg-orange-500/15 text-orange-600 border-orange-400/50 dark:text-orange-400" },
  { value: "change_request", label: "Change Request",  icon: GitBranch,       color: "text-purple-500",       ring: "ring-purple-200 dark:ring-purple-900", bg: "bg-purple-500/5 hover:bg-purple-500/10", active: "bg-purple-500/15 text-purple-600 border-purple-400/50 dark:text-purple-400" },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export default function NewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cfg = useFormConfig("ticket");
  const { data: customFieldDefs = [] } = useCustomFields("ticket");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [appliedTemplateId, setAppliedTemplateId] = useState<number | null>(null);

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
  });

  const { data: customTicketTypesData } = useQuery({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get<{ ticketTypes: CustomTicketType[] }>("/api/ticket-types");
      return data.ticketTypes;
    },
  });
  const activeCustomTypes = (customTicketTypesData ?? []).filter((t) => t.isActive);

  // Templates the current user is allowed to apply (private + own team + everyone).
  const { data: templatesData } = useQuery({
    queryKey: ["templates", "ticket"],
    queryFn: async () => {
      const { data } = await axios.get<{ templates: TicketTemplate[] }>("/api/templates", { params: { type: "ticket" } });
      return data.templates;
    },
  });
  const ticketTemplates = useMemo(
    () => (templatesData ?? []).filter((t) => t.isActive),
    [templatesData],
  );

  const methods = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { body: "", customFields: {} },
  });
  const { register, handleSubmit, control, setValue, formState: { errors } } = methods;

  const handleBodyChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
    setValue("body", text, { shouldValidate: false });
  }, [setValue]);

  const selectedType = useWatch({ control, name: "ticketType" });
  const selectedCustomTypeId = useWatch({ control, name: "customTicketTypeId" });
  useWatch({ control, name: "customTicketTypeId" });

  const mutation = useMutation({
    mutationFn: async (data: CreateTicketInput) => {
      const { data: ticket } = await axios.post("/api/tickets", { ...data, body: bodyText, bodyHtml });
      return ticket;
    },
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void navigate(`/tickets/${ticket.id}`);
    },
  });

  // Resolve currently active type chip value
  const activeTypeValue = selectedCustomTypeId != null
    ? `custom_${selectedCustomTypeId}`
    : selectedType ?? "none";

  function applyTemplate(t: TicketTemplate) {
    // Title pre-fills the subject if it's empty so we don't blow away
    // anything the user has already typed.
    const currentSubject = methods.getValues("subject");
    if (!currentSubject) {
      setValue("subject", t.title, { shouldValidate: true });
    }

    // Templates can contain `{{ticket.subject}}` etc. placeholders — at
    // ticket-creation time most of those have no source value yet
    // (there's no ticket). Resolve what we can from the form, and strip
    // the rest so the user doesn't see literal `{{…}}` text in the body.
    const senderName  = methods.getValues("senderName")  || "";
    const senderEmail = methods.getValues("senderEmail") || "";
    const subjectVal  = methods.getValues("subject")     || t.title || "";
    const substitutions: Record<string, string> = {
      "customer.name":  senderName,
      "customer.email": senderEmail,
      "ticket.subject": subjectVal,
    };
    const resolveText = (input: string): string =>
      input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
        // Known substitution → use the value (may be empty string).
        if (key in substitutions) return substitutions[key]!;
        // Anything else (ticket.status, agent.name, team.name, …) is
        // unresolvable until the ticket exists. Drop it cleanly.
        void match;
        return "";
      });
    // Collapse runs of blank lines left behind by stripped placeholders so
    // the description doesn't end up with vertical gaps where the
    // unresolvable variables used to be.
    const tidy = (s: string): string =>
      s.split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();

    const text = tidy(resolveText(t.body));
    const html = t.bodyHtml
      ? tidy(resolveText(t.bodyHtml))
      : `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`;

    setBodyHtml(html);
    setBodyText(text);
    setValue("body", text, { shouldValidate: false });

    // Replay structured fields snapshot. The contract is: applying a
    // template makes the form mirror the source ticket. We apply EVERY
    // key the template captured — including explicit nulls — so that a
    // source ticket with severity unset clears severity on the new form
    // too. The `key in f` check is what gates this: keys absent from the
    // captured object (either because the template was saved before this
    // feature or because the dialog never persisted them) are skipped,
    // so partial templates still leave unmentioned fields alone.
    const f = t.fields;
    if (f) {
      const setIfCaptured = (key: keyof typeof f, formField: string) => {
        if (key in f) {
          const v = f[key];
          setValue(formField as never, (v ?? null) as never, { shouldValidate: false, shouldDirty: true });
        }
      };
      setIfCaptured("category",           "category");
      setIfCaptured("ticketType",         "ticketType");
      setIfCaptured("customTicketTypeId", "customTicketTypeId");
      setIfCaptured("priority",           "priority");
      setIfCaptured("severity",           "severity");
      setIfCaptured("impact",             "impact");
      setIfCaptured("urgency",            "urgency");
      setIfCaptured("affectedSystem",     "affectedSystem");
      setIfCaptured("teamId",             "teamId");
      setIfCaptured("assignedToId",       "assignedToId");
      if (f.customFields && Object.keys(f.customFields).length > 0) {
        setValue("customFields" as never, f.customFields as never, { shouldValidate: false, shouldDirty: true });
      }
    }

    setAppliedTemplateId(t.id);
    setTemplatePickerOpen(false);
  }

  function handleTypeChipClick(v: string) {
    if (v === "none") {
      setValue("ticketType", null as any);
      setValue("customTicketTypeId", null);
    } else if (v.startsWith("custom_")) {
      setValue("ticketType", null as any);
      setValue("customTicketTypeId", parseInt(v.replace("custom_", ""), 10));
    } else {
      setValue("ticketType", v as any);
      setValue("customTicketTypeId", null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">

      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent px-6 py-4">
          <BackLink to="/tickets">All Tickets</BackLink>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-sm">
                <TicketPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">New Ticket</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a support ticket and route it to your team
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Template picker */}
              <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={mutation.isPending}
                  >
                    <FileStack className="h-3.5 w-3.5" />
                    {appliedTemplateId
                      ? (ticketTemplates.find((t) => t.id === appliedTemplateId)?.title ?? "Template")
                      : "Use Template"}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[360px] p-0" align="end">
                  <div className="px-3 py-2.5 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <p className="text-sm font-semibold">Start from a template</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Pre-fill subject and description from a saved ticket template.
                    </p>
                    <div className="relative mt-2">
                      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                      <Input
                        autoFocus
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="Search templates…"
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1.5">
                    {(() => {
                      const q = templateSearch.toLowerCase().trim();
                      const list = ticketTemplates.filter(
                        (t) => !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q),
                      );
                      if (list.length === 0) {
                        return (
                          <div className="py-8 text-center text-xs text-muted-foreground">
                            <FileStack className="h-7 w-7 mx-auto mb-2 opacity-30" />
                            {ticketTemplates.length === 0
                              ? "No ticket templates available yet."
                              : "No templates match your search."}
                          </div>
                        );
                      }
                      return list.map((t) => {
                        const Icon = t.visibility === "private" ? Lock : t.visibility === "team" ? Users : Globe;
                        const tone =
                          t.visibility === "private"
                            ? "text-slate-600 bg-slate-100 dark:bg-slate-800"
                            : t.visibility === "team"
                            ? "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300"
                            : "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300";
                        const visLabel =
                          t.visibility === "team" && t.team ? t.team.name : t.visibility === "private" ? "Only me" : "Everyone";
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => applyTemplate(t)}
                            className="w-full text-left rounded-md px-2.5 py-2 hover:bg-muted/60 transition-colors flex items-start gap-2.5"
                          >
                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <FileText className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-semibold truncate">{t.title}</p>
                                <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-medium ${tone}`}>
                                  <Icon className="h-2 w-2" />
                                  {visLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">
                                {t.body}
                              </p>
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                by {t.createdBy.name}
                              </p>
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  {appliedTemplateId !== null && (
                    <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">Applied template will fill body</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => { setAppliedTemplateId(null); setTemplatePickerOpen(false); }}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                  {/* Manage templates — opens the full Templates library in a
                      new tab so the agent doesn't lose their in-progress
                      ticket draft. */}
                  <div className="px-2 py-1.5 border-t bg-muted/20 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground/80 pl-1">
                      {ticketTemplates.length} template{ticketTemplates.length === 1 ? "" : "s"} available
                    </p>
                    <a
                      href="/templates"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline rounded-md px-2 py-1 hover:bg-primary/5 transition-colors"
                    >
                      <Settings2 className="h-3 w-3" />
                      Manage templates
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </a>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => navigate("/tickets")}
                disabled={mutation.isPending}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="submit"
                form="new-ticket-form"
                size="sm"
                className="h-8 text-xs gap-1.5 shadow-sm"
                disabled={mutation.isPending || !bodyText.trim()}
              >
                {mutation.isPending ? "Creating…" : "Create Ticket"}
                {!mutation.isPending && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <FormProvider {...methods}>
        <form
          id="new-ticket-form"
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex-1 px-6 py-6 max-w-6xl mx-auto w-full"
        >
          {mutation.error && (
            <div className="mb-5">
              <ErrorAlert error={mutation.error} fallback="Failed to create ticket" />
            </div>
          )}

          <div className="flex gap-5 items-start">

            {/* ── Left: main content ──────────────────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Ticket Details card */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
                  <Tag className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Ticket Details
                  </span>
                </div>
                <div className="p-5 space-y-5">

                  {/* Type chip selector */}
                  {cfg.visible("ticketType") && (
                    <div className="space-y-2">
                      <FieldLabel required={cfg.required("ticketType")}>
                        {cfg.label("ticketType")}
                      </FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {BUILTIN_TYPES.map(({ value, label, icon: Icon, color, bg, active }) => {
                          const isActive = activeTypeValue === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => handleTypeChipClick(value)}
                              className={[
                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium",
                                "transition-all duration-150 cursor-pointer",
                                isActive
                                  ? `${active} shadow-sm ring-1`
                                  : `border-border ${bg} text-foreground/80 hover:text-foreground ring-0`,
                              ].join(" ")}
                            >
                              <Icon className={`h-3.5 w-3.5 ${isActive ? "" : color}`} />
                              {label}
                            </button>
                          );
                        })}
                        {/* Custom types as extra chips */}
                        {activeCustomTypes.map((t) => {
                          const v = `custom_${t.id}`;
                          const isActive = activeTypeValue === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => handleTypeChipClick(v)}
                              className={[
                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium",
                                "transition-all duration-150 cursor-pointer",
                                isActive
                                  ? "shadow-sm ring-1"
                                  : "border-border hover:bg-muted/50 text-foreground/80",
                              ].join(" ")}
                              style={isActive ? {
                                backgroundColor: `${t.color}1a`,
                                color: t.color,
                                borderColor: `${t.color}66`,
                              } : undefined}
                            >
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: t.color }}
                              />
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Subject */}
                  {cfg.visible("subject") && (
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="subject" required={cfg.required("subject")}>
                        {cfg.label("subject")}
                      </FieldLabel>
                      <Input
                        id="subject"
                        {...register("subject")}
                        placeholder={cfg.placeholder("subject") || "Brief summary of the issue…"}
                        className="h-10 text-sm font-medium"
                      />
                      {errors.subject && <ErrorMessage message={errors.subject.message} />}
                    </div>
                  )}

                  {/* Affected system (incident only) */}
                  {cfg.visible("affectedSystem") && selectedType === "incident" && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("affectedSystem")}>
                        <span className="flex items-center gap-1.5">
                          <MonitorSmartphone className="h-3 w-3 text-red-500/70" />
                          {cfg.label("affectedSystem")}
                        </span>
                      </FieldLabel>
                      <Input
                        {...register("affectedSystem")}
                        placeholder={cfg.placeholder("affectedSystem")}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Description card */}
              {cfg.visible("body") && (
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary/70" />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Description
                      </span>
                      {cfg.required("body") && (
                        <span className="text-destructive text-[10px]">required</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground/50">
                      Supports rich text formatting
                    </span>
                  </div>
                  <div className="p-1">
                    <RichTextEditor
                      content={bodyHtml}
                      onChange={handleBodyChange}
                      placeholder={cfg.placeholder("body") || "Describe the issue in detail — include steps to reproduce, error messages, or any relevant context…"}
                      minHeight="220px"
                      className="border-0 rounded-none shadow-none focus-within:ring-0"
                    />
                  </div>
                  {mutation.isError && !bodyText.trim() && (
                    <p className="text-xs text-destructive px-5 pb-3">Description is required</p>
                  )}
                </div>
              )}

              {/* Custom fields */}
              <DynamicCustomFields fields={customFieldDefs} />

              {/* Footer actions */}
              <div className="flex items-center justify-end gap-2 py-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => navigate("/tickets")}
                  disabled={mutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 text-xs gap-1.5 shadow-sm"
                  disabled={mutation.isPending || !bodyText.trim()}
                >
                  {mutation.isPending ? "Creating…" : "Create Ticket"}
                  {!mutation.isPending && <ArrowRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* ── Right sidebar ───────────────────────────────────────────── */}
            <div className="w-72 shrink-0 space-y-4">

              {/* Requester */}
              {(cfg.visible("senderName") || cfg.visible("senderEmail") || cfg.visible("organizationId")) && (
                <SidebarCard icon={User} iconColor="text-blue-500/80" title="Requester">
                  <RequesterPicker
                    setValue={setValue}
                    control={control}
                    register={register}
                    errors={errors}
                    cfg={cfg}
                  />
                </SidebarCard>
              )}

              {/* Triage */}
              {(cfg.visible("priority") || cfg.visible("severity") || cfg.visible("impact") || cfg.visible("urgency")) && (
                <SidebarCard icon={AlertTriangle} iconColor="text-orange-500/80" title="Triage">
                  {cfg.visible("priority") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("priority")}>{cfg.label("priority")}</FieldLabel>
                      <FieldSelect name="priority" control={control} options={ticketPriorities}
                        labelMap={priorityLabel} placeholder={cfg.placeholder("priority")} />
                    </div>
                  )}
                  {cfg.visible("severity") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("severity")}>{cfg.label("severity")}</FieldLabel>
                      <FieldSelect name="severity" control={control} options={ticketSeverities}
                        labelMap={severityLabel} placeholder={cfg.placeholder("severity")} />
                    </div>
                  )}
                  {cfg.visible("impact") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("impact")}>{cfg.label("impact")}</FieldLabel>
                      <FieldSelect name="impact" control={control} options={ticketImpacts}
                        labelMap={impactLabel} placeholder={cfg.placeholder("impact")} />
                    </div>
                  )}
                  {cfg.visible("urgency") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("urgency")}>{cfg.label("urgency")}</FieldLabel>
                      <FieldSelect name="urgency" control={control} options={ticketUrgencies}
                        labelMap={urgencyLabel} placeholder={cfg.placeholder("urgency")} />
                    </div>
                  )}
                </SidebarCard>
              )}

              {/* Assignment & Category */}
              {(cfg.visible("category") || cfg.visible("assignedToId") || cfg.visible("teamId")) && (
                <SidebarCard icon={Users} iconColor="text-violet-500/80" title="Assignment">
                  {cfg.visible("category") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("category")}>{cfg.label("category")}</FieldLabel>
                      <FieldSelect name="category" control={control} options={ticketCategories}
                        labelMap={categoryLabel} placeholder={cfg.placeholder("category")} />
                    </div>
                  )}
                  {cfg.visible("assignedToId") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("assignedToId")}>{cfg.label("assignedToId")}</FieldLabel>
                      <Controller
                        name="assignedToId"
                        control={control}
                        render={({ field }) => (
                          <SearchableSelect
                            value={field.value ?? "unassigned"}
                            onChange={(v) => field.onChange(v === "unassigned" ? null : v)}
                            placeholder={cfg.placeholder("assignedToId") || "Unassigned"}
                            options={[
                              { value: "unassigned", label: "Unassigned" },
                              ...(agentsData ?? []).map((a) => ({ value: a.id, label: a.name })),
                            ]}
                          />
                        )}
                      />
                    </div>
                  )}
                  {cfg.visible("teamId") && (
                    <div className="space-y-1.5">
                      <FieldLabel required={cfg.required("teamId")}>{cfg.label("teamId")}</FieldLabel>
                      <Controller
                        name="teamId"
                        control={control}
                        render={({ field }) => (
                          <SearchableSelect
                            value={field.value != null ? String(field.value) : "none"}
                            onChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                            placeholder={cfg.placeholder("teamId") || "No team"}
                            options={[
                              { value: "none", label: "No team" },
                              ...(teamsData ?? []).map((t) => ({ value: String(t.id), label: t.name })),
                            ]}
                          />
                        )}
                      />
                    </div>
                  )}
                </SidebarCard>
              )}

            </div>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
