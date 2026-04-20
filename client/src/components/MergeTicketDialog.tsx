/**
 * MergeTicketDialog — lets an agent search for and select a parent ticket to
 * merge the current ticket(s) into.
 *
 * The merged ticket(s) are closed and linked to the parent via mergedIntoId.
 * Used from both the single-ticket header and the bulk-actions bar.
 */

import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ErrorAlert from "@/components/ErrorAlert";
import { Merge, Search, Loader2, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { statusLabel } from "core/constants/ticket-status.ts";
import type { TicketStatus } from "core/constants/ticket-status.ts";

interface TicketSearchResult {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  senderName: string;
}

interface MergeTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs of tickets being merged (source tickets). */
  sourceIds: number[];
  /** Label shown in the confirmation — e.g. "TKT-0001" or "3 tickets". */
  sourceLabel: string;
  /** Called after a successful merge so the parent can navigate / invalidate. */
  onMerged?: () => void;
}

const STATUS_DOT: Record<string, string> = {
  open:        "bg-pink-400",
  in_progress: "bg-violet-500",
  resolved:    "bg-emerald-500",
  closed:      "bg-muted-foreground/40",
};

export default function MergeTicketDialog({
  open, onOpenChange, sourceIds, sourceLabel, onMerged,
}: MergeTicketDialogProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TicketSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TicketSearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setSelected(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const excludeParam = sourceIds.length === 1 ? `&exclude=${sourceIds[0]}` : "";
        const { data } = await axios.get<{ tickets: TicketSearchResult[] }>(
          `/api/tickets/search?q=${encodeURIComponent(query)}${excludeParam}`
        );
        setResults(data.tickets);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, sourceIds]);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No target selected");

      if (sourceIds.length === 1) {
        // Single merge
        await axios.post(`/api/tickets/${sourceIds[0]}/merge`, { targetId: selected.id });
      } else {
        // Bulk merge
        await axios.post("/api/tickets/bulk", {
          action: "merge",
          ids: sourceIds,
          targetId: selected.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      if (sourceIds.length === 1) {
        queryClient.invalidateQueries({ queryKey: ["ticket", String(sourceIds[0])] });
      }
      onMerged?.();
      onOpenChange(false);
    },
  });

  const isMerged = mergeMutation.isSuccess;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4 text-muted-foreground" />
            Merge Ticket{sourceIds.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Search for the parent ticket to merge{" "}
            <span className="font-medium text-foreground">{sourceLabel}</span>{" "}
            into. The source ticket{sourceIds.length > 1 ? "s" : ""} will be closed and
            linked to the parent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Search by ticket number, subject or email…"
              className="pl-8 pr-8"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
            {query && !searching && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults([]); setSelected(null); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Results list */}
          {results.length > 0 && !selected && (
            <div className="rounded-lg border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
              {results.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[t.status] ?? "bg-muted-foreground/40"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">{t.ticketNumber}</span>
                      <span className="text-[11px] text-muted-foreground/60">·</span>
                      <span className="text-[11px] text-muted-foreground">{t.senderName}</span>
                    </div>
                    <p className="text-sm truncate mt-0.5">{t.subject}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                    {statusLabel[t.status as TicketStatus] ?? t.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {!searching && query && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">No matching tickets found.</p>
          )}

          {/* Selected ticket confirmation */}
          {selected && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">Merging into:</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] font-bold text-primary">{selected.ticketNumber}</span>
                    <span className="text-sm font-medium truncate">{selected.subject}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{sourceLabel}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="font-medium text-foreground">{selected.ticketNumber}</span>
                <span>— source will be closed</span>
              </div>
            </div>
          )}

          {mergeMutation.isError && (
            <ErrorAlert error={mergeMutation.error} fallback="Failed to merge ticket" />
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!selected || mergeMutation.isPending || isMerged}
              onClick={() => mergeMutation.mutate()}
            >
              {mergeMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Merging…</>
              ) : (
                <><Merge className="h-3.5 w-3.5" />Merge</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
