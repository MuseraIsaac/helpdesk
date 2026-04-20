import { useState } from "react";
import { Eye, PenLine } from "lucide-react";
import type { PresenceViewer } from "@/hooks/usePresence";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

interface AvatarListProps {
  users: PresenceViewer[];
  colorClass: string;
}

function AvatarList({ users, colorClass }: AvatarListProps) {
  return (
    <div className="space-y-1.5">
      {users.map((v) => (
        <div key={v.userId} className="flex items-center gap-2">
          <div
            className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${colorClass}`}
          >
            {initials(v.userName)}
          </div>
          <span className="text-sm leading-none">{v.userName}</span>
        </div>
      ))}
    </div>
  );
}

interface PopoverProps {
  children: React.ReactNode;
  open: boolean;
}

function Popover({ children, open }: PopoverProps) {
  if (!open) return null;
  return (
    <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-popover shadow-lg z-50 p-3 space-y-2">
      {children}
    </div>
  );
}

interface PresenceIndicatorProps {
  viewers: PresenceViewer[];
  currentUserId: string;
}

export default function PresenceIndicator({ viewers, currentUserId }: PresenceIndicatorProps) {
  const [eyeOpen, setEyeOpen] = useState(false);
  const [penOpen, setPenOpen] = useState(false);

  const others = viewers.filter((v) => v.userId !== currentUserId);
  const viewing = others; // everyone else who is viewing
  const composing = others.filter((v) => v.composing);

  if (others.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {/* ── Eye indicator: others are viewing ── */}
      <div className="relative">
        <button
          type="button"
          onMouseEnter={() => setEyeOpen(true)}
          onMouseLeave={() => setEyeOpen(false)}
          onClick={() => setEyeOpen((v) => !v)}
          className="relative flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted transition-colors focus:outline-none"
          title={`${viewing.length} other${viewing.length !== 1 ? "s" : ""} viewing`}
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
          {/* Pulsing green dot */}
          <span className="absolute top-0.5 right-0.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </span>
        </button>

        <Popover open={eyeOpen}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Also viewing
          </p>
          <AvatarList users={viewing} colorClass="bg-emerald-500/15 text-emerald-700" />
        </Popover>
      </div>

      {/* ── Pen indicator: others are composing ── */}
      {composing.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onMouseEnter={() => setPenOpen(true)}
            onMouseLeave={() => setPenOpen(false)}
            onClick={() => setPenOpen((v) => !v)}
            className="relative flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted transition-colors focus:outline-none"
            title={`${composing.length} ${composing.length !== 1 ? "people" : "person"} composing`}
          >
            <PenLine className="h-4 w-4 text-blue-500 animate-pulse" />
            {/* Pulsing blue dot */}
            <span className="absolute top-0.5 right-0.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
              </span>
            </span>
          </button>

          <Popover open={penOpen}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Composing a reply
            </p>
            <AvatarList users={composing} colorClass="bg-blue-500/15 text-blue-700" />
          </Popover>
        </div>
      )}
    </div>
  );
}
