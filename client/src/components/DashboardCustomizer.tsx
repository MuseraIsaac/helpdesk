/**
 * DashboardCustomizer
 *
 * A Dialog that lets users:
 *   – Reorder and toggle dashboard widget visibility
 *   – Set the default time period and layout density
 *   – Name, describe, and set visibility (personal / team / shared)
 *   – Save (creates a new personal dashboard or updates existing)
 *   – Manage saved dashboards (switch active, clone, delete)
 *
 * Two tabs:
 *   Customize – edit the current draft config (period, density, widgets, metadata)
 *   Dashboards – browse and manage saved configs
 */
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Star,
  RotateCcw,
  Globe,
  Copy,
  Users,
  User,
  Loader2,
} from "lucide-react";
import {
  WIDGET_IDS,
  WIDGET_META,
  SYSTEM_DEFAULT_CONFIG,
  type DashboardConfigData,
  type WidgetId,
} from "core/schemas/dashboard.ts";
import type { StoredDashboard, DashboardsResponse } from "@/hooks/useDashboardConfig";
import { useSession } from "@/lib/auth-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeConfig: DashboardConfigData;
  activeDashboard: StoredDashboard | null;
  dashboardList: DashboardsResponse | null;
  onSave: (config: DashboardConfigData, name: string, opts: SaveOpts) => void;
  onSetDefault: (dashboardId: number | null) => void;
  onDelete: (dashboardId: number) => void;
  onClone: (dashboardId: number) => void;
  isSaving?: boolean;
  isCloning?: boolean;
  saveError?: Error | null;
}

export interface SaveOpts {
  description?: string | null;
  isShared?: boolean;
  visibilityTeamId?: number | null;
}

type Period = 7 | 30 | 90;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeConfig(config: DashboardConfigData): DashboardConfigData {
  const existing = new Map(config.widgets.map(w => [w.id, w]));
  const maxOrder = config.widgets.reduce((m, w) => Math.max(m, w.order), -1);
  let nextOrder = maxOrder + 1;

  const widgets = WIDGET_IDS.map(id => {
    if (existing.has(id)) return existing.get(id)!;
    return { id, visible: true, order: nextOrder++ };
  });

  return { ...config, widgets };
}

// ── Widget list item ──────────────────────────────────────────────────────────

