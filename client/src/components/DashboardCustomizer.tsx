/**
 * DashboardCustomizer
 *
 * A Dialog that lets users:
 *   – Reorder and toggle dashboard widget visibility
 *   – Set the default time period and layout density
 *   – Save the configuration (creates a new personal dashboard or updates existing)
 *   – Manage saved dashboards (switch active, set default, delete)
 *
 * Two tabs:
 *   Customize – edit the current draft config (period, density, widgets)
 *   Dashboards – browse and manage saved configs
 */
import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  Star,
  RotateCcw,
  Globe,
} from "lucide-react";
import {
  WIDGET_IDS,
  WIDGET_META,
  SYSTEM_DEFAULT_CONFIG,
  type DashboardConfigData,
  type WidgetId,
} from "core/schemas/dashboard.ts";
import { type StoredDashboard } from "@/hooks/useDashboardConfig";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The config currently being displayed on the dashboard */
  activeConfig: DashboardConfigData;
  /** The saved dashboard record, if any (null = showing system default) */
  activeDashboard: StoredDashboard | null;
  /** Full dashboard list for the "Dashboards" tab */
  dashboardList: { personal: StoredDashboard[]; shared: StoredDashboard[]; defaultDashboardId: number | null } | null;
  /** Called when the user saves their customization */
  onSave: (config: DashboardConfigData, name: string) => void;
  /** Called when the user picks a different dashboard to activate */
  onSetDefault: (dashboardId: number | null) => void;
  /** Called when the user deletes a personal dashboard */
  onDelete: (dashboardId: number) => void;
  isSaving?: boolean;
  saveError?: Error | null;
}

type Period = 7 | 30 | 90;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure the config has all known widgets (fills in any missing ones). */
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
  id,
  visible,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  id: WidgetId;
  visible: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = WIDGET_META[id];
  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Reorder buttons */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          aria-label={`Move ${meta.label} up`}
        >
          <ArrowUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          aria-label={`Move ${meta.label} down`}
        >
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-none ${!visible ? "text-muted-foreground" : ""}`}>
          {meta.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {meta.description}
        </p>
      </div>

      {/* Visibility toggle */}
      <Switch
        checked={visible}
        onCheckedChange={onToggle}
        aria-label={`${visible ? "Hide" : "Show"} ${meta.label}`}
      />
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
  isSaving,
  saveError,
}: DashboardCustomizerProps) {
  const [tab, setTab] = useState<"customize" | "dashboards">("customize");
  const [name, setName] = useState(() => activeDashboard?.name ?? "My Dashboard");

  // Draft config — initialized from activeConfig each time the dialog opens
  const [draft, setDraft] = useState<DashboardConfigData>(() =>
    normalizeConfig(activeConfig),
  );

  // Reset draft when dialog opens with a (possibly different) activeConfig
  // We use key on Dialog to force remount, so this useState initializer runs fresh.

  const sortedWidgets = [...draft.widgets].sort((a, b) => a.order - b.order);

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
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function handleSave() {
    onSave(draft, name.trim() || "My Dashboard");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isOnSystemDefault = activeDashboard === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={v => setTab(v as typeof tab)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="mx-6 mb-2 shrink-0 w-auto self-start">
            <TabsTrigger value="customize">Customize</TabsTrigger>
            <TabsTrigger value="dashboards">My Dashboards</TabsTrigger>
          </TabsList>

          {/* ── Customize tab ────────────────────────────────────────────── */}
          <TabsContent
            value="customize"
            className="flex-1 overflow-y-auto px-6 space-y-5 mt-0"
          >
            {/* Dashboard name */}
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
                <p className="text-xs text-muted-foreground">
                  Saving will create a new personal dashboard.
                </p>
              )}
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
                Toggle visibility and drag to reorder using the arrows.
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

            {/* Reset */}
            <div className="pb-4">
              <button
                type="button"
                onClick={resetToDefault}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to system defaults
              </button>
            </div>
          </TabsContent>

          {/* ── Dashboards tab ────────────────────────────────────────────── */}
          <TabsContent
            value="dashboards"
            className="flex-1 overflow-y-auto px-6 mt-0 space-y-4"
          >
            {/* System default */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                System Default
              </p>
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
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  My Dashboards
                </p>
                <div className="space-y-1">
                  {dashboardList.personal.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={dashboardList.defaultDashboardId === d.id}
                      isDefault={dashboardList.defaultDashboardId === d.id}
                      subtitle={`Last updated ${new Date(d.updatedAt).toLocaleDateString()}`}
                      onSetDefault={() => onSetDefault(d.id)}
                      onDelete={() => onDelete(d.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shared dashboards */}
            {dashboardList && dashboardList.shared.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Shared by Admins
                </p>
                <div className="space-y-1">
                  {dashboardList.shared.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={dashboardList.defaultDashboardId === d.id}
                      isDefault={dashboardList.defaultDashboardId === d.id}
                      subtitle="Shared across the organisation"
                      icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                      onSetDefault={() => onSetDefault(d.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {dashboardList?.personal.length === 0 && dashboardList?.shared.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No saved dashboards yet. Use the Customize tab to create one.
              </p>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-6 pt-4 border-t space-y-3">
          {saveError && (
            <ErrorAlert error={saveError} fallback="Failed to save dashboard" />
          )}
          {tab === "customize" && (
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving…" : activeDashboard ? "Save Changes" : "Save & Apply"}
              </Button>
            </div>
          )}
          {tab === "dashboards" && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
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
  name,
  subtitle,
  isActive,
  isDefault,
  icon,
  onSetDefault,
  onDelete,
}: {
  name: string;
  subtitle?: string;
  isActive: boolean;
  isDefault: boolean;
  icon?: React.ReactNode;
  onSetDefault: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors ${
        isActive ? "bg-muted/60 border-border" : "border-transparent hover:bg-muted/30"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-sm font-medium truncate">{name}</span>
          {isDefault && (
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onSetDefault}
          >
            <Check className="h-3 w-3" />
            Use
          </Button>
        )}
        {isActive && (
          <span className="text-xs text-muted-foreground px-2">Active</span>
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
