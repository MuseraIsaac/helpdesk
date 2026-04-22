/**
 * AddChildTicketDialog — search for a ticket and absorb it as a child of the
 * current (parent) ticket. Calls POST /api/tickets/:parentId/absorb.
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
import { GitMerge, Search, Loader2, X, CheckCircle2, ArrowDownToLine } from "lucide-react";
import { statusLabel } from "core/constants/ticket-status.ts";
import type { TicketStatus } from "core/constants/ticket-status.ts";

interface TicketSearchResult {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  senderName: string;
}

interface AddChildTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: number;
  parentNumber: string;
  onAdded?: () => void;
}

const STATUS_DOT: Record<string, string> = {
  open:        "bg-pink-400",
  in_progress: "bg-violet-500",
  resolved:    "bg-emerald-500",
  closed:      "bg-muted-foreground/40",
};

export default function AddChildTicketDialog({
  open, onOpenChange, parentId, parentNumber, onAdded,
}: AddChildTicketDialogProps) {
  const queryClient = useQueryClient();
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<TicketSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected,  setSelected]  = useState<TicketSearchResult | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setSelected(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await axios.get<{ tickets: TicketSearchResult[] }>(
          `/api/tickets/search?q=${encodeURIComponent(query)}&exclude=${parentId}`
        );
        setResults(data.tickets);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, parentId]);

  const absorbMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No ticket selected");
      await axios.post(`/api/tickets/${parentId}/absorb`, { childId: selected.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", String(parentId)] });
      onAdded?.();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
            Add Child Ticket
          </DialogTitle>
          <DialogDescription>
            Search for a ticket to merge into{" "}
            <span className="font-mono font-semibold text-foreground">{parentNumber}</span>.
            The selected ticket will be closed and linked here as a child.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
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

          {/* Results */}
          {results.length > 0 && !selected && (
            <div className="rounded-lg border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
              {results.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[t.status] ?? "bg-muted-foreground/40"}`} />
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

          {/* Selected confirmation */}
          {selected && (
            <div className="rounded-xl border border-violet-300/60 bg-violet-50/60 dark:border-violet-800/40 dark:bg-violet-950/20 p-3.5 space-y-2">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">Adding as child:</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] font-bold text-violet-600 dark:text-violet-400">{selected.ticketNumber}</span>
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
              <div className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                <GitMerge className="h-3 w-3 shrink-0 text-violet-400" />
                <span className="font-medium text-foreground">{selected.ticketNumber}</span>
                <span>will be closed and added as a child of</span>
                <span className="font-mono font-semibold text-foreground">{parentNumber}</span>
              </div>
            </div>
          )}

          {absorbMutation.isError && (
            <ErrorAlert error={absorbMutation.error} fallback="Failed to add child ticket" />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white border-0"
              disabled={!selected || absorbMutation.isPending}
              onClick={() => absorbMutation.mutate()}
            >
              {absorbMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Adding…</>
              ) : (
                <><ArrowDownToLine className="h-3.5 w-3.5" />Add Child Ticket</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
