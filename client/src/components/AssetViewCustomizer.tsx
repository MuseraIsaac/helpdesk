import { useState, useEffect } from "react";
import {
  ASSET_COLUMN_IDS,
  ASSET_COLUMN_META,
  SYSTEM_DEFAULT_ASSET_VIEW_CONFIG,
  type AssetColumnId,
  type AssetViewConfig,
} from "core/schemas/asset-view.ts";
import { useAssetViews, type StoredAssetView } from "@/hooks/useAssetViews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ArrowUp, ArrowDown, Star, StarOff, Trash2, RotateCcw, Columns3, ListFilter,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

type ColumnEntry = { id: AssetColumnId; visible: boolean };

function normalizeAssetConfig(config: AssetViewConfig): AssetViewConfig {
  const byId = new Map(config.columns.map(c => [c.id, c]));
  const merged = ASSET_COLUMN_IDS.map(id =>
    byId.get(id) ?? { id, visible: ASSET_COLUMN_META[id].defaultVisible }
  );
  return { ...config, columns: merged };
}

// ── Column row ────────────────────────────────────────────────────────────────

function ColumnRow({
  entry, index, total, onToggle, onMoveUp, onMoveDown,
}: {
  entry: ColumnEntry; index: number; total: number;
  onToggle: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const meta = ASSET_COLUMN_META[entry.id];
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <Switch checked={entry.visible} onCheckedChange={onToggle} />
      <span className={`flex-1 text-sm font-medium ${entry.visible ? "" : "text-muted-foreground"}`}>
        {meta.label}
      </span>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6"
          onClick={onMoveUp} disabled={index === 0}>
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6"
          onClick={onMoveDown} disabled={index === total - 1}>
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface AssetViewCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AssetViewCustomizer({ open, onOpenChange }: AssetViewCustomizerProps) {
  const { viewList, activeView, activeConfig, saveView, setDefaultView, deleteView } = useAssetViews();

  const [draft, setDraft] = useState<AssetViewConfig>(() => normalizeAssetConfig(activeConfig));
  const [viewName, setViewName] = useState(activeView?.name ?? "My View");

  useEffect(() => {
    setDraft(normalizeAssetConfig(activeConfig));
    setViewName(activeView?.name ?? "My View");
  }, [activeView?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function moveColumn(index: number, direction: -1 | 1) {
    const cols = [...draft.columns];
    const swap = index + direction;
    if (swap < 0 || swap >= cols.length) return;
    [cols[index], cols[swap]] = [cols[swap], cols[index]];
    setDraft({ ...draft, columns: cols });
  }

  function toggleColumn(id: AssetColumnId) {
    setDraft({
      ...draft,
      columns: draft.columns.map(c => c.id === id ? { ...c, visible: !c.visible } : c),
    });
  }

  function resetToDefault() {
    setDraft(normalizeAssetConfig(SYSTEM_DEFAULT_ASSET_VIEW_CONFIG));
    setViewName("My View");
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(normalizeAssetConfig(activeConfig));

  const sortableColumns = ASSET_COLUMN_IDS.filter(id => ASSET_COLUMN_META[id].sortable);

  function handleSave() {
    saveView.mutate(
      { viewId: activeView?.id ?? null, name: viewName.trim() || "My View", config: draft, setAsDefault: true },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const personal = viewList?.personal ?? [];
  const shared   = viewList?.shared   ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns3 className="h-5 w-5" />
            Asset List Views
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="customize">
          <TabsList className="w-full">
            <TabsTrigger value="customize" className="flex-1">
              <ListFilter className="h-4 w-4 mr-1.5" />
              Customize
            </TabsTrigger>
            <TabsTrigger value="views" className="flex-1">
              My Views
              {personal.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {personal.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Customize tab ─────────────────────────────────────────── */}
          <TabsContent value="customize" className="mt-4 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="asset-view-name">View name</Label>
              <Input
                id="asset-view-name"
                value={viewName}
                onChange={e => setViewName(e.target.value)}
                placeholder="My View"
                className="h-8"
              />
            </div>

            {/* Default sort */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Default sort</Label>
                <Select
                  value={draft.sort.by}
                  onValueChange={by => setDraft({ ...draft, sort: { ...draft.sort, by } })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortableColumns.map(id => (
                      <SelectItem key={id} value={ASSET_COLUMN_META[id].sortKey!} className="text-xs">
                        {ASSET_COLUMN_META[id].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Direction</Label>
                <Select
                  value={draft.sort.order}
                  onValueChange={order => setDraft({ ...draft, sort: { ...draft.sort, order: order as "asc" | "desc" } })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc"  className="text-xs">Ascending</SelectItem>
                    <SelectItem value="desc" className="text-xs">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                Columns
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {draft.columns.map((entry, i) => (
                  <ColumnRow
                    key={entry.id}
                    entry={entry}
                    index={i}
                    total={draft.columns.length}
                    onToggle={() => toggleColumn(entry.id)}
                    onMoveUp={() => moveColumn(i, -1)}
                    onMoveDown={() => moveColumn(i, 1)}
                  />
                ))}
              </div>
            </div>

            {saveView.error && (
              <ErrorAlert error={saveView.error} fallback="Failed to save view" />
            )}
          </TabsContent>

          {/* ── My Views tab ───────────────────────────────────────────── */}
          <TabsContent value="views" className="mt-4">
            {personal.length === 0 && shared.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No saved views yet. Customize your columns and save a view.
              </p>
            ) : (
              <div className="space-y-4">
                {personal.length > 0 && (
                  <ViewSection
                    title="Personal"
                    views={personal}
                    activeViewId={activeView?.id ?? null}
                    onSetDefault={id => setDefaultView.mutate(id)}
                    onClearDefault={() => setDefaultView.mutate(null)}
                    onDelete={id => deleteView.mutate(id)}
                    deleteError={deleteView.error}
                  />
                )}
                {shared.length > 0 && (
                  <ViewSection
                    title="Shared"
                    views={shared}
                    activeViewId={null}
                    onSetDefault={() => {}}
                    onClearDefault={() => {}}
                    onDelete={() => {}}
                    readOnly
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={resetToDefault} className="mr-auto">
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Reset to default
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={(!isDirty && !!activeView) || saveView.isPending}>
            {activeView ? "Save Changes" : "Save & Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View section ──────────────────────────────────────────────────────────────

function ViewSection({
  title, views, activeViewId, onSetDefault, onClearDefault, onDelete, deleteError, readOnly,
}: {
  title: string;
  views: StoredAssetView[];
  activeViewId: number | null;
  onSetDefault: (id: number) => void;
  onClearDefault: () => void;
  onDelete: (id: number) => void;
  deleteError?: Error | null;
  readOnly?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">{title}</p>
      <div className="space-y-1.5">
        {views.map(view => (
          <div key={view.id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
            {view.emoji && <span className="text-base">{view.emoji}</span>}
            <span className="flex-1 text-sm font-medium">{view.name}</span>
            {view.isDefault && (
              <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">default</span>
            )}
            {!readOnly && (
              <>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  title={view.isDefault ? "Remove as default" : "Set as default"}
                  onClick={() => view.isDefault ? onClearDefault() : onSetDefault(view.id)}
                >
                  {view.isDefault
                    ? <StarOff className="h-3.5 w-3.5 text-amber-500" />
                    : <Star    className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Delete view"
                  onClick={() => onDelete(view.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      {deleteError && <ErrorAlert error={deleteError} fallback="Failed to delete view" />}
    </div>
  );
}
