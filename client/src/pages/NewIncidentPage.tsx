/**
 * NewIncidentPage — full-page incident declaration form.
 *
 * Layout: sticky header + left scroll-spy navigation + scrollable form sections.
 * Sections: Declaration · Description · Impact · Assignment
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createIncidentSchema, type CreateIncidentInput } from "core/schemas/incidents.ts";
import { incidentPriorities, incidentPriorityLabel } from "core/constants/incident-priority.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import SearchableSelect from "@/components/SearchableSelect";
import RichTextEditor from "@/components/RichTextEditor";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";
import {
  Siren,
  ArrowRight,
  X,
  Flame,
  AlertTriangle,
  MinusCircle,
  Info,
  FileText,
  Zap,
  Users,
  CheckCircle2,
  Circle,
  MonitorSmartphone,
  UserCog,
  UserCheck,
  ShieldAlert,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent { id: string; name: string; email?: string }
interface Team  { id: number; name: string; color: string }

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "declaration",
    label: "Declaration",
    icon: ShieldAlert,
    iconColor: "text-red-500",
    description: "Title and severity",
  },
  {
    id: "description",
    label: "Description",
    icon: FileText,
    iconColor: "text-blue-500",
    description: "What is happening",
  },
  {
    id: "impact",
    label: "Impact",
    icon: Zap,
    iconColor: "text-amber-500",
    description: "Affected systems & users",
  },
  {
    id: "assignment",
    label: "Assignment",
    icon: Users,
    iconColor: "text-violet-500",
    description: "Commander & team",
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// ── Priority chip config ──────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  p1: {
    label: "P1 — Critical",
    sublabel: "Immediate response",
    icon: Flame,
    base: "border-red-300/60 hover:border-red-400 hover:bg-red-500/8 text-foreground dark:border-red-800/60",
    active: "border-red-500 bg-red-500/12 text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-500/30",
    dot: "bg-red-500",
    glow: "shadow-red-500/20",
  },
  p2: {
    label: "P2 — High",
    sublabel: "Respond within 1h",
    icon: AlertTriangle,
    base: "border-orange-300/60 hover:border-orange-400 hover:bg-orange-500/8 text-foreground dark:border-orange-800/60",
    active: "border-orange-500 bg-orange-500/12 text-orange-700 dark:text-orange-400 shadow-sm ring-1 ring-orange-500/30",
    dot: "bg-orange-500",
    glow: "shadow-orange-500/20",
  },
  p3: {
    label: "P3 — Medium",
    sublabel: "Respond within 4h",
    icon: MinusCircle,
    base: "border-yellow-300/60 hover:border-yellow-400 hover:bg-yellow-500/8 text-foreground dark:border-yellow-800/60",
    active: "border-yellow-500 bg-yellow-500/12 text-yellow-700 dark:text-yellow-400 shadow-sm ring-1 ring-yellow-500/30",
    dot: "bg-yellow-500",
    glow: "shadow-yellow-500/20",
  },
  p4: {
    label: "P4 — Low",
    sublabel: "Respond within 24h",
    icon: Info,
    base: "border-blue-300/60 hover:border-blue-400 hover:bg-blue-500/8 text-foreground dark:border-blue-800/60",
    active: "border-blue-500 bg-blue-500/12 text-blue-700 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/30",
    dot: "bg-blue-500",
    glow: "shadow-blue-500/20",
  },
} as const;

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  id,
  icon: Icon,
  iconColor,
  label,
  badge,
  children,
}: {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  label: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`section-${id}`}
      className="rounded-xl border bg-card shadow-sm overflow-hidden scroll-mt-6"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg border bg-background shadow-sm`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
          <span className="text-sm font-semibold tracking-tight">{label}</span>
        </div>
        {badge && (
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NewIncidentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<SectionId>("declaration");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [descriptionText, setDescriptionText] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: agentsData } = useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
    staleTime: 60_000,
  });

  const { data: teamsData } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
    staleTime: 60_000,
  });

  const agents = agentsData ?? [];
  const teams  = teamsData  ?? [];

  // ── Form ──────────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CreateIncidentInput>({
    resolver: zodResolver(createIncidentSchema),
    defaultValues: { priority: "p3", isMajor: false },
  });

  const selectedPriority = useWatch({ control, name: "priority" });
  const isMajor          = useWatch({ control, name: "isMajor" });

  const handleDescriptionChange = useCallback((html: string, text: string) => {
    setDescriptionHtml(html);
    setDescriptionText(text);
    setValue("description", text, { shouldValidate: false });
  }, [setValue]);

  // ── Mutation ──────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: async (data: CreateIncidentInput) => {
      const payload = {
        ...data,
        description: descriptionText || undefined,
        descriptionHtml: descriptionHtml || undefined,
      };
      const { data: incident } = await axios.post("/api/incidents", payload);
      return incident;
    },
    onSuccess: (incident) => {
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      navigate(`/incidents/${incident.id}`);
    },
  });

  // ── Scroll-spy ────────────────────────────────────────────────────────────

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace("section-", "") as SectionId;
          setActiveSection(id);
        }
      },
      { root: container, rootMargin: "-10% 0px -60% 0px", threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = container.querySelector(`#section-${id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  function scrollToSection(id: SectionId) {
    const el = scrollContainerRef.current?.querySelector(`#section-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  }

  // ── Section completion hints ──────────────────────────────────────────────

  const completedSections = new Set<SectionId>();
  if (errors.title == null && /* title touched via errors check */ true) {
    // Check individually via form watch values
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const priorityCfg = PRIORITY_CONFIG[selectedPriority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.p3;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="bg-gradient-to-r from-red-500/[0.06] via-red-500/[0.02] to-transparent px-6 py-4">
          <BackLink to="/incidents">All Incidents</BackLink>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 shadow-sm">
                <Siren className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight">Declare Incident</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Log a new incident and assign it to the response team
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => navigate("/incidents")}
                disabled={mutation.isPending}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="submit"
                form="new-incident-form"
                size="sm"
                className="h-8 text-xs gap-1.5 shadow-sm bg-red-600 hover:bg-red-700 text-white border-0"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Declaring…" : "Declare Incident"}
                {!mutation.isPending && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left navigation panel ─────────────────────────────────────────── */}
        <div className="w-52 shrink-0 border-r bg-muted/10 overflow-y-auto">
          <div className="p-3 pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2 mb-3">
              Sections
            </p>
            <nav className="space-y-0.5">
              {SECTIONS.map((section, idx) => {
                const isActive = activeSection === section.id;
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={[
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all duration-100",
                      isActive
                        ? "bg-background border border-border shadow-sm text-foreground"
                        : "hover:bg-background/60 text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {/* Step indicator */}
                    <div className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border text-muted-foreground",
                    ].join(" ")}>
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium leading-none ${isActive ? "text-foreground" : ""}`}>
                        {section.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-none truncate">
                        {section.description}
                      </p>
                    </div>

                    {isActive && (
                      <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Major incident notice in nav */}
            {isMajor && (
              <div className="mt-4 mx-1 rounded-lg border border-red-500/30 bg-red-500/8 p-2.5">
                <div className="flex items-center gap-1.5">
                  <Flame className="h-3 w-3 text-red-500 shrink-0" />
                  <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                    Major Incident
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  P1 response protocol will be activated
                </p>
              </div>
            )}

            {/* Priority indicator */}
            {selectedPriority && (
              <div className="mt-3 mx-1 rounded-lg border bg-background p-2.5">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">Priority</p>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${priorityCfg.dot}`} />
                  <span className="text-[11px] font-semibold">
                    {incidentPriorityLabel[selectedPriority as keyof typeof incidentPriorityLabel]}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Scrollable form ───────────────────────────────────────────────── */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
        >
          <form
            id="new-incident-form"
            onSubmit={handleSubmit((d) => mutation.mutate(d))}
            className="px-6 py-6 max-w-3xl space-y-5"
          >
            {mutation.error && (
              <ErrorAlert error={mutation.error} fallback="Failed to declare incident" />
            )}

            {/* ── Section 1: Declaration ─────────────────────────────────── */}
            <SectionCard
              id="declaration"
              icon={ShieldAlert}
              iconColor="text-red-500"
              label="Declaration"
              badge="Required"
            >
              {/* Title */}
              <div className="space-y-1.5">
                <FieldLabel htmlFor="title" required>Incident Title</FieldLabel>
                <Input
                  id="title"
                  {...register("title")}
                  placeholder="Brief, descriptive title of what is happening…"
                  className="h-10 text-sm font-medium"
                />
                {errors.title && <ErrorMessage message={errors.title.message} />}
              </div>

              {/* Priority chips */}
              <div className="space-y-2">
                <FieldLabel required>Priority</FieldLabel>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {incidentPriorities.map((p) => {
                        const cfg = PRIORITY_CONFIG[p];
                        const PriorityIcon = cfg.icon;
                        const isSelected = field.value === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => field.onChange(p)}
                            className={[
                              "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all duration-150 cursor-pointer",
                              isSelected
                                ? `${cfg.active} shadow-md ${cfg.glow}`
                                : cfg.base,
                            ].join(" ")}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${cfg.dot}`} />
                              <PriorityIcon className={`h-3.5 w-3.5 ${isSelected ? "" : "text-muted-foreground"}`} />
                            </div>
                            <div>
                              <p className="text-xs font-bold leading-none">
                                {p.toUpperCase()}
                              </p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-none font-medium">
                                {p === "p1" ? "Critical" : p === "p2" ? "High" : p === "p3" ? "Medium" : "Low"}
                              </p>
                              <p className="text-[9px] text-muted-foreground/70 mt-1 leading-tight">
                                {cfg.sublabel}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.priority && <ErrorMessage message={errors.priority.message} />}
              </div>

              {/* Major incident toggle */}
              <div className={[
                "flex items-center justify-between rounded-xl border p-4 transition-colors",
                isMajor
                  ? "border-red-500/40 bg-red-500/8"
                  : "border-border hover:border-border/80",
              ].join(" ")}>
                <div className="flex items-center gap-3">
                  <div className={[
                    "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                    isMajor
                      ? "bg-red-500/15 border-red-500/30"
                      : "bg-muted border-border",
                  ].join(" ")}>
                    <Flame className={`h-4 w-4 ${isMajor ? "text-red-500" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isMajor ? "text-red-700 dark:text-red-400" : ""}`}>
                      Major Incident
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Activates P1 response protocol, all-hands bridge call, and executive notifications
                    </p>
                  </div>
                </div>
                <Controller
                  name="isMajor"
                  control={control}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </SectionCard>

            {/* ── Section 2: Description ────────────────────────────────── */}
            <SectionCard
              id="description"
              icon={FileText}
              iconColor="text-blue-500"
              label="Description"
            >
              <div className="space-y-1.5">
                <FieldLabel htmlFor="description">
                  Incident Description
                </FieldLabel>
                <RichTextEditor
                  content={descriptionHtml}
                  onChange={handleDescriptionChange}
                  placeholder="What is happening? When did it start? Who reported it? What is the business impact? Include any error messages or relevant context…"
                  minHeight="200px"
                  className="border-border"
                />
                <p className="text-[11px] text-muted-foreground">
                  Tip: Use headings and bullet points to structure the incident timeline.
                </p>
              </div>
            </SectionCard>

            {/* ── Section 3: Impact ─────────────────────────────────────── */}
            <SectionCard
              id="impact"
              icon={Zap}
              iconColor="text-amber-500"
              label="Impact Assessment"
            >
              {/* Affected system */}
              <div className="space-y-1.5">
                <FieldLabel htmlFor="affectedSystem">
                  <span className="flex items-center gap-1.5">
                    <MonitorSmartphone className="h-3 w-3 text-amber-500/80" />
                    Affected System / Service
                  </span>
                </FieldLabel>
                <Input
                  id="affectedSystem"
                  {...register("affectedSystem")}
                  placeholder="e.g. Payment gateway, Authentication service, Production DB…"
                  className="h-9 text-sm"
                />
              </div>

              {/* Affected user count */}
              <div className="space-y-1.5">
                <FieldLabel htmlFor="affectedUserCount">Estimated Affected Users</FieldLabel>
                <div className="relative">
                  <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="affectedUserCount"
                    type="number"
                    min={0}
                    placeholder="0"
                    {...register("affectedUserCount", { valueAsNumber: true })}
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Approximate number of users impacted. Used for SLA escalation.
                </p>
              </div>
            </SectionCard>

            {/* ── Section 4: Assignment ─────────────────────────────────── */}
            <SectionCard
              id="assignment"
              icon={Users}
              iconColor="text-violet-500"
              label="Assignment"
            >
              {/* Incident Commander */}
              <div className="space-y-1.5">
                <FieldLabel>
                  <span className="flex items-center gap-1.5">
                    <UserCog className="h-3 w-3 text-violet-500/80" />
                    Incident Commander
                  </span>
                </FieldLabel>
                <Controller
                  name="commanderId"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value ?? "none"}
                      onChange={(v) => field.onChange(v === "none" ? undefined : v)}
                      placeholder="Assign a commander…"
                      options={[
                        { value: "none", label: "Unassigned" },
                        ...agents.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                    />
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Owns the incident response, coordinates the team, and communicates status.
                </p>
              </div>

              <Separator />

              {/* Assigned agent */}
              <div className="space-y-1.5">
                <FieldLabel>
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="h-3 w-3 text-violet-500/80" />
                    Assigned Agent
                  </span>
                </FieldLabel>
                <Controller
                  name="assignedToId"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value ?? "none"}
                      onChange={(v) => field.onChange(v === "none" ? undefined : v)}
                      placeholder="Assign to an agent…"
                      options={[
                        { value: "none", label: "Unassigned" },
                        ...agents.map((a) => ({ value: a.id, label: a.name })),
                      ]}
                    />
                  )}
                />
              </div>

              {/* Team */}
              <div className="space-y-1.5">
                <FieldLabel>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-violet-500/80" />
                    Responding Team
                  </span>
                </FieldLabel>
                <Controller
                  name="teamId"
                  control={control}
                  render={({ field }) => (
                    <SearchableSelect
                      value={field.value != null ? String(field.value) : "none"}
                      onChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                      placeholder="Select a team…"
                      options={[
                        { value: "none", label: "No team" },
                        ...teams.map((t) => ({ value: String(t.id), label: t.name })),
                      ]}
                    />
                  )}
                />
              </div>
            </SectionCard>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => navigate("/incidents")}
                disabled={mutation.isPending}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 text-xs gap-1.5 shadow-sm bg-red-600 hover:bg-red-700 text-white border-0"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Declaring…" : "Declare Incident"}
                {!mutation.isPending && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
