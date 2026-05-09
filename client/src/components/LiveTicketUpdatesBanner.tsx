/**
 * LiveTicketUpdatesBanner
 *
 * Floating "new tickets / new updates" pill shown on the Tickets list page.
 *
 * The SSE subscription itself lives one level up in `Layout` via
 * `TicketListLiveCountsProvider` — that way the EventSource stays open
 * across route changes and the counters survive navigation. This component
 * is a thin consumer: it reads the counts, decides whether to render, and
 * exposes a Refresh button that invalidates the active ticket queries
 * and zeroes the counters.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { useTicketListLiveCounts } from "@/hooks/useTicketListLiveCounts";

export default function LiveTicketUpdatesBanner() {
  const { pathname } = useLocation();
  const { created, updated, reset } = useTicketListLiveCounts();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  // Re-show the banner whenever new events arrive after a dismiss.
  useEffect(() => {
    if (created + updated > 0) setDismissed(false);
  }, [created, updated]);

  // Only render on the Tickets list page (and any nested filter URLs).
  // The Provider stays mounted everywhere; this component just hides itself
  // when the route doesn't match.
  if (pathname !== "/tickets" && pathname !== "/tickets/") return null;

  const total = created + updated;
  if (total === 0 || dismissed) return null;

  function refreshNow() {
    void queryClient.invalidateQueries({ queryKey: ["tickets"], refetchType: "active" });
    reset();
    setDismissed(false);
  }

  // Compose the label
  let label: string;
  if (created > 0 && updated > 0) {
    label = `${created} new ticket${created === 1 ? "" : "s"} · ${updated} update${updated === 1 ? "" : "s"}`;
  } else if (created > 0) {
    label = `${created} new ticket${created === 1 ? "" : "s"}`;
  } else {
    label = `${updated} update${updated === 1 ? "" : "s"}`;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-50 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto group relative flex items-center gap-2.5 rounded-full border border-primary/30 bg-background/95 backdrop-blur-md pl-3 pr-1.5 py-1.5 shadow-lg shadow-primary/10 transition-all hover:shadow-primary/20"
      >
        {/* Animated dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>

        {/* Label */}
        <span className="text-[12.5px] font-medium tracking-tight whitespace-nowrap">
          {label}
        </span>

        {/* Refresh button */}
        <button
          type="button"
          onClick={refreshNow}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>

        {/* Dismiss */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>

        {/* Decorative sparkle */}
        <Sparkles className="pointer-events-none absolute -left-2 -top-2 h-3.5 w-3.5 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}
