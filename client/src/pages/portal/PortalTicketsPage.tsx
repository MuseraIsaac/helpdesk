import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { useBranding } from "@/lib/useBranding";
import axios from "axios";
import {
  PlusCircle, Ticket, ChevronRight, Clock, CheckCircle2, CircleDot,
  RefreshCw, BookOpen, ArrowRight,
  MessageSquarePlus, Package, Sparkles, Globe, ExternalLink,
  Mail, Phone, MapPin, AlertOctagon, ShieldCheck, ArrowUpRight,
  Inbox, TrendingUp, LifeBuoy,
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

// ── Stat tile (KPI card) ──────────────────────────────────────────────────────

function StatTile({
  label, value, icon: Icon, accent, sublabel,
}: {
  label: string; value: string | number; icon: React.ElementType; accent: string; sublabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <div
        className="absolute right-0 top-0 h-20 w-20 rounded-bl-full opacity-10 pointer-events-none"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</p>
          <p className="mt-1.5 text-3xl font-black tracking-tight tabular-nums leading-none">{value}</p>
          {sublabel && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{sublabel}</p>
          )}
        </div>
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
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

// ── Service desk contacts panel ───────────────────────────────────────────────

function ContactRow({
  icon: Icon, label, value, href,
}: {
  icon: React.ElementType; label: string; value: string; href?: string;
}) {
  const inner = (
    <>
      <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 transition-colors">
        <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
      {href && (
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-emerald-600 transition-colors shrink-0" />
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className="group flex items-center gap-3 rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-muted/40 transition-colors"
      >
        {inner}
      </a>
    );
  }
  return <div className="group flex items-center gap-3 px-2.5 py-2 -mx-2.5">{inner}</div>;
}

function ServiceDeskContacts({
  email, phone, hours, emergency, location, companyName,
}: {
  email?: string; phone?: string; hours?: string; emergency?: string; location?: string; companyName?: string;
}) {
  const hasAny = email || phone || hours || emergency || location;
  if (!hasAny) return null;

  // Build the right href for emergency contact (email vs phone vs free text)
  const emergencyHref = emergency
    ? emergency.includes("@")  ? `mailto:${emergency}`
    : /[+\d]/.test(emergency)  ? `tel:${emergency.replace(/[^+\d]/g, "")}`
                               : undefined
    : undefined;

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-emerald-500/[0.03] p-5 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <LifeBuoy className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Service Desk</h2>
            <p className="text-[11px] text-muted-foreground">Reach our support team</p>
          </div>
        </div>
        {hours && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        )}
      </header>

      <div className="space-y-0.5">
        {email && (
          <ContactRow icon={Mail} label="Email" value={email} href={`mailto:${email}`} />
        )}
        {phone && (
          <ContactRow icon={Phone} label="Phone" value={phone} href={`tel:${phone.replace(/[^+\d]/g, "")}`} />
        )}
        {hours && (
          <ContactRow icon={Clock} label="Hours" value={hours} />
        )}
        {location && (
          <ContactRow icon={MapPin} label="Location" value={location} />
        )}
      </div>

      {emergency && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <a
            href={emergencyHref}
            target={emergencyHref?.startsWith("http") ? "_blank" : undefined}
            rel={emergencyHref?.startsWith("http") ? "noopener noreferrer" : undefined}
            className="group flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20 px-3 py-2.5 hover:bg-red-100/60 dark:hover:bg-red-950/40 transition-colors"
          >
            <div className="h-8 w-8 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
              <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-400">After-hours / Emergency</p>
              <p className="text-sm font-semibold text-red-900 dark:text-red-300 truncate">{emergency}</p>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-red-600/50 group-hover:text-red-700 transition-colors shrink-0" />
          </a>
        </div>
      )}

      {companyName && (
        <p className="text-[10px] text-muted-foreground/60 mt-4 pt-3 border-t border-border/40 text-center">
          {companyName} · Service Desk
        </p>
      )}
    </section>
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
  const inProgress = tickets.filter(t => t.status === "processing" || t.status === "open").length;
  const awaiting   = tickets.filter(t => t.status === "new").length;
  const resolved  = tickets.filter(t => ["resolved", "closed"].includes(t.status));
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  // "Resolved this month" — gives the user a sense of throughput
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const resolvedThisMonth = resolved.filter(
    (t) => new Date(t.updatedAt) >= startOfMonth
  ).length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const orgName = branding?.companyName || "the team";

  return (
    <div className="space-y-6">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-emerald-50 via-background to-teal-50/30 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/10 px-7 py-7 shadow-sm">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-44 w-44 rounded-full bg-teal-400/10 blur-2xl" />

        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* Greeting */}
          <div className="lg:col-span-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/80 dark:bg-emerald-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-3">
              <ShieldCheck className="h-3 w-3" />
              Self-service support portal
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-tight">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">
              {isLoading
                ? "Loading your support overview…"
                : active.length > 0
                  ? `You have ${active.length} active request${active.length > 1 ? "s" : ""} with ${orgName}. Track progress, send replies, or open a new ticket below.`
                  : tickets.length > 0
                    ? `All your requests are wrapped up. ${orgName} is here whenever you need us again.`
                    : `Welcome to the support portal. Submit a ticket, browse our service catalog, or search the help center to get started.`}
            </p>

            {/* Primary CTAs */}
            <div className="flex flex-wrap items-center gap-2 mt-5">
              <Button asChild size="sm" className="h-9 gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm">
                <Link to="/portal/new-ticket">
                  <PlusCircle className="h-4 w-4" />
                  New Support Ticket
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
                <Link to="/portal/catalog">
                  <Package className="h-4 w-4" />
                  Service Catalog
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-9 gap-1.5">
                <Link to="/help">
                  <BookOpen className="h-4 w-4" />
                  Help Center
                </Link>
              </Button>
            </div>
          </div>

          {/* Logo / brand mark */}
          <div className="hidden lg:flex items-center justify-end">
            {branding?.logoDataUrl && (
              <div className="relative">
                <div className="absolute inset-0 rounded-3xl bg-emerald-400/20 blur-2xl" />
                <div className="relative h-24 w-24 rounded-3xl bg-background border border-border/60 flex items-center justify-center shadow-lg overflow-hidden">
                  <img
                    src={branding.logoDataUrl}
                    alt={branding.companyName || "Logo"}
                    className="h-16 w-16 object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Active"
            value={active.length}
            icon={Inbox}
            accent="#f59e0b"
            sublabel={active.length === 0 ? "No open requests" : `${awaiting} new · ${inProgress} in progress`}
          />
          <StatTile
            label="Resolved this month"
            value={resolvedThisMonth}
            icon={CheckCircle2}
            accent="#10b981"
            sublabel={resolvedThisMonth > 0 ? "Closed in current month" : "Nothing closed yet this month"}
          />
          <StatTile
            label="Total submitted"
            value={tickets.length}
            icon={Ticket}
            accent="#6366f1"
            sublabel="Across all time"
          />
          <StatTile
            label="Resolution rate"
            value={tickets.length > 0 ? `${Math.round((resolved.length / tickets.length) * 100)}%` : "—"}
            icon={TrendingUp}
            accent="#06b6d4"
            sublabel={tickets.length > 0 ? `${resolved.length} of ${tickets.length} resolved` : "Submit a ticket to start"}
          />
        </div>
      )}

      {/* ── Two-column: tickets (left) + service desk + website (right) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT: tickets + quick actions ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Quick actions */}
          <section>
            <header className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">Quick actions</p>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickAction icon={MessageSquarePlus} label="New Support Ticket"    description="Report an issue or ask for help"        to="/portal/new-ticket"  accent="#059669" />
              <QuickAction icon={Package}           label="Browse Service Catalog" description="Request IT services and resources"     to="/portal/catalog"     accent="#6366f1" />
              <QuickAction icon={Ticket}            label="My Requests"           description="Track all your submitted requests"      to="/portal/requests"    accent="#f59e0b" />
              <QuickAction icon={BookOpen}          label="Help Center"           description="Find answers in our knowledge base"    to="/help"               accent="#3b82f6" />
            </div>
          </section>

          {/* Tickets section */}
          <section>
            <header className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">My Tickets</p>
              {tickets.length > 0 && (
                <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Link to="/portal/requests">
                    View all
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </header>

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
              <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-dashed border-border/60 bg-background">
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

            {/* Resolved/closed */}
            {!isLoading && resolved.length > 0 && (
              <div className="space-y-2.5">
                {active.length > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pt-1 px-1">
                    Recently resolved
                  </p>
                )}
                {resolved.slice(0, 5).map(t => <TicketRow key={t.id} ticket={t} />)}
                {resolved.length > 5 && (
                  <Button asChild variant="ghost" size="sm" className="w-full h-8 text-xs text-muted-foreground">
                    <Link to="/portal/requests">
                      Show {resolved.length - 5} more resolved tickets
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT sidebar: service desk + website ── */}
        <aside className="space-y-4">
          <ServiceDeskContacts
            email={branding?.serviceDeskEmail}
            phone={branding?.serviceDeskPhone}
            hours={branding?.serviceDeskHours}
            emergency={branding?.emergencyContact}
            location={branding?.serviceDeskLocation}
            companyName={branding?.companyName}
          />

          {/* Company website link */}
          {branding?.companyWebsite && (
            <a
              href={branding.companyWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4 hover:border-primary/30 hover:shadow-md transition-all duration-200"
            >
              <div className="h-9 w-9 rounded-xl border border-primary/20 bg-primary/8 flex items-center justify-center shrink-0">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Company</p>
                <p className="text-sm font-semibold truncate">
                  {branding.companyName ? `${branding.companyName} Website` : "Visit website"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {branding.companyWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
            </a>
          )}

          {/* Help & resources */}
          <section className="rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight">Help & resources</h2>
                <p className="text-[11px] text-muted-foreground">Self-service guides and FAQs</p>
              </div>
            </div>
            <div className="space-y-1">
              <Link
                to="/help"
                className="group flex items-center justify-between rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm font-medium">Browse knowledge base</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/70 group-hover:translate-x-0.5 transition-all" />
              </Link>
              <Link
                to="/portal/catalog"
                className="group flex items-center justify-between rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm font-medium">Request a service</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/70 group-hover:translate-x-0.5 transition-all" />
              </Link>
              <Link
                to="/portal/account"
                className="group flex items-center justify-between rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm font-medium">Manage your account</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground/70 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
