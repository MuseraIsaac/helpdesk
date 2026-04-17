import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { CatalogWithItems } from "core/constants/catalog.ts";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import { ShoppingBag, Search, ChevronRight, CheckSquare } from "lucide-react";

function CatalogItemCard({ item }: { item: CatalogWithItems["items"][number] }) {
  return (
    <Link
      to={`/portal/catalog/${item.id}`}
      className="flex items-start gap-3 p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors group"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0">
        {item.icon ?? "📦"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{item.name}</span>
          {item.requiresApproval && (
            <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200">
              Approval required
            </Badge>
          )}
        </div>
        {item.shortDescription && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.shortDescription}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

export default function PortalCatalogPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ catalog: CatalogWithItems[] }>({
    queryKey: ["portal-catalog"],
    queryFn: () => axios.get("/api/portal/catalog").then((r) => r.data),
  });

  const catalog = data?.catalog ?? [];

  const filtered = search.trim()
    ? catalog.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            (item.shortDescription ?? "").toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((g) => g.items.length > 0)
    : catalog;

  const totalItems = catalog.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Service Catalog</h1>
        <p className="text-muted-foreground mt-1">
          Browse and request services from our catalog.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search services…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load catalog" />}

      {isLoading && (
        <div className="space-y-6">
          {[1, 2].map((n) => (
            <div key={n} className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <div className="space-y-2">
                {[1, 2, 3].map((m) => <Skeleton key={m} className="h-20" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {search ? "No services match your search" : "No services available"}
          </p>
        </div>
      )}

      {!isLoading && filtered.map((group, i) => (
        <div key={group.category?.id ?? `uncat-${i}`} className="space-y-3">
          {group.category && (
            <div>
              <h2 className="font-semibold text-foreground">{group.category.name}</h2>
              {group.category.description && (
                <p className="text-sm text-muted-foreground">{group.category.description}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            {group.items.map((item) => (
              <CatalogItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}

      {!isLoading && totalItems > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2">
          <CheckSquare className="h-3.5 w-3.5 text-amber-500" />
          Items marked "Approval required" will be reviewed before fulfillment.
        </div>
      )}
    </div>
  );
}
