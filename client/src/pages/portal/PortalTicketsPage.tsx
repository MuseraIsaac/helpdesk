import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import axios from "axios";
import {
  PlusCircle, Ticket, ChevronRight, Clock, CheckCircle2, CircleDot,
  RefreshCw, Headphones, ShoppingBag, BookOpen, ArrowRight,
  MessageSquarePlus, Package, Sparkles, Globe, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ErrorAlert";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortalTicket {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string; dot: string }> = {
  new:        { label: "Received",     icon: Clock,        classes: "bg-slate-100  text-slate-600  dark:bg-slate-800/60 dark:text-slate-400",  dot: "bg-slate-400" },
  processing: { label: "Under Review", icon: RefreshCw,    classes: "bg-blue-50    text-blue-700   dark:bg-blue-900/40  dark:text-blue-400",   dot: "bg-blue-400" },
  open:       { label: "Open",         icon: CircleDot,    classes: "bg-amber-50   text-amber-700  dark:bg-amber-900/30 dark:text-amber-400",  dot: "bg-amber-400" },
  resolved:   { label: "Resolved",     icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-500" },
  closed:     { label: "Closed",       icon: CheckCircle2, classes: "bg-muted      text-muted-foreground", dot: "bg-muted-foreground/40" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0 ${cfg.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function rel(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return fmt(iso);
}

// ── Quick action card ─────────────────────────────────────────────────────────

function QuickAction({
  icon: Icon, label, description, to, accent,
}: {
  icon: React.ElementType; label: string; description: string; to: string; accent: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col gap-3 rounded-2xl border border-border/60 bg-background p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${accent}08 0%, transparent 60%)` }}
      />
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110"
        style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
      >
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div>
        <p className="font-bold text-sm text-foreground leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      <ArrowRight
        className="h-4 w-4 absolute bottom-4 right-4 text-muted-foreground/30 group-hover:text-foreground/50 group-hover:translate-x-0.5 transition-all"
      />
    </Link>
  );
}

// ── Ticket row ────────────────────────────────────────────────────────────────

function TicketRow({ ticket }: { ticket: PortalTicket }) {
  return (
    <Link
      to={`/portal/tickets/${ticket.id}`}
      className="group flex items-center gap-4 rounded-xl border border-border/60 bg-background px-5 py-4 hover:border-emerald-200 hover:bg-emerald-50/30 dark:hover:border-emerald-800/40 dark:hover:bg-emerald-950/10 transition-all duration-150 shadow-sm hover:shadow-md"
    >
      <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 transition-colors">
        <Ticket className="h-4 w-4 text-muted-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">{ticket.ticketNumber}</span>
          {ticket.category && (
            <span className="text-[10px] text-muted-foreground/50 border border-border/40 rounded px-1.5 py-0.5">{ticket.category}</span>
          )}
        </div>
        <p className="font-semibold text-sm text-foreground truncate">{ticket.subject}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Submitted {fmt(ticket.createdAt)}
          {ticket.updatedAt !== ticket.createdAt && <> · Updated <span className="text-foreground/60">{rel(ticket.updatedAt)}</span></>}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill status={ticket.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortalTicketsPage() {
  const { data: session } = useSession();
  const { data: branding } = useBranding();
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-tickets"],
    queryFn: async () => {
      const { data } = await axios.get<{ tickets: PortalTicket[] }>("/api/portal/tickets");
      return data;
    },
  });

  const tickets   = data?.tickets ?? [];
  const active    = tickets.filter(t => ["new", "processing", "open"].includes(t.status));
  const resolved  = tickets.filter(t => ["resolved", "closed"].includes(t.status));
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="space-y-8">

      {/* ── Hero greeting ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-emerald-500/[0.04] px-7 py-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 bottom-0 h-36 w-36 rounded-full bg-teal-400/8 blur-2xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shrink-0"
              style={{ boxShadow: "0 4px 16px rgba(5,150,105,0.3)" }}>
              <Headphones className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">
                {greeting}, {firstName}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isLoading
                  ? "Loading your support overview…"
                  : active.length > 0
                    ? `You have ${active.length} active request${active.length > 1 ? "s" : ""} — we're on it.`
                    : tickets.length > 0
                      ? "All your requests are resolved. Great!"
                      : "Welcome! How can we help you today?"}
              </p>
            </div>
          </div>

          {/* Stat pills */}
          {!isLoading && tickets.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {active.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800/40 dark:bg-amber-950/30">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {active.length} active
                  </span>
                </div>
              )}
              {resolved.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 dark:border-emerald-800/40 dark:bg-emerald-950/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {resolved.length} resolved
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">Quick actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction icon={MessageSquarePlus} label="New Support Ticket"    description="Report an issue or ask for help"         to="/portal/new-ticket"  accent="#059669" />
          <QuickAction icon={Package}           label="Browse Service Catalog" description="Request IT services and resources"      to="/portal/catalog"     accent="#6366f1" />
          <QuickAction icon={Ticket}            label="My Requests"           description="Track all your submitted requests"       to="/portal/requests"    accent="#f59e0b" />
          <QuickAction icon={BookOpen}          label="Help Center"           description="Find answers in our knowledge base"     to="/help"               accent="#3b82f6" />
        </div>
      </div>

      {/* ── Company website link ── */}
      {branding?.companyWebsite && (
        <a
          href={branding.companyWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex items-center gap-4 rounded-2xl border border-border/60 bg-background px-5 py-4 hover:border-primary/30 hover:shadow-md transition-all duration-200 overflow-hidden"
        >
          {/* Subtle gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl" />

          {/* Icon */}
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/8 shadow-sm group-hover:scale-105 transition-transform duration-200">
            <Globe className="h-5 w-5 text-primary" />
          </div>

          {/* Text */}
          <div className="relative flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground leading-tight">
              {branding.companyName ? `${branding.companyName} Website` : "Company Website"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {branding.companyWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </p>
          </div>

          {/* External link badge */}
          <div className="relative flex items-center gap-1.5 shrink-0 rounded-lg border border-border/60 bg-muted/50 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground group-hover:border-primary/30 group-hover:text-primary group-hover:bg-primary/5 transition-all duration-200">
            <ExternalLink className="h-3 w-3" />
            Visit
          </div>
        </a>
      )}

      {/* ── Tickets section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">My Tickets</p>
          {tickets.length > 0 && (
            <Button asChild size="sm" className="h-7 gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white">
              <Link to="/portal/new-ticket">
                <PlusCircle className="h-3.5 w-3.5" />
                New Ticket
              </Link>
            </Button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-background p-4 flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-60" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {error && <ErrorAlert error={error} fallback="Failed to load your tickets" />}

        {/* Empty */}
        {!isLoading && !error && tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-border/60 bg-background">
            <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="font-semibold text-foreground">No tickets yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs leading-snug">
              Submit your first support ticket and our team will get back to you quickly.
            </p>
            <Button asChild className="mt-5 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
              style={{ boxShadow: "0 2px 8px rgba(5,150,105,0.3)" }}>
              <Link to="/portal/new-ticket">
                <PlusCircle className="h-4 w-4" />
                Submit a ticket
              </Link>
            </Button>
          </div>
        )}

        {/* Active tickets */}
        {!isLoading && active.length > 0 && (
          <div className="space-y-2.5 mb-4">
            {active.map(t => <TicketRow key={t.id} ticket={t} />)}
          </div>
        )}

        {/* Resolved/closed collapsible */}
        {!isLoading && resolved.length > 0 && (
          <div className="space-y-2.5">
            {active.length > 0 && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pt-1 px-1">
                Resolved
              </p>
            )}
            {resolved.map(t => <TicketRow key={t.id} ticket={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}
