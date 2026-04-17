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

import { useState } from "react";
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
} from "lucide-react";
import {
  SYSTEM_DEFAULT_CONFIG,
} from "core/schemas/dashboard.ts";
import type { StoredDashboard, DashboardsResponse } from "@/hooks/useDashboardConfig";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardSwitcherProps {
  activeDashboard: StoredDashboard | null;
  dashboardList: DashboardsResponse | null;
  onSwitch: (dashboardId: number | null) => void;
  onNew: (name: string) => void;
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
  onClone,
  onCustomize,
  isSwitching,
  isCreating,
  isCloning,
  switchError,
}: DashboardSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");

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
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowNewForm(false); }}>
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
        className="w-72 p-2"
        align="start"
        sideOffset={6}
      >
        {switchError && (
          <div className="mb-2">
            <ErrorAlert error={switchError} fallback="Failed to switch dashboard" />
          </div>
        )}

        <div className="space-y-1">
          {/* System default */}
          <DashboardItem
            name="Overview (Default)"
            subtitle="Built-in layout"
            icon={<Globe className="h-3.5 w-3.5" />}
            isActive={defaultId === null}
            onClick={() => handleSwitch(null)}
          />

          {/* Personal dashboards */}
          {dashboardList && dashboardList.personal.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Personal
              </p>
              {dashboardList.personal.map((d) => (
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
          {dashboardList && dashboardList.teamVisible.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Team
              </p>
              {dashboardList.teamVisible.map((d) => (
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
          {dashboardList && dashboardList.shared.length > 0 && (
            <>
              <Separator className="my-1" />
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Shared
              </p>
              {dashboardList.shared.map((d) => (
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
              onClick={() => setShowNewForm(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New dashboard
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
      </PopoverContent>
    </Popover>
  );
}
