/**
 * WidgetShell — the outer card frame for every analytics widget.
 *
 * Responsibilities:
 *   - Shows widget title, optional unit badge, and period label
 *   - Hosts the drag handle (GripVertical) in edit mode
 *   - Provides an action menu (edit config, duplicate, remove)
 *   - Renders loading skeleton and error states
 *   - Passes available content height to child renderers
 */
import {
  MoreHorizontal, GripVertical, Pencil, Copy, Trash2,
  AlertTriangle, RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_H = 40; // px — title row
const PADDING  = 12; // px — inner padding (top + bottom)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WidgetShellProps {
  title: string;
  /** Optional small badge to right of title (e.g. unit, period) */
  badge?: string;
  isLoading?: boolean;
  error?: Error | null;
  editMode?: boolean;
  /** Called when the user clicks "Edit" in the kebab menu */
  onEdit?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onRetry?: () => void;
  /** Total pixel height of the grid cell (including header) */
  totalHeight: number;
  children: React.ReactNode;
  className?: string;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function WidgetSkeleton({ contentH }: { contentH: number }) {
  return (
    <div className="space-y-2 py-1" style={{ height: contentH }}>
      <Skeleton className="h-8 w-2/3 rounded" />
      <Skeleton className="h-full rounded" style={{ height: contentH - 48 }} />
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function WidgetError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-4">
      <AlertTriangle className="h-6 w-6 text-destructive/60" strokeWidth={1.5} />
      <p className="text-[11px] text-muted-foreground max-w-[180px] leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      )}
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export function WidgetShell({
  title,
  badge,
  isLoading,
  error,
  editMode,
  onEdit,
  onDuplicate,
  onRemove,
  onRetry,
  totalHeight,
  children,
  className,
}: WidgetShellProps) {
  const contentH = totalHeight - HEADER_H - PADDING;

  // Whether the rendered value already carries its own unit suffix (e.g.
  // `4.7d`, `100%`, `3.2h`). For those units the unit badge is redundant
  // and was actively misleading — the metric's canonical unit is "seconds"
  // server-side (because every aggregate is computed via EXTRACT(EPOCH …)),
  // but the formatter auto-converts to s/m/h/d at display time. Showing
  // "SECONDS" beside `4.7d` made users think the value was wrong.
  //
  // Score and count get a badge because the value itself has no unit suffix.
  const SELF_LABELLED_UNITS = new Set(["percent", "seconds", "minutes", "hours", "days"]);
  const showBadge = !!badge && !SELF_LABELLED_UNITS.has(badge);

  // Friendlier badge labels for the units that survive the filter above.
  const badgeLabel =
    badge === "score" ? "Score" :
    badge === "count" ? "Count" :
    badge;

  // Tonal family so the badge picks up a matching accent — looks much more
  // intentional than a flat grey pill.
  const badgeTone =
    badge === "score"    ? "bg-amber-500/12   text-amber-700   dark:text-amber-300   border-amber-500/25"   :
    badge === "count"    ? "bg-violet-500/12  text-violet-700  dark:text-violet-300  border-violet-500/25"  :
                           "bg-muted/60 text-muted-foreground border-border/50";

  return (
    <div
      className={cn(
        "relative flex flex-col h-full bg-card border border-border/70 rounded-xl overflow-hidden",
        "shadow-[0_1px_3px_0_rgb(0,0,0,0.04),0_2px_8px_-2px_rgb(0,0,0,0.06)]",
        "transition-shadow hover:shadow-md",
        className,
      )}
    >
      {/* Top accent rail — picks up palette via primary, very subtle */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-primary/40 via-primary/15 to-transparent pointer-events-none" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3 shrink-0 border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent"
        style={{ height: HEADER_H }}
      >
        {/* Drag handle — only visible in edit mode */}
        {editMode && (
          <span className="drag-handle text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}

        {/* Title */}
        <p className="flex-1 min-w-0 text-[11px] font-bold text-foreground/85 truncate uppercase tracking-[0.08em] leading-none">
          {title}
        </p>

        {/* Badge — only shown for units that don't already appear in the
            rendered value (so we don't double-label "4.7d SECONDS"). */}
        {showBadge && (
          <span className={`shrink-0 text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${badgeTone}`}>
            {badgeLabel}
          </span>
        )}

        {/* Actions menu */}
        {(onEdit || onDuplicate || onRemove) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 text-xs">
              {onEdit && (
                <DropdownMenuItem className="text-xs gap-2" onClick={onEdit}>
                  <Pencil className="h-3 w-3" /> Edit widget
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem className="text-xs gap-2" onClick={onDuplicate}>
                  <Copy className="h-3 w-3" /> Duplicate
                </DropdownMenuItem>
              )}
              {onRemove && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2 text-destructive focus:text-destructive"
                    onClick={onRemove}
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 px-3 pb-3 overflow-hidden"
        style={{ height: contentH }}
      >
        {isLoading ? (
          <WidgetSkeleton contentH={contentH} />
        ) : error ? (
          <WidgetError message={error.message} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
