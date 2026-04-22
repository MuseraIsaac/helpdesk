/**
 * DashboardTemplateDialog — visual gallery of curated dashboard templates.
 * Each card shows a mini block-preview of the layout and colour theme.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, CheckCircle2, Loader2, Search } from "lucide-react";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listDashboardTemplates } from "@/lib/reports/analytics-api";
import type { DashboardTemplate } from "@/lib/reports/analytics-api";

// ── Mini layout preview ────────────────────────────────────────────────────────

interface PreviewBlock {
  x: number;
  w: number;
  label: string;
  color: string;
}

function MiniLayoutPreview({
  rows,
  accentColor,
}: {
  rows?: PreviewBlock[][];
  accentColor: string;
}) {
  if (!rows || rows.length === 0) {
    // Fallback: generic 3-row skeleton
    return (
      <div className="space-y-1 w-full">
        {[12, 6, 6, 12].map((w, i) => (
          <div key={i} className="h-2 rounded-sm opacity-30" style={{ width: `${(w / 12) * 100}%`, background: accentColor }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1 w-full">
      {rows.map((row, ri) => (
        <div key={ri} className="flex gap-0.5 w-full h-3">
          {row.map((block, bi) => (
            <div
              key={bi}
              title={block.label}
              className="rounded-sm flex items-center justify-center overflow-hidden"
              style={{
                width:  `calc(${(block.w / 12) * 100}% - 1px)`,
                background: block.color,
                opacity: 0.85,
              }}
            >
              {block.w >= 4 && (
                <span className="text-white text-[5px] font-bold truncate px-0.5 leading-none select-none">
                  {block.label}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: DashboardTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = (template as any).accentColor ?? "#6366F1";
  const tags   = (template as any).tags  as string[] | undefined;
  const rows   = (template as any).previewRows as PreviewBlock[][] | undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border-2 overflow-hidden transition-all group",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-transparent shadow-[0_0_0_2px_var(--color-primary)]"
          : "border-border hover:border-border/80 hover:shadow-md",
      )}
      style={selected ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
    >
      {/* Coloured header strip with preview */}
      <div
        className="px-4 pt-4 pb-3 relative"
        style={{ background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)` }}
      >
        {/* Selection check */}
        {selected && (
          <div
            className="absolute top-3 right-3 h-5 w-5 rounded-full flex items-center justify-center text-white text-xs shadow-sm"
            style={{ background: accent }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </div>
        )}

        {/* Layout preview */}
        <div className="mb-3">
          <MiniLayoutPreview rows={rows} accentColor={accent} />
        </div>

        {/* Widget count pill */}
        <div
          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
          style={{ color: accent, borderColor: `${accent}40`, background: `${accent}12` }}
        >
          <div className="h-1 w-1 rounded-full" style={{ background: accent }} />
          {template.widgets.length} widgets
          {(template as any).config?.density === "compact" && " · compact"}
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <div
            className="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: `${accent}15`, borderColor: `${accent}30` }}
          >
            <LayoutDashboard className="h-3.5 w-3.5" style={{ color: accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{template.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
              {template.description}
            </p>
          </div>
        </div>

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[9px] px-1.5 py-0 h-4 font-medium capitalize"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

interface DashboardTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = ["All", "Support", "Operations", "Management", "Quality", "People"];

export default function DashboardTemplateDialog({ open, onOpenChange }: DashboardTemplateDialogProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [filterCat,    setFilterCat]    = useState<string>("All");
  const [searchQuery,  setSearchQuery]  = useState<string>("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["dashboard-templates"],
    queryFn:  listDashboardTemplates,
    staleTime: 5 * 60_000,
  });

  const createMut = useMutation({
    mutationFn: async (template: DashboardTemplate) => {
      const { data } = await axios.post<{ dashboard: { id: number } }>("/api/dashboards", {
        name:        template.name,
        description: template.description,
        isShared:    false,
        config: {
          period:  template.config.period,
          density: template.config.density,
          widgets: template.widgets,
        },
      });
      return data.dashboard;
    },
    onSuccess: (dashboard) => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      onOpenChange(false);
      navigate(`/?dashboard=${dashboard.id}`);
    },
  });

  const filtered = templates.filter(t => {
    const matchesCat = filterCat === "All" || (t as any).category === filterCat;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q
      || t.name.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
      || ((t as any).tags as string[] | undefined)?.some((tag: string) => tag.includes(q));
    return matchesCat && matchesSearch;
  });

  const selected = templates.find(t => t.id === selectedId) ?? null;

  function handleCreate() {
    if (!selected) return;
    createMut.mutate(selected);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelectedId(null); setSearchQuery(""); setFilterCat("All"); } }}>
      <DialogContent className="sm:max-w-[780px] flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutDashboard className="h-4.5 w-4.5 text-primary" />
            Dashboard Templates
          </DialogTitle>
          <DialogDescription className="text-sm">
            Choose a professionally designed layout. You can customise it fully after creation.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex items-center gap-2 shrink-0 -mt-1">
          <div className="relative flex-1 max-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search templates…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  filterCat === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-52 bg-muted/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <LayoutDashboard className="h-8 w-8 opacity-30" />
              <p className="text-sm">No templates match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
              {filtered.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={selectedId === t.id}
                  onSelect={() => setSelectedId(selectedId === t.id ? null : t.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t shrink-0">
          <p className="text-xs text-muted-foreground">
            {selected
              ? `Selected: ${selected.name} · ${selected.widgets.length} widgets`
              : `${filtered.length} template${filtered.length !== 1 ? "s" : ""} available`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!selected || createMut.isPending}
              className="gap-1.5 min-w-[130px]"
            >
              {createMut.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</>
                : <>Create Dashboard</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
