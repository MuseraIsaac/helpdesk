/**
 * ChangeCiLinksPanel — view, add, and remove CI links on a change request.
 *
 * Uses the change-specific endpoints:
 *   POST   /api/changes/:changeId/ci-links         — link a CI
 *   DELETE /api/changes/:changeId/ci-links/:ciId   — remove a CI link
 *
 * The primary CI (stored directly on the change) is shown read-only at the
 * top; the linked CIs (via ChangeCiLink) are managed here.
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import {
  CI_TYPE_LABEL,
  CI_CRITICALITY_LABEL,
  CI_CRITICALITY_COLOR,
  CI_STATUS_LABEL,
  type CiSummary,
} from "core/constants/cmdb.ts";
import type { ChangeCiLink } from "core/constants/change.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ErrorAlert from "@/components/ErrorAlert";
import { Database, Link2, Unlink, Search, X } from "lucide-react";

interface Props {
  changeId: number;
  /** Primary CI from the change record itself — shown read-only */
  primaryCi: { id: number; name: string; ciNumber: string } | null;
  /** Additional linked CIs from ciLinks relation */
  linkedCis: ChangeCiLink[];
  readonly?: boolean;
  onChanged: () => void;
}

export default function ChangeCiLinksPanel({
  changeId,
  primaryCi,
  linkedCis,
  readonly = false,
  onChanged,
}: Props) {
  const [search, setSearch]         = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

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

  // IDs already linked (including primary CI — can't add it to ciLinks again)
  const linkedIds = new Set<number>([
    ...(primaryCi ? [primaryCi.id] : []),
    ...linkedCis.map((l) => l.ciId),
  ]);

  const linkMutation = useMutation({
    mutationFn: async (ciId: number) => {
      await axios.post(`/api/changes/${changeId}/ci-links`, { ciId });
    },
    onSuccess: () => {
      onChanged();
      setSearch("");
      setShowSearch(false);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (ciId: number) => {
      await axios.delete(`/api/changes/${changeId}/ci-links/${ciId}`);
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

      {/* Primary CI — read-only */}
      {primaryCi && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Primary CI
          </p>
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Link to={`/cmdb/${primaryCi.id}`} className="font-medium hover:underline truncate">
                {primaryCi.name}
              </Link>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {primaryCi.ciNumber}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Additional affected CIs */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Affected CIs
          </p>
          {!readonly && !showSearch && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setShowSearch(true)}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Link CI
            </Button>
          )}
        </div>

        {linkedCis.length === 0 && !showSearch && (
          <p className="text-xs text-muted-foreground italic py-1">
            No additional CIs linked
          </p>
        )}

        {linkedCis.map(({ ci, id: linkId, ciId }) => (
          <div
            key={linkId}
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
                <span className="text-xs text-muted-foreground">
                  {CI_TYPE_LABEL[ci.type as keyof typeof CI_TYPE_LABEL] ?? ci.type}
                </span>
                <span className={`text-xs font-semibold ${CI_CRITICALITY_COLOR[ci.criticality as keyof typeof CI_CRITICALITY_COLOR] ?? ""}`}>
                  {CI_CRITICALITY_LABEL[ci.criticality as keyof typeof CI_CRITICALITY_LABEL] ?? ci.criticality}
                </span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                  {CI_STATUS_LABEL[ci.status as keyof typeof CI_STATUS_LABEL] ?? ci.status}
                </Badge>
              </div>
            </div>
            {!readonly && (
              <button
                type="button"
                title="Remove CI link"
                onClick={() => unlinkMutation.mutate(ciId)}
                disabled={unlinkMutation.isPending}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {/* Inline CI search */}
        {showSearch && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search CIs…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { setShowSearch(false); setSearch(""); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {isFetching && (
              <p className="text-xs text-muted-foreground px-1">Searching…</p>
            )}

            {searchResults && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No CIs found</p>
            )}

            {searchResults && searchResults.map((ci) => {
              const alreadyLinked = linkedIds.has(ci.id);
              return (
                <button
                  key={ci.id}
                  type="button"
                  disabled={alreadyLinked || linkMutation.isPending}
                  onClick={() => !alreadyLinked && linkMutation.mutate(ci.id)}
                  className={[
                    "w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    alreadyLinked
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-muted/50 cursor-pointer",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{ci.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {ci.ciNumber} · {CI_TYPE_LABEL[ci.type] ?? ci.type}
                    </span>
                  </div>
                  {alreadyLinked && (
                    <span className="text-[10px] text-muted-foreground shrink-0">linked</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
