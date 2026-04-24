import { useState, useMemo } from "react";
import { useParams, useNavigate, Navigate } from "react-router";
import {
  Settings, Palette, Ticket, Hash, Clock, BookOpen, FileText,
  Zap, Users, Monitor, Plug, Wrench, Search, Siren, PackageCheck,
  GitBranch, CheckSquare, ClipboardList, Database, Bell, ShieldCheck,
  ScrollText, CalendarDays, FlaskConical, Trash2, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  settingsSections,
  settingsSectionMeta,
  isSettingsSection,
  type SettingsSection,
} from "core/schemas/settings.ts";
import { buildSectionTokens } from "./settings/search-index";
import {
  GeneralSection, BrandingSection, TicketsSection, TicketNumberingSection,
  SlaSection, KnowledgeBaseSection, TemplatesSection, AutomationsSection,
  UsersRolesSection, AppearanceSection, IntegrationsSection, AdvancedSection,
  IncidentsSection, RequestsSection, ProblemsSection, ChangesSection,
  ApprovalsSection, CmdbSection, NotificationsSection, SecuritySection,
  AuditSection, BusinessHoursSection, DemoDataSection, TrashSection,
} from "./settings/sections";
import { cn } from "@/lib/utils";

// ── Section groups ─────────────────────────────────────────────────────────────

const SECTION_GROUPS: { label: string; sections: SettingsSection[]; color?: string }[] = [
  { label: "Platform",       sections: ["general", "branding", "appearance", "users_roles", "advanced"] },
  { label: "Tickets & SLA",  sections: ["tickets", "ticket_numbering", "sla", "business_hours", "automations", "templates"] },
  { label: "Knowledge Base", sections: ["knowledge_base"] },
  { label: "ITSM Modules",   sections: ["incidents", "requests", "problems", "changes", "approvals", "cmdb"] },
  { label: "System",         sections: ["notifications", "security", "audit", "integrations"] },
  { label: "Data",           sections: ["trash"] },
  { label: "Developer",      sections: ["demo_data"] },
];

// ── Icon map ──────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<SettingsSection, React.ReactNode> = {
  general:          <Settings className="size-3.5" />,
  branding:         <Palette className="size-3.5" />,
  tickets:          <Ticket className="size-3.5" />,
  ticket_numbering: <Hash className="size-3.5" />,
  sla:              <Clock className="size-3.5" />,
  knowledge_base:   <BookOpen className="size-3.5" />,
  templates:        <FileText className="size-3.5" />,
  automations:      <Zap className="size-3.5" />,
  users_roles:      <Users className="size-3.5" />,
  appearance:       <Monitor className="size-3.5" />,
  integrations:     <Plug className="size-3.5" />,
  advanced:         <Wrench className="size-3.5" />,
  incidents:        <Siren className="size-3.5" />,
  requests:         <PackageCheck className="size-3.5" />,
  problems:         <GitBranch className="size-3.5" />,
  changes:          <ClipboardList className="size-3.5" />,
  approvals:        <CheckSquare className="size-3.5" />,
  cmdb:             <Database className="size-3.5" />,
  notifications:    <Bell className="size-3.5" />,
  security:         <ShieldCheck className="size-3.5" />,
  audit:            <ScrollText className="size-3.5" />,
  business_hours:   <CalendarDays className="size-3.5" />,
  trash:            <Trash2 className="size-3.5" />,
  demo_data:        <FlaskConical className="size-3.5" />,
};

const SECTION_COMPONENTS: Record<SettingsSection, React.FC> = {
  general: GeneralSection, branding: BrandingSection,
  tickets: TicketsSection, ticket_numbering: TicketNumberingSection,
  sla: SlaSection, knowledge_base: KnowledgeBaseSection,
  templates: TemplatesSection, automations: AutomationsSection,
  users_roles: UsersRolesSection, appearance: AppearanceSection,
  integrations: IntegrationsSection, advanced: AdvancedSection,
  incidents: IncidentsSection, requests: RequestsSection,
  problems: ProblemsSection, changes: ChangesSection,
  approvals: ApprovalsSection, cmdb: CmdbSection,
  notifications: NotificationsSection, security: SecuritySection,
  audit: AuditSection, business_hours: BusinessHoursSection,
  trash: TrashSection, demo_data: DemoDataSection,
};

