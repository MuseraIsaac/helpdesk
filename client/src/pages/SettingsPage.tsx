import { useState, useMemo } from "react";
import { useParams, useNavigate, Navigate } from "react-router";
import {
  Settings,
  Palette,
  Ticket,
  Hash,
  Clock,
  BookOpen,
  FileText,
  Zap,
  Users,
  Monitor,
  Plug,
  Wrench,
  Search,
  Siren,
  PackageCheck,
  GitBranch,
  CheckSquare,
  ClipboardList,
  Database,
  Bell,
  ShieldCheck,
  ScrollText,
  CalendarDays,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  settingsSections,
  settingsSectionMeta,
  isSettingsSection,
  type SettingsSection,
} from "core/schemas/settings.ts";
import {
  GeneralSection,
  BrandingSection,
  TicketsSection,
  TicketNumberingSection,
  SlaSection,
  KnowledgeBaseSection,
  TemplatesSection,
  AutomationsSection,
  UsersRolesSection,
  AppearanceSection,
  IntegrationsSection,
  AdvancedSection,
  IncidentsSection,
  RequestsSection,
  ProblemsSection,
  ChangesSection,
  ApprovalsSection,
  CmdbSection,
  NotificationsSection,
  SecuritySection,
  AuditSection,
  BusinessHoursSection,
} from "./settings/sections";

// ── Section groups for sidebar organisation ───────────────────────────────────

const SECTION_GROUPS: { label: string; sections: SettingsSection[] }[] = [
  {
    label: "Platform",
    sections: ["general", "branding", "appearance", "users_roles", "advanced"],
  },
  {
    label: "Tickets & SLA",
    sections: ["tickets", "ticket_numbering", "sla", "business_hours", "automations", "templates"],
  },
  {
    label: "Knowledge Base",
    sections: ["knowledge_base"],
  },
  {
    label: "ITSM Modules",
    sections: ["incidents", "requests", "problems", "changes", "approvals", "cmdb"],
  },
  {
    label: "System",
    sections: ["notifications", "security", "audit", "integrations"],
  },
];

// ── Icon map ──────────────────────────────────────────────────────────────────

const sectionIcons: Record<SettingsSection, React.ReactNode> = {
  general:          <Settings className="h-4 w-4" />,
  branding:         <Palette className="h-4 w-4" />,
  tickets:          <Ticket className="h-4 w-4" />,
  ticket_numbering: <Hash className="h-4 w-4" />,
  sla:              <Clock className="h-4 w-4" />,
  knowledge_base:   <BookOpen className="h-4 w-4" />,
  templates:        <FileText className="h-4 w-4" />,
  automations:      <Zap className="h-4 w-4" />,
  users_roles:      <Users className="h-4 w-4" />,
  appearance:       <Monitor className="h-4 w-4" />,
  integrations:     <Plug className="h-4 w-4" />,
  advanced:         <Wrench className="h-4 w-4" />,
  incidents:        <Siren className="h-4 w-4" />,
  requests:         <PackageCheck className="h-4 w-4" />,
  problems:         <GitBranch className="h-4 w-4" />,
  changes:          <ClipboardList className="h-4 w-4" />,
  approvals:        <CheckSquare className="h-4 w-4" />,
  cmdb:             <Database className="h-4 w-4" />,
  notifications:    <Bell className="h-4 w-4" />,
  security:         <ShieldCheck className="h-4 w-4" />,
  audit:            <ScrollText className="h-4 w-4" />,
  business_hours:   <CalendarDays className="h-4 w-4" />,
};

// ── Section component map ─────────────────────────────────────────────────────

const sectionComponents: Record<SettingsSection, React.FC> = {
  general:          GeneralSection,
  branding:         BrandingSection,
  tickets:          TicketsSection,
  ticket_numbering: TicketNumberingSection,
  sla:              SlaSection,
  knowledge_base:   KnowledgeBaseSection,
  templates:        TemplatesSection,
  automations:      AutomationsSection,
  users_roles:      UsersRolesSection,
  appearance:       AppearanceSection,
  integrations:     IntegrationsSection,
  advanced:         AdvancedSection,
  incidents:        IncidentsSection,
  requests:         RequestsSection,
  problems:         ProblemsSection,
  changes:          ChangesSection,
  approvals:        ApprovalsSection,
  cmdb:             CmdbSection,
  notifications:    NotificationsSection,
  security:         SecuritySection,
  audit:            AuditSection,
  business_hours:   BusinessHoursSection,
};

// ── Search index ──────────────────────────────────────────────────────────────

interface SearchEntry {
  section: SettingsSection;
  tokens: string;
}

const searchIndex: SearchEntry[] = settingsSections.map((section) => {
  const meta = settingsSectionMeta[section];
  const tokens = [meta.label, meta.description, ...meta.keywords].join(" ").toLowerCase();
  return { section, tokens };
});

function matchesSearch(entry: SearchEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return entry.tokens.includes(q);
}

// ── Settings page ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { section = "general" } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  if (!isSettingsSection(section)) {
    return <Navigate to="/settings/general" replace />;
  }

  const matchedSections = useMemo(
    () => new Set(searchIndex.filter((e) => matchesSearch(e, search)).map((e) => e.section)),
    [search]
  );

  const SectionComponent = sectionComponents[section];
  const isSearching = search.trim().length > 0;

  return (
    <div className="flex gap-0 -mx-6 -my-8 min-h-[calc(100vh-56px)]">
      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r bg-muted/20 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-6 pb-3 border-b">
          <h1 className="text-base font-semibold tracking-tight">Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">System configuration</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Section list */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {matchedSections.size === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 px-2">
              No settings match "{search}"
            </p>
          )}

          {isSearching ? (
            // Flat list when searching
            [...matchedSections].map((s) => (
              <NavButton key={s} s={s} isActive={s === section} onSelect={(s) => { navigate(`/settings/${s}`); setSearch(""); }} />
            ))
          ) : (
            // Grouped list when not searching
            SECTION_GROUPS.map((group) => {
              const groupSections = group.sections.filter((s) => matchedSections.has(s));
              if (groupSections.length === 0) return null;
              return (
                <div key={group.label} className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2.5 py-1">
                    {group.label}
                  </p>
                  {groupSections.map((s) => (
                    <NavButton key={s} s={s} isActive={s === section} onSelect={(s) => navigate(`/settings/${s}`)} />
                  ))}
                </div>
              );
            })
          )}

          {isSearching && matchedSections.size > 0 && (
            <p className="text-[10px] text-muted-foreground text-center pt-2 pb-1">
              {matchedSections.size} of {settingsSections.length} sections
            </p>
          )}
        </nav>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-8 py-8 min-w-0">
        <p className="text-xs text-muted-foreground mb-6">
          Settings / {settingsSectionMeta[section].label}
        </p>
        <SectionComponent />
      </main>
    </div>
  );
}

function NavButton({
  s,
  isActive,
  onSelect,
}: {
  s: SettingsSection;
  isActive: boolean;
  onSelect: (s: SettingsSection) => void;
}) {
  const meta = settingsSectionMeta[s];
  return (
    <button
      onClick={() => onSelect(s)}
      className={[
        "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      ].join(" ")}
    >
      <span className="shrink-0">{sectionIcons[s]}</span>
      <span className="truncate font-medium">{meta.label}</span>
    </button>
  );
}