function WidgetRow({
  id, visible, isFirst, isLast, onToggle, onMoveUp, onMoveDown,
}: {
  id: WidgetId; visible: boolean; isFirst: boolean; isLast: boolean;
  onToggle: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const meta = WIDGET_META[id];
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex flex-col gap-0.5 shrink-0">
        <button type="button" onClick={onMoveUp} disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          aria-label={`Move ${meta.label} up`}>
          <ArrowUp className="h-3 w-3" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          aria-label={`Move ${meta.label} down`}>
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-none ${!visible ? "text-muted-foreground" : ""}`}>
          {meta.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</p>
      </div>
      <Switch checked={visible} onCheckedChange={onToggle} aria-label={`${visible ? "Hide" : "Show"} ${meta.label}`} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardCustomizer({
  open,
  onOpenChange,
  activeConfig,
  activeDashboard,
  dashboardList,
  onSave,
  onSetDefault,
  onDelete,
  onClone,
  isSaving,
  isCloning,
  saveError,
}: DashboardCustomizerProps) {
  const { data: session } = useSession();
  const isElevated = session?.user?.role === "admin" || session?.user?.role === "supervisor";

  const [tab, setTab] = useState<"customize" | "dashboards">("customize");
  const [name, setName] = useState(() => activeDashboard?.name ?? "My Dashboard");
  const [description, setDescription] = useState(() => activeDashboard?.description ?? "");
  const [isShared, setIsShared] = useState(() => activeDashboard?.isShared ?? false);
  const [visibilityTeamId, setVisibilityTeamId] = useState<number | null>(
    () => activeDashboard?.visibilityTeamId ?? null
  );

  const [draft, setDraft] = useState<DashboardConfigData>(() =>
    normalizeConfig(activeConfig),
  );

  const sortedWidgets = [...draft.widgets].sort((a, b) => a.order - b.order);

  // Collect all teams from team-visible dashboards for the team picker
  const availableTeams = dashboardList
    ? [
        ...dashboardList.personal
          .filter(d => d.visibilityTeam)
          .map(d => d.visibilityTeam!),
        ...dashboardList.teamVisible
          .filter(d => d.visibilityTeam)
          .map(d => d.visibilityTeam!),
      ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)
    : [];

  // ── Widget mutation helpers ────────────────────────────────────────────────

  const updateWidgets = useCallback(
    (fn: (widgets: typeof sortedWidgets) => typeof sortedWidgets) => {
      setDraft(d => {
        const sorted = [...d.widgets].sort((a, b) => a.order - b.order);
        const updated = fn(sorted);
        return { ...d, widgets: updated.map((w, i) => ({ ...w, order: i })) };
      });
    },
    [],
  );

  function toggleWidget(id: WidgetId) {
    updateWidgets(ws => ws.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }

  function moveWidget(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sortedWidgets.length) return;
    updateWidgets(ws => {
      const next = [...ws];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function resetToDefault() {
    setDraft(normalizeConfig(SYSTEM_DEFAULT_CONFIG));
    setName("My Dashboard");
    setDescription("");
    setIsShared(false);
    setVisibilityTeamId(null);
  }

  function handleSave() {
    onSave(draft, name.trim() || "My Dashboard", {
      description: description.trim() || null,
      isShared,
      visibilityTeamId,
    });
  }

  const isOnSystemDefault = activeDashboard === null;
  const defaultId = dashboardList?.defaultDashboardId ?? null;

  // Visibility label for the Dashboards tab
  function visibilityBadge(d: StoredDashboard) {
    if (d.isShared)              return <Badge variant="secondary" className="text-[10px] h-4 gap-0.5"><Globe className="h-2.5 w-2.5" />Shared</Badge>;
    if (d.visibilityTeamId)      return <Badge variant="outline" className="text-[10px] h-4 gap-0.5"><Users className="h-2.5 w-2.5" />{d.visibilityTeam?.name ?? "Team"}</Badge>;
    return <Badge variant="outline" className="text-[10px] h-4 gap-0.5"><User className="h-2.5 w-2.5" />Personal</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mb-2 shrink-0 w-auto self-start">
            <TabsTrigger value="customize">Customize</TabsTrigger>
            <TabsTrigger value="dashboards">My Dashboards</TabsTrigger>
          </TabsList>

          {/* ── Customize tab ─────────────────────────────────────────────── */}
          <TabsContent value="customize" className="flex-1 overflow-y-auto px-6 space-y-5 mt-0">

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-name" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Dashboard Name
              </Label>
              <Input
                id="dashboard-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Dashboard"
                maxLength={100}
              />
              {isOnSystemDefault && (
                <p className="text-xs text-muted-foreground">Saving will create a new personal dashboard.</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-desc" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Description <span className="font-normal text-muted-foreground/60">(optional)</span>
              </Label>
              <Textarea
                id="dashboard-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this dashboard for?"
                className="text-sm min-h-[60px] resize-none"
                maxLength={500}
              />
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Visibility
              </Label>
              <div className="space-y-2">
                {/* Team scope */}
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Share with a team</p>
                  <Select
                    value={visibilityTeamId ? String(visibilityTeamId) : "none"}
                    onValueChange={v => setVisibilityTeamId(v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">Only me</SelectItem>
                      {availableTeams.map(t => (
                        <SelectItem key={t.id} value={String(t.id)} className="text-xs">
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Org-wide sharing (elevated only) */}
                {isElevated && (
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Share with everyone</p>
                      <p className="text-xs text-muted-foreground">All users in the organisation can see this dashboard.</p>
                    </div>
                    <Switch
                      checked={isShared}
                      onCheckedChange={v => { setIsShared(v); if (v) setVisibilityTeamId(null); }}
                    />
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Time range */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Default Time Range
              </p>
              <div className="flex gap-2">
                {([7, 30, 90] as Period[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, period: p }))}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      draft.period === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {p}d
                  </button>
                ))}
              </div>
            </div>

            {/* Density */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Layout Density
              </p>
              <div className="flex gap-2">
                {(["comfortable", "compact"] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDraft(prev => ({ ...prev, density: d }))}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                      draft.density === d
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Compact reduces spacing between sections and shrinks metric values.
              </p>
            </div>

            <Separator />

            {/* Widget list */}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Widgets
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Toggle visibility and reorder using the arrows.
              </p>
              <div className="divide-y">
                {sortedWidgets.map((w, idx) => (
                  <WidgetRow
                    key={w.id}
                    id={w.id}
                    visible={w.visible}
                    isFirst={idx === 0}
                    isLast={idx === sortedWidgets.length - 1}
                    onToggle={() => toggleWidget(w.id)}
                    onMoveUp={() => moveWidget(idx, -1)}
                    onMoveDown={() => moveWidget(idx, 1)}
                  />
                ))}
              </div>
            </div>

            <div className="pb-4">
              <button type="button" onClick={resetToDefault}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="h-3 w-3" />
                Reset to system defaults
              </button>
            </div>
          </TabsContent>

          {/* ── Dashboards tab ─────────────────────────────────────────────── */}
          <TabsContent value="dashboards" className="flex-1 overflow-y-auto px-6 mt-0 space-y-4">

            {/* System default */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">System Default</p>
              <DashboardRow
                name="Overview (Default)"
                isActive={isOnSystemDefault}
                isDefault={isOnSystemDefault}
                subtitle="Built-in layout — always available, cannot be deleted"
                icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                onSetDefault={() => onSetDefault(null)}
              />
            </div>

            {/* Personal dashboards */}
            {dashboardList && dashboardList.personal.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">My Dashboards</p>
                <div className="space-y-1">
                  {dashboardList.personal.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={defaultId === d.id}
                      isDefault={defaultId === d.id}
                      subtitle={d.description ?? `Updated ${new Date(d.updatedAt).toLocaleDateString()}`}
                      badge={visibilityBadge(d)}
                      onSetDefault={() => onSetDefault(d.id)}
                      onDelete={() => onDelete(d.id)}
                      onClone={() => onClone(d.id)}
                      isCloning={isCloning}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Team dashboards */}
            {dashboardList && dashboardList.teamVisible.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Team Dashboards</p>
                <div className="space-y-1">
                  {dashboardList.teamVisible.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={defaultId === d.id}
                      isDefault={defaultId === d.id}
                      subtitle={d.description ?? d.visibilityTeam?.name}
                      badge={visibilityBadge(d)}
                      icon={
                        d.visibilityTeam ? (
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0 inline-block border border-border/50"
                            style={{ backgroundColor: d.visibilityTeam.color }}
                          />
                        ) : <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                      onSetDefault={() => onSetDefault(d.id)}
                      onClone={() => onClone(d.id)}
                      isCloning={isCloning}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shared dashboards */}
            {dashboardList && dashboardList.shared.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Shared by Admins</p>
                <div className="space-y-1">
                  {dashboardList.shared.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={defaultId === d.id}
                      isDefault={defaultId === d.id}
                      subtitle={d.description ?? "Shared across the organisation"}
                      badge={visibilityBadge(d)}
                      icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                      onSetDefault={() => onSetDefault(d.id)}
                      onClone={() => onClone(d.id)}
                      onDelete={isElevated && d.userId !== null ? () => onDelete(d.id) : undefined}
                      isCloning={isCloning}
                    />
                  ))}
                </div>
              </div>
            )}

            {dashboardList?.personal.length === 0 && dashboardList?.shared.length === 0 && dashboardList?.teamVisible.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No saved dashboards yet. Use the Customize tab to create one.
              </p>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-6 pt-4 border-t space-y-3">
          {saveError && <ErrorAlert error={saveError} fallback="Failed to save dashboard" />}
          {tab === "customize" && (
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isSaving ? "Saving…" : activeDashboard ? "Save Changes" : "Save & Apply"}
              </Button>
            </div>
          )}
          {tab === "dashboards" && (
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Dashboard row (Dashboards tab) ────────────────────────────────────────────

function DashboardRow({
  name, subtitle, isActive, isDefault, icon, badge,
  onSetDefault, onDelete, onClone, isCloning,
}: {
  name: string;
  subtitle?: string;
  isActive: boolean;
  isDefault: boolean;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onSetDefault: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  isCloning?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors ${
      isActive ? "bg-muted/60 border-border" : "border-transparent hover:bg-muted/30"
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {icon}
          <span className="text-sm font-medium truncate">{name}</span>
          {isDefault && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />}
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isActive && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onSetDefault}>
            <Check className="h-3 w-3" />
            Use
          </Button>
        )}
        {isActive && <span className="text-xs text-muted-foreground px-2">Active</span>}
        {onClone && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClone}
            disabled={isCloning}
            title="Clone dashboard"
          >
            {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label={`Delete ${name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
