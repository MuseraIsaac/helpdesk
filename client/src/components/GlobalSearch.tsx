/**
 * GlobalSearch — Cmd/Ctrl+K command palette.
 *
 * Opens a floating search overlay, queries GET /api/search, and displays
 * grouped, navigable results across tickets, incidents, problems, requests,
 * CIs, and KB articles.
 *
 * Integration: render <GlobalSearch /> once inside Layout (or App). It uses
 * a keyboard listener on the document and a portal-rendered overlay, so
 * placement in the DOM does not affect visual output.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Ticket,
  Siren,
  GitBranch,
  Inbox,
  Database,
  BookOpen,
  Search,
  Loader2,
  X,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SEARCH_TYPES, type SearchType } from "core/schemas/search.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchHit {
  id: number | string;
  title: string;
  number?: string;
  status?: string;
  href: string;
  meta?: string;
}

interface SearchResponse {
  query: string;
  results: Partial<Record<SearchType, SearchHit[]>>;
  totals: Partial<Record<SearchType, number>>;
}

// ── Per-type config ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  SearchType,
  { label: string; icon: React.ElementType; color: string }
> = {
  tickets:   { label: "Tickets",   icon: Ticket,   color: "text-blue-500" },
  incidents: { label: "Incidents", icon: Siren,    color: "text-red-500" },
  problems:  { label: "Problems",  icon: GitBranch, color: "text-orange-500" },
  requests:  { label: "Requests",  icon: Inbox,    color: "text-emerald-500" },
  cmdb:      { label: "CMDB",      icon: Database, color: "text-purple-500" },
  kb:        { label: "Articles",  icon: BookOpen, color: "text-sky-500" },
};

// ── Debounce ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  hit,
  isSelected,
  onMouseEnter,
  onClick,
}: {
  hit: SearchHit;
  isSelected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected]);

  return (
    <button
      ref={ref}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={[
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50",
      ].join(" ")}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate leading-none">{hit.title}</p>
        {hit.meta && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{hit.meta}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {hit.number && (
          <span className="text-[11px] text-muted-foreground font-mono">{hit.number}</span>
        )}
        {hit.status && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
            {hit.status.replace(/_/g, " ")}
          </Badge>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Keyboard shortcut to open ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Focus input when opened ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // ── Search query ─────────────────────────────────────────────────────────
  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["global-search", debouncedQuery],
    queryFn: async () => {
      const { data } = await axios.get<SearchResponse>("/api/search", {
        params: { q: debouncedQuery, limit: 5 },
      });
      return data;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // ── Build flat hit list for keyboard navigation ─────────────────────────
  const allHits: Array<{ type: SearchType; hit: SearchHit }> = [];
  if (data) {
    for (const type of SEARCH_TYPES) {
      for (const hit of data.results[type] ?? []) {
        allHits.push({ type, hit });
      }
    }
  }

  const navigate_ = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate]
  );

  // ── Keyboard navigation inside overlay ───────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allHits.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && allHits[selectedIndex]) {
      navigate_(allHits[selectedIndex].hit.href);
    }
  };

  // ── Reset selected index when results change ─────────────────────────────
  useEffect(() => setSelectedIndex(0), [debouncedQuery]);

  if (!open) return null;

  // ── Group hits by type for rendering ────────────────────────────────────
  const groups: Array<{ type: SearchType; hits: SearchHit[] }> = [];
  let flatIdx = 0;
  for (const type of SEARCH_TYPES) {
    const hits = data?.results[type];
    if (hits && hits.length > 0) {
      groups.push({ type, hits });
    }
  }

  const hasResults = allHits.length > 0;
  const showEmpty = debouncedQuery.length >= 2 && !isFetching && !hasResults;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[10vh]"
      onClick={() => setOpen(false)}
      onKeyDown={handleKeyDown}
    >
      {/* Panel */}
      <div
        className="w-full max-w-xl bg-background rounded-xl border shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b h-14">
          {isFetching ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tickets, incidents, KB articles…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[60vh]">
          {/* Prompt before typing */}
          {debouncedQuery.length < 2 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Search className="h-8 w-8 opacity-30" />
              <p className="text-sm">Type at least 2 characters to search</p>
              <p className="text-[11px] opacity-60">
                Searches tickets · incidents · problems · requests · CMDB · KB
              </p>
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <p className="text-sm">No results for &ldquo;{debouncedQuery}&rdquo;</p>
            </div>
          )}

          {/* Grouped results */}
          {groups.map(({ type, hits }) => {
            const cfg = TYPE_CONFIG[type];
            const Icon = cfg.icon;

            return (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {cfg.label}
                  </span>
                </div>

                {/* Hits */}
                {hits.map((hit) => {
                  const idx = flatIdx++;
                  return (
                    <ResultRow
                      key={`${type}-${hit.id}`}
                      hit={hit}
                      isSelected={selectedIndex === idx}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => navigate_(hit.href)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {hasResults && (
          <div className="border-t px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="border rounded px-1 py-0.5">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border rounded px-1 py-0.5">↵</kbd> open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border rounded px-1 py-0.5">Esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
