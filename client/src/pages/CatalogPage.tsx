import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { CatalogWithItems } from "core/constants/catalog.ts";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import { ShoppingBag, Search, ChevronRight, CheckSquare, Settings } from "lucide-react";
import { useSession } from "@/lib/auth-client";

function CatalogItemCard({ item }: { item: CatalogWithItems["items"][number] }) {
  return (
    <Link
      to={`/catalog/${item.id}`}
      className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0">
        {item.icon ?? "📦"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.name}</span>
          {item.requiresApproval && (
            <Badge variant="outline" className="text-[11px] shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200">
              Approval required
            </Badge>
          )}
        </div>
        {item.shortDescription && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.shortDescription}</p>
        )}
        {item.fulfillmentTeam && (
          <p className="text-xs text-muted-foreground mt-1">
            Fulfilled by <span className="font-medium">{item.fulfillmentTeam.name}</span>
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

export default function CatalogPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ catalog: CatalogWithItems[] }>({
    queryKey: ["catalog"],
    queryFn: () => axios.get("/api/catalog").then((r) => r.data),
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Catalog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${totalItems} available service${totalItems !== 1 ? "s" : ""}`}
          </p>
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

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search services…"
          className="pl-8 h-8 text-sm"
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3].map((m) => <Skeleton key={m} className="h-20" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {search ? "No services match your search" : "No services available"}
          </p>
          {search && (
            <p className="text-xs mt-1">Try adjusting your search term</p>
          )}
        </div>
      )}

      {!isLoading && filtered.map((group, i) => (
        <div key={group.category?.id ?? `uncat-${i}`} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {group.category?.name ?? "Other Services"}
            </h2>
            {group.category?.description && (
              <span className="text-xs text-muted-foreground">— {group.category.description}</span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.items.map((item) => (
              <CatalogItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}

      {!isLoading && totalItems === 0 && !search && isAdmin && (
        <div className="text-center py-8 border rounded-lg bg-muted/30">
          <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium mb-1">Catalog is empty</p>
          <p className="text-xs text-muted-foreground mb-3">Create categories and items in the admin panel to get started.</p>
          <Button size="sm" asChild>
            <Link to="/catalog/admin">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Manage Catalog
            </Link>
          </Button>
        </div>
      )}

      {!isLoading && totalItems > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2">
          <CheckSquare className="h-3.5 w-3.5" />
          Requests with approval required will be routed to approvers before fulfillment.
        </div>
      )}
    </div>
  );
}
