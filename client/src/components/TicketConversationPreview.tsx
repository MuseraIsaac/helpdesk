/**
 * TicketConversationPreview
 *
 * Shows a floating card near the cursor when hovering a ticket subject cell.
 * Only the SINGLE most-recent activity (reply or internal note) is shown.
 *
 * Implementation:
 *   • Cursor position tracked via onMouseMove → card follows the mouse
 *   • 350 ms delay before revealing to avoid flicker on quick pass-overs
 *   • Rendered into document.body via createPortal so table overflow never
 *     clips the card
 *   • pointerEvents: none on the card so it never intercepts mouse events
 *   • Viewport-aware: flips left/up when near right/bottom edge
 */

import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { MessageCircle, StickyNote, User, Bot, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LastReply {
  body:       string;
  senderType: "agent" | "customer";
  authorName: string | null;
  createdAt:  string;
}

interface LastNote {
  body:       string;
  authorName: string | null;
  createdAt:  string;
}

/**
 * The ticket's original message — the customer's first contact, persisted on
 * the ticket itself rather than as a Reply row. Used as a fallback when the
 * ticket has no replies or notes yet, so brand-new tickets still preview the
 * incoming message instead of nothing.
 */
interface OriginalMessage {
  body:       string;
  senderName: string | null;
  createdAt:  string;
}

interface Props {
  /**
   * Ticket numeric ID. Preview data (last reply + last note) is fetched
   * lazily via /api/tickets/:id/conversation-preview only when the user
   * actually hovers a row. Removes the per-row subselect cost from the
   * list endpoint, which used to dominate ticket-list query time at
   * scale.
   */
  ticketId: number;
  /** Original customer message — shown only when there is no reply or note. */
  original?: OriginalMessage | null;
  children:  ReactNode;
}

interface PreviewResponse {
  lastReply: LastReply | null;
  lastNote:  LastNote  | null;
}

type EntryKind = "reply-customer" | "reply-agent" | "note";

interface Entry {
  kind:       EntryKind;
  authorName: string | null;
  body:       string;
  createdAt:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max = 160): string {
  const clean = stripHtml(text);
  return clean.length <= max ? clean : clean.slice(0, max).trimEnd() + "…";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Card UI ───────────────────────────────────────────────────────────────────

const CARD_W = 288; // px — used for viewport-edge flip logic

function PreviewCard({ entry }: { entry: Entry }) {
  const isCustomer = entry.kind === "reply-customer";
  const isNote     = entry.kind === "note";

  const accentCls = isNote
    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
    : isCustomer
    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
    : "bg-primary/15 text-primary";

  const icon = isNote
    ? <StickyNote className="h-3 w-3" />
    : isCustomer
    ? <User       className="h-3 w-3" />
    : <Bot        className="h-3 w-3" />;

  const typeLabel = isNote ? "Internal note" : isCustomer ? "Customer" : "Agent reply";
  const name      = entry.authorName ?? (isNote ? "Agent" : isCustomer ? "Customer" : "Agent");

  return (
    <div
      className="rounded-xl border bg-popover shadow-xl overflow-hidden"
      style={{ width: CARD_W, pointerEvents: "none" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">
          Last activity
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(entry.createdAt)}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-3 space-y-2">
        {/* Author + type */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${accentCls}`}>
            {icon}
            {typeLabel}
          </span>
          <span className="text-[11px] font-semibold text-foreground truncate">{name}</span>
        </div>

        {/* Message snippet */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {truncate(entry.body)}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TicketConversationPreview({ ticketId, original, children }: Props) {
  const [pos,     setPos]     = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  /** Only true once the user has *intended* to hover (350 ms after enter). */
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-fetch the preview when the user actually hovers. Query is enabled
  // only after the 350 ms hover-intent timer fires so a quick mouse drag
  // across the table doesn't issue a request per row.
  const { data: preview } = useQuery<PreviewResponse>({
    queryKey: ["ticket-preview", ticketId],
    queryFn:  () => axios.get(`/api/tickets/${ticketId}/conversation-preview`).then(r => r.data),
    enabled:  armed,
    staleTime: 60_000,
  });

  const lastReply = preview?.lastReply ?? null;
  const lastNote  = preview?.lastNote  ?? null;

  // Pick only the single most-recent activity
  const replyTime = lastReply ? new Date(lastReply.createdAt).getTime() : 0;
  const noteTime  = lastNote  ? new Date(lastNote.createdAt).getTime()  : 0;

  let entry: Entry | null = null;
  if (replyTime >= noteTime && lastReply) {
    entry = {
      kind:       lastReply.senderType === "customer" ? "reply-customer" : "reply-agent",
      authorName: lastReply.authorName,
      body:       lastReply.body,
      createdAt:  lastReply.createdAt,
    };
  } else if (lastNote) {
    entry = {
      kind:       "note",
      authorName: lastNote.authorName,
      body:       lastNote.body,
      createdAt:  lastNote.createdAt,
    };
  } else if (original && original.body) {
    // No replies or notes yet — fall back to the customer's original message
    // so freshly created tickets still preview *something* useful on hover.
    entry = {
      kind:       "reply-customer",
      authorName: original.senderName,
      body:       original.body,
      createdAt:  original.createdAt,
    };
  }

  // If we have no original body and no fetched data yet, we still need to
  // wrap the children so the hover handler can fire and arm the fetch.
  // The popover renders only when an entry resolves.

  function handleMouseEnter(e: React.MouseEvent) {
    updatePos(e);
    // Arm the lazy preview fetch immediately so the data is ready by the
    // time the 350 ms intent-delay fires.
    if (!armed) setArmed(true);
    timerRef.current = setTimeout(() => setVisible(true), 350);
  }

  function handleMouseMove(e: React.MouseEvent) {
    updatePos(e);
  }

  function handleMouseLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  function updatePos(e: React.MouseEvent) {
    const offset = 18;
    const cardH  = 140; // approximate height for bottom-edge detection

    let x = e.clientX + offset;
    let y = e.clientY + offset;

    // Flip left if card would overflow the right edge
    if (x + CARD_W > window.innerWidth - 8) {
      x = e.clientX - CARD_W - offset;
    }
    // Flip up if card would overflow the bottom edge
    if (y + cardH > window.innerHeight - 8) {
      y = e.clientY - cardH - offset;
    }

    setPos({ x, y });
  }

  return (
    <>
      <span
        style={{ display: "contents" }}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>

      {visible && entry && createPortal(
        <div
          style={{
            position:   "fixed",
            left:       pos.x,
            top:        pos.y,
            zIndex:     9999,
            pointerEvents: "none",
            // Subtle entrance animation
            animation: "ccPreviewIn 120ms ease-out",
          }}
        >
          <PreviewCard entry={entry} />
        </div>,
        document.body,
      )}

      {/* Keyframe injected once — minimal, no external dep */}
      <style>{`
        @keyframes ccPreviewIn {
          from { opacity: 0; transform: translateY(4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>
    </>
  );
}
