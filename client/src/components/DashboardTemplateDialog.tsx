/**
 * DashboardTemplateDialog — lets users pick a predefined dashboard template
 * and create a personal dashboard from it.
 */
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listDashboardTemplates } from "@/lib/reports/analytics-api";
import type { DashboardTemplate } from "@/lib/reports/analytics-api";

// ── Template card ─────────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, string> = {
  service_desk:      "🎯",
  itsm_operations:   "⚙️",
  manager_view:      "📊",
  agent_performance: "🏆",
};

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: DashboardTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-4 rounded-lg border-2 transition-all",
        "hover:border-primary/50 hover:bg-muted/30",
        selected
          ? "border-primary bg-primary/5 dark:bg-primary/10"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none shrink-0 mt-0.5">
          {TEMPLATE_ICONS[template.id] ?? "📋"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{template.name}</span>
            {selected && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {template.description}
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            {template.widgets.length} widgets · {template.config.period}-day default period
          </p>
        </div>
      </div>
    </button>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

interface DashboardTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DashboardTemplateDialog({ open, onOpenChange }: DashboardTemplateDialogProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["dashboard-templates"],
    queryFn: listDashboardTemplates,
    staleTime: 5 * 60_000,
  });

  const createMut = useMutation({
    mutationFn: async (template: DashboardTemplate) => {
      const { data } = await axios.post<{ dashboard: { id: number } }>("/api/dashboards", {
        name:     template.name,
        description: template.description,
        isShared: false,
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

  const selected = templates.find(t => t.id === selectedId) ?? null;

  function handleCreate() {
    if (!selected) return;
    createMut.mutate(selected);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Choose a Dashboard Template
          </DialogTitle>
          <DialogDescription>
            Start from a curated layout. You can customise widgets and add more after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 max-h-[420px] overflow-y-auto">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-muted/40 rounded-lg animate-pulse" />
            ))
          ) : (
            templates.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={selectedId === t.id}
                onSelect={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selected || createMut.isPending}
            className="gap-1.5"
          >
            {createMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
              : <>Create Dashboard</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
