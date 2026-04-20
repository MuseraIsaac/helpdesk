/**
 * IncidentPresenceIndicator — blinking eye button shown in the incident header
 * when one or more other agents are viewing the same incident.
 *
 * Hover / click to reveal a popover listing their names.
 */

import { useState } from "react";
import { Eye } from "lucide-react";
import type { IncidentViewer } from "@/hooks/useIncidentPresence";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

interface IncidentPresenceIndicatorProps {
  viewers: IncidentViewer[];
  currentUserId: string;
}

export default function IncidentPresenceIndicator({
  viewers,
  currentUserId,
}: IncidentPresenceIndicatorProps) {
  const [open, setOpen] = useState(false);

  const others = viewers.filter((v) => v.userId !== currentUserId);
  if (others.length === 0) return null;

  const label =
    others.length === 1
      ? `${others[0].userName} is also viewing`
      : `${others.length} others are viewing`;

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        className="relative flex items-center justify-center h-8 w-8 rounded-full hover:bg-white/10 transition-colors focus:outline-none"
      >
        {/* Eye icon — pulses while others are present */}
        <Eye className="h-[18px] w-[18px] text-emerald-400 animate-pulse" />

        {/* Blinking live dot (top-right corner of the button) */}
        <span className="absolute top-0.5 right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover shadow-xl z-50 p-3 space-y-2"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 pb-1 border-b border-border/50">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {others.length === 1 ? "1 person viewing" : `${others.length} people viewing`}
            </p>
          </div>

          {/* Viewer list */}
          <div className="space-y-1.5">
            {others.map((v) => (
              <div key={v.userId} className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {initials(v.userName)}
                </div>
                <span className="text-sm leading-none truncate">{v.userName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