// ── Search index ──────────────────────────────────────────────────────────────

const searchIndex = settingsSections.map((section) => ({
  section,
  tokens: buildSectionTokens(section, settingsSectionMeta[section]),
}));

function matchesSearch(entry: { section: SettingsSection; tokens: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).filter(Boolean).every((word) => entry.tokens.includes(word));
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  s, isActive, onSelect,
}: {
  s: SettingsSection;
  isActive: boolean;
  onSelect: (s: SettingsSection) => void;
}) {
  const meta = settingsSectionMeta[s];
  return (
    <button
      type="button"
      onClick={() => onSelect(s)}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-all",
        "border-l-2",
        isActive
          ? "border-primary bg-primary/8 text-primary dark:bg-primary/15"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      <span className={cn("shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground/70")}>
        {SECTION_ICONS[s]}
      </span>
      <span className="truncate">{meta.label}</span>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { section = "general" } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  if (!isSettingsSection(section)) return <Navigate to="/settings/general" replace />;

  const matchedSections = useMemo(
    () => new Set(searchIndex.filter((e) => matchesSearch(e, search)).map((e) => e.section)),
    [search],
  );

  const SectionComponent = SECTION_COMPONENTS[section];
  const isSearching = search.trim().length > 0;
  const meta = settingsSectionMeta[section];

  return (
    <div className="flex -mx-6 -my-8 min-h-[calc(100vh-56px)]">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r bg-background flex flex-col">

        {/* Sidebar header */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Settings className="size-3.5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight leading-none">Settings</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">System configuration</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="h-8 pl-8 pr-7 text-xs bg-muted/40 border-muted"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="border-t" />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {matchedSections.size === 0 && isSearching && (
            <div className="py-8 text-center px-3">
              <Search className="size-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No settings match</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">"{search}"</p>
            </div>
          )}

          {isSearching ? (
            <div className="space-y-0.5">
              {[...matchedSections].map((s) => (
                <NavItem
                  key={s} s={s} isActive={s === section}
                  onSelect={(s) => { navigate(`/settings/${s}`); setSearch(""); }}
                />
              ))}
              <p className="text-[10px] text-muted-foreground text-center pt-3 pb-1">
                {matchedSections.size} of {settingsSections.length} sections
              </p>
            </div>
          ) : (
            SECTION_GROUPS.map((group) => {
              const groupSections = group.sections.filter((s) => matchedSections.has(s));
              if (groupSections.length === 0) return null;
              return (
                <div key={group.label} className="mb-1">
                  <div className="flex items-center gap-2 px-2.5 pt-3 pb-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 leading-none">
                      {group.label}
                    </p>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  <div className="space-y-0.5">
                    {groupSections.map((s) => (
                      <NavItem
                        key={s} s={s} isActive={s === section}
                        onSelect={(s) => navigate(`/settings/${s}`)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        {/* Footer */}
        <div className="border-t px-3 py-3">
          <p className="text-[10px] text-muted-foreground/50 text-center">
            {settingsSections.length} configuration sections
          </p>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-muted/5 min-w-0">

        {/* Section header */}
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 h-14 px-8">
            <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
              <span className="text-primary">{SECTION_ICONS[section]}</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-none truncate">{meta.label}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate hidden sm:block">{meta.description}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground/50">
                <span>Settings</span>
                <span>/</span>
                <span className="text-muted-foreground">{meta.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section content */}
        <div className="px-8 py-8">
          <SectionComponent />
        </div>
      </main>
    </div>
  );
}
