import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { CatalogItemSummary, CatalogCategorySummary } from "core/constants/catalog.ts";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ShoppingBag,
  Search,
  ChevronRight,
  CheckSquare,
  Settings,
  X,
  Filter,
  ShieldCheck,
  Sparkles,
  Layers,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";

// ── Catalog item card ─────────────────────────────────────────────────────────
//
// Each card surfaces the icon, name, short description, fulfilment team,
// and an approval-required hint — enough for a customer to decide whether
// to drill in. Hover lifts the card slightly and slides the chevron, which
// reads as "actionable" without needing extra UI chrome.

function CatalogItemCard({ item }: { item: CatalogItemSummary }) {
  return (
    <Link
      to={`/catalog/${item.id}`}
      className="group relative flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all"
    >
      {/* Icon badge */}
      <div className="h-11 w-11 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-xl shrink-0 transition-transform duration-200 group-hover:scale-105">
        {item.icon ?? "📦"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="font-semibold text-sm leading-snug truncate">{item.name}</span>
          {item.requiresApproval && (
            <Badge
              variant="outline"
              className="text-[10px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/60 gap-1 px-1.5 py-0"
              title="Request requires approval before fulfilment"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              Approval
            </Badge>
          )}
        </div>

        {item.shortDescription && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
            {item.shortDescription}
          </p>
        )}

        {/* Footer meta */}
        <div className="flex items-center gap-2 mt-2.5">
          {item.category && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80">
              <Layers className="h-2.5 w-2.5" />
              {item.category.name}
            </span>
          )}
          {item.fulfillmentTeam && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: item.fulfillmentTeam.color }}
              />
              {item.fulfillmentTeam.name}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface CatalogResponse {
  categories: CatalogCategorySummary[];
  items:      CatalogItemSummary[];
}

export default function CatalogPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState(""); // debounced
  const [categoryId,  setCategoryId]  = useState<string>("all");
  const [view,        setView]        = useState<"grouped" | "list">("grouped");

  // 300 ms debounce — short enough for snappy feel, long enough to skip
  // mid-typing requests.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, error, isFetching } = useQuery<CatalogResponse>({
    queryKey: ["catalog", { search, categoryId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search)                params.set("search", search);
      if (categoryId !== "all")  params.set("categoryId", categoryId);
      const qs = params.toString();
      const { data } = await axios.get<CatalogResponse>(`/api/catalog${qs ? `?${qs}` : ""}`);
      return data;
    },
    placeholderData: (prev) => prev,
  });

  const categories = data?.categories ?? [];
  const items      = data?.items      ?? [];
  const totalItems = items.length;

  // Group items by category for the grouped-view layout. Items with no
  // category fall into a synthetic "Other Services" bucket so nothing
  // gets dropped from the list.
  const grouped = useMemo(() => {
    const byCategory = new Map<number, CatalogItemSummary[]>();
    const orphans:   CatalogItemSummary[] = [];
    for (const item of items) {
      if (item.category) {
        const list = byCategory.get(item.category.id) ?? [];
        list.push(item);
        byCategory.set(item.category.id, list);
      } else {
        orphans.push(item);
      }
    }
    const result: { category: CatalogCategorySummary | null; items: CatalogItemSummary[] }[] = [];
    for (const cat of categories) {
      const list = byCategory.get(cat.id);
      if (list && list.length) result.push({ category: cat, items: list });
    }
    if (orphans.length) result.push({ category: null, items: orphans });
    return result;
  }, [categories, items]);

  const hasFilter = search !== "" || categoryId !== "all";
  function clearFilters() {
    setSearchInput(""); setSearch("");
    setCategoryId("all");
  }

  return (
    <div className="space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/15 to-violet-500/10 shadow-sm">
            <ShoppingBag className="h-5 w-5 text-primary" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Service Catalog</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading
                ? "Loading available services…"
                : `${totalItems} available service${totalItems !== 1 ? "s" : ""}`}
              {hasFilter && <span className="text-muted-foreground/60"> · filtered</span>}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/catalog/admin">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Manage Catalog
            </Link>
          </Button>
        )}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search services by name or description…"
            className="h-9 pl-9 pr-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchInput) {
                e.preventDefault();
                setSearchInput("");
              }
            }}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {categories.length > 0 && (
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-52 h-9 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* View toggle — grouped (default) vs flat list */}
        <div className="inline-flex rounded-md border border-border/60 bg-card overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setView("grouped")}
            className={`px-3 h-9 text-xs font-medium transition-colors ${view === "grouped" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
          >
            <Layers className="h-3.5 w-3.5 inline mr-1.5" />
            Grouped
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-3 h-9 text-xs font-medium transition-colors border-l border-border/60 ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
          >
            <Sparkles className="h-3.5 w-3.5 inline mr-1.5" />
            All items
          </button>
        </div>

        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={clearFilters}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        {isFetching && !isLoading && (
          <span className="ml-auto text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Updating…
          </span>
        )}
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load catalog" />}

      {isLoading && (
        <div className="space-y-6">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {[1, 2, 3].map((m) => <Skeleton key={m} className="h-24" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty / no-match state ───────────────────────────────────────── */}
      {!isLoading && totalItems === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 bg-card flex flex-col items-center justify-center py-16 text-center gap-3 px-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 border">
            {hasFilter
              ? <Filter className="h-6 w-6 text-muted-foreground" />
              : <ShoppingBag className="h-6 w-6 text-muted-foreground" />}
          </span>
          <div>
            <p className="text-sm font-semibold">
              {hasFilter ? "No services match your search" : "Catalog is empty"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {hasFilter
                ? "Try a different search term or clear filters to see all available services."
                : "Create categories and items in the admin panel to get started."}
            </p>
          </div>
          {hasFilter ? (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1.5" />
              Clear filters
            </Button>
          ) : isAdmin ? (
            <Button size="sm" asChild>
              <Link to="/catalog/admin">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Manage Catalog
              </Link>
            </Button>
          ) : null}
        </div>
      )}

      {/* ── Results: grouped view ────────────────────────────────────────── */}
      {!isLoading && totalItems > 0 && view === "grouped" && (
        <div className="space-y-7">
          {grouped.map((group, i) => (
            <section key={group.category?.id ?? `uncat-${i}`} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-sm font-semibold tracking-tight">
                  {group.category?.name ?? "Other Services"}
                </h2>
                <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                  {group.items.length}
                </span>
                {group.category?.description && (
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    — {group.category.description}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {group.items.map((item) => (
                  <CatalogItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Results: flat list view ──────────────────────────────────────── */}
      {!isLoading && totalItems > 0 && view === "list" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((item) => (
            <CatalogItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Footer hint */}
      {!isLoading && totalItems > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2">
          <CheckSquare className="h-3.5 w-3.5 text-amber-500" />
          Items marked “Approval” require sign-off before they enter fulfilment.
        </div>
      )}
    </div>
  );
}
