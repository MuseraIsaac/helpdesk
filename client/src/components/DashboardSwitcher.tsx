/**
 * DashboardSwitcher
 *
 * A compact popover in the page header that lets users:
 *   – See which dashboard is currently active
 *   – Switch dashboards in one click (personal, team-visible, shared)
 *   – Create a new blank dashboard
 *   – Clone the currently-active dashboard
 *   – Open the Customize dialog
 *
 * Shown in the HomePage header to the left of the Customize button.
 */

import { useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ChevronDown,
  Check,
  Plus,
  Copy,
  Globe,
  Users,
  User,
  Loader2,
  Star,
  Sparkles,
  Search,
  X,
  LineChart,
  Activity,
  ShieldCheck,
  Heart,
  Layers,
  LayoutDashboard,
} from "lucide-react";
import {
  SYSTEM_DEFAULT_CONFIG,
  PREBUILT_DASHBOARDS,
  type PrebuiltDashboard,
} from "core/schemas/dashboard.ts";
import type { StoredDashboard, DashboardsResponse } from "@/hooks/useDashboardConfig";

// ── Icon registry for prebuilt dashboards ────────────────────────────────────
const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LineChart,
  Activity,
  ShieldCheck,
  Heart,
  Layers,
};

function templateIcon(name: string) {
  return TEMPLATE_ICONS[name] ?? LayoutDashboard;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardSwitcherProps {
  activeDashboard: StoredDashboard | null;
  dashboardList: DashboardsResponse | null;
  onSwitch: (dashboardId: number | null) => void;
  onNew: (name: string) => void;
  /** Create a new personal dashboard from a prebuilt template. */
  onTemplate: (template: PrebuiltDashboard) => void;
  onClone: () => void;
  onCustomize: () => void;
  isSwitching?: boolean;
  isCreating?: boolean;
  isCloning?: boolean;
  switchError?: Error | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function DashboardItem({
  name,
  subtitle,
  icon,
  isActive,
  onClick,
}: {
  name: string;
  subtitle?: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-muted/60 text-foreground",
      ].join(" ")}
    >
      <span className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isActive ? "text-primary" : ""}`}>
          {name}
        </p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardSwitcher({
  activeDashboard,
  dashboardList,
  onSwitch,
  onNew,
  onTemplate,
  onClone,
  onCustomize,
  isSwitching,
  isCreating,
  isCloning,
  switchError,
}: DashboardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");

  // Lowercased search matcher; matches against the dashboard name, its
  // description, and (for team-visible boards) the team name. Returning
  // true for an empty query means the search field acts as "no filter"
  // until the user types.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return () => true;
    return (d: { name: string; description?: string | null; visibilityTeam?: { name?: string } | null }) => {
      const name = d.name.toLowerCase();
      const desc = (d.description ?? "").toLowerCase();
      const team = (d.visibilityTeam?.name ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q) || team.includes(q);
    };
  }, [query]);

  const filteredPersonal    = (dashboardList?.personal    ?? []).filter(matches);
  const filteredTeamVisible = (dashboardList?.teamVisible ?? []).filter(matches);
  const filteredShared      = (dashboardList?.shared      ?? []).filter(matches);
  const defaultMatches      = matches({ name: "Overview (Default)", description: "Built-in layout" });
  const totalMatches =
    (defaultMatches ? 1 : 0) +
    filteredPersonal.length +
    filteredTeamVisible.length +
    filteredShared.length;

  function handleTemplate(t: PrebuiltDashboard) {
    onTemplate(t);
    setShowTemplates(false);
    setOpen(false);
  }

  const activeLabel = activeDashboard?.name ?? "Dashboard";
  const defaultId = dashboardList?.defaultDashboardId ?? null;

  function handleSwitch(id: number | null) {
    onSwitch(id);
    setOpen(false);
  }

  function handleNew() {
    const trimmed = newName.trim() || "My Dashboard";
    onNew(trimmed);
    setNewName("");
    setShowNewForm(false);
    setOpen(false);
  }

  function handleClone() {
    onClone();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setShowNewForm(false); setShowTemplates(false); setQuery(""); } }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 max-w-[220px] font-medium"
        >
          <Star className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-auto" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-2"
        align="start"
        sideOffset={6}
      >
        {switchError && (
          <div className="mb-2">
            <ErrorAlert error={switchError} fallback="Failed to switch dashboard" />
          </div>
        )}

        {showTemplates ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Prebuilt templates
              </p>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
            </div>
            <p className="px-1 text-[11px] text-muted-foreground leading-relaxed">
              Pick a starting layout. Each template creates a new personal dashboard you can customize.
            </p>
            <div className="space-y-1.5 pt-0.5 max-h-[360px] overflow-y-auto pr-0.5">
              {PREBUILT_DASHBOARDS.map((t) => {
                const Icon = templateIcon(t.iconName);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTemplate(t)}
                    disabled={isCreating}
                    className="w-full text-left rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/40 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ borderColor: hexToRgba(t.accentColor, 0.25) }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                        style={{
                          backgroundColor: hexToRgba(t.accentColor, 0.12),
                          borderColor: hexToRgba(t.accentColor, 0.3),
                          color: t.accentColor,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight" style={{ color: t.accentColor }}>
                          {t.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                          {t.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {isCreating && (
              <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Creating dashboard…
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Search field — filters across name, description, team name. */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dashboards…"
            className="h-8 pl-8 pr-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); }
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="space-y-1 max-h-[360px] overflow-y-auto pr-0.5">
          {totalMatches === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">No dashboards match "{query}"</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-1.5 text-[11px] text-primary hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
          <>
          {/* System default */}
          {defaultMatches && (
            <DashboardItem
              name="Overview (Default)"
              subtitle="Built-in layout"
              icon={<Globe className="h-3.5 w-3.5" />}
              isActive={defaultId === null}
              onClick={() => handleSwitch(null)}
            />
          )}

          {/* Personal dashboards */}
          {filteredPersonal.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Personal
              </p>
              {filteredPersonal.map((d) => (
                <DashboardItem
                  key={d.id}
                  name={d.name}
                  subtitle={d.description ?? undefined}
                  icon={<User className="h-3.5 w-3.5" />}
                  isActive={defaultId === d.id}
                  onClick={() => handleSwitch(d.id)}
                />
              ))}
            </>
          )}

          {/* Team dashboards */}
          {filteredTeamVisible.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Team
              </p>
              {filteredTeamVisible.map((d) => (
                <DashboardItem
                  key={d.id}
                  name={d.name}
                  subtitle={d.visibilityTeam?.name ?? d.description ?? undefined}
                  icon={
                    <span
                      className="h-3.5 w-3.5 rounded-full shrink-0 inline-block border border-border/50"
                      style={{ backgroundColor: d.visibilityTeam?.color ?? "#6366f1" }}
                    />
                  }
                  isActive={defaultId === d.id}
                  onClick={() => handleSwitch(d.id)}
                />
              ))}
            </>
          )}

          {/* Shared dashboards */}
          {filteredShared.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Shared
              </p>
              {filteredShared.map((d) => (
                <DashboardItem
                  key={d.id}
                  name={d.name}
                  subtitle={d.description ?? "Organisation-wide"}
                  icon={<Globe className="h-3.5 w-3.5" />}
                  isActive={defaultId === d.id}
                  onClick={() => handleSwitch(d.id)}
                />
              ))}
            </>
          )}
          </>
          )}
        </div>

        <Separator className="my-2" />

        {/* Create new */}
        {showNewForm ? (
          <div className="px-1 space-y-2">
            <Label className="text-xs text-muted-foreground">Dashboard name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Dashboard"
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNew();
                if (e.key === "Escape") { setShowNewForm(false); setNewName(""); }
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleNew}
                disabled={isCreating}
              >
                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setShowNewForm(false); setNewName(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-foreground hover:bg-muted/60 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
              <span className="font-medium">Start from a template</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {PREBUILT_DASHBOARDS.length} layouts
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New blank dashboard
            </button>
            {activeDashboard && (
              <button
                type="button"
                onClick={handleClone}
                disabled={isCloning}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
              >
                {isCloning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Clone current dashboard
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOpen(false); onCustomize(); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              Manage dashboards
            </button>
          </div>
        )}

        {isSwitching && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Switching…
          </div>
        )}
        </>
        )}
      </PopoverContent>
    </Popover>
  );
}
