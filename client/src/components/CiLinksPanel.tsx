/**
 * CiLinksPanel — reusable panel to view, add, and remove CI links
 * on a ticket, incident, or problem.
 *
 * Props:
 *   entityType — "tickets" | "incidents" | "problems"
 *   entityId   — the numeric record ID
 *   linkedCis  — already-linked CI summaries (from the parent's detail query)
 *   readonly   — if true, hides add/remove controls (for view-only roles)
 *   onChanged  — called after any add/remove to trigger a refetch
 */
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  CI_TYPE_LABEL, CI_CRITICALITY_LABEL, CI_STATUS_LABEL,
  CI_CRITICALITY_COLOR,
  type CiSummary,
} from "core/constants/cmdb.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ErrorAlert from "@/components/ErrorAlert";
import { Link2, Unlink, Search, X } from "lucide-react";

type EntityType = "tickets" | "incidents" | "problems";

interface Props {
  entityType: EntityType;
  entityId: number;
  linkedCis: Array<{ ci: CiSummary; linkedAt: string }>;
  readonly?: boolean;
  onChanged: () => void;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active:         "default",
  maintenance:    "outline",
  planned:        "secondary",
  retired:        "secondary",
  decommissioned: "secondary",
};

export default function CiLinksPanel({
  entityType,
  entityId,
  linkedCis,
  readonly = false,
  onChanged,
}: Props) {
  const [search, setSearch]     = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  // Search CIs for linking
  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["cmdb-search", search],
    queryFn: async () => {
      const { data } = await axios.get<{ items: CiSummary[] }>("/api/cmdb", {
        params: { search, pageSize: 10, status: "" },
      });
      return data.items;
    },
    enabled: showSearch && search.length >= 1,
  });

  const linkedIds = new Set(linkedCis.map((l) => l.ci.id));

  const linkMutation = useMutation({
    mutationFn: async (ciId: number) => {
      await axios.post(`/api/cmdb/links/${entityType}/${entityId}`, { ciId });
    },
    onSuccess: () => {
      onChanged();
      setSearch("");
      setShowSearch(false);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (ciId: number) => {
      await axios.delete(`/api/cmdb/links/${entityType}/${entityId}/${ciId}`);
    },
    onSuccess: onChanged,
  });

  return (
    <div className="space-y-3">
      {(linkMutation.error || unlinkMutation.error) && (
        <ErrorAlert
          error={linkMutation.error ?? unlinkMutation.error}
          fallback="CI link operation failed"
        />
      )}

      {/* Linked CIs list */}
      {linkedCis.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-1">No CIs linked</p>
      ) : (
        <div className="space-y-1.5">
          {linkedCis.map(({ ci }) => (
            <div
              key={ci.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/cmdb/${ci.id}`}
                    className="font-medium hover:underline truncate"
                  >
                    {ci.name}
                  </Link>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {ci.ciNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{CI_TYPE_LABEL[ci.type]}</span>
                  <span className={`text-xs font-semibold ${CI_CRITICALITY_COLOR[ci.criticality]}`}>
                    {CI_CRITICALITY_LABEL[ci.criticality]}
                  </span>
                  <Badge
                    variant={STATUS_VARIANT[ci.status] ?? "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {CI_STATUS_LABEL[ci.status]}
                  </Badge>
                </div>
              </div>
              {!readonly && (
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  onClick={() => unlinkMutation.mutate(ci.id)}
                  disabled={unlinkMutation.isPending}
                  aria-label={`Unlink ${ci.name}`}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add CI link */}
      {!readonly && (
        <div className="space-y-2">
          {!showSearch ? (
            <button
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowSearch(true)}
            >
              <Link2 className="h-3.5 w-3.5" />
              Link a CI
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="relative flex items-center gap-2">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search CI by name or number…"
                  className="pl-8 h-8 text-sm"
                />
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowSearch(false); setSearch(""); }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {search.length >= 1 && (
                <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                  {isFetching && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
                  )}
                  {!isFetching && searchResults?.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No CIs found</p>
                  )}
                  {searchResults?.map((ci) => {
                    const alreadyLinked = linkedIds.has(ci.id);
                    return (
                      <button
                        key={ci.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={alreadyLinked || linkMutation.isPending}
                        onClick={() => linkMutation.mutate(ci.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-sm font-medium">{ci.name}</span>
                            <span className="text-[10px] font-mono text-muted-foreground ml-2">
                              {ci.ciNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs text-muted-foreground">{CI_TYPE_LABEL[ci.type]}</span>
                            {alreadyLinked && (
                              <Badge variant="outline" className="text-[10px]">Linked</Badge>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
