import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { signOut, useSession } from "../lib/auth-client";
import { useBranding } from "../lib/useBranding";

import {
  Ticket, PlusCircle, LogOut,
  BookOpen, Inbox, ShoppingBag, Menu, X,
  HeadphonesIcon, ChevronDown, User,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/portal/tickets",     label: "My Tickets",     icon: Ticket,      end: true },
  { to: "/portal/new-ticket",  label: "New Ticket",     icon: PlusCircle,  end: true },
  { to: "/portal/requests",    label: "My Requests",    icon: Inbox,       end: true },
  { to: "/portal/new-request", label: "New Request",    icon: PlusCircle,  end: true },
  { to: "/portal/catalog",     label: "Service Catalog",icon: ShoppingBag, end: true },
  { to: "/help",               label: "Help Center",    icon: BookOpen,    end: false },
] as const;

export default function PortalLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { data: branding } = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const logoDataUrl = branding?.logoDataUrl;
  const companyName = branding?.companyName || "Zentra";

  const handleSignOut = async () => {
    await signOut();
    navigate("/portal/login", { replace: true });
  };

  const userName   = session?.user?.name ?? "";
  const userInitial = userName[0]?.toUpperCase() ?? "?";

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

          {/* Brand */}
          <Link to="/portal/tickets" className="flex items-center gap-2.5 shrink-0 group">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt={companyName} className="h-7 w-7 rounded-lg object-contain" />
            ) : (
              <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                <HeadphonesIcon className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="text-[14px] font-bold tracking-tight text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
              {companyName}
              <span className="text-muted-foreground font-normal"> · Support</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition-all duration-150 ${
                    isActive
                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 shrink-0">

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-lg hover:bg-muted/60 transition-all text-sm"
              >
                <div className="h-6 w-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                  {userInitial}
                </div>
                <span className="text-[13px] font-medium text-foreground max-w-[120px] truncate">{userName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border/60 bg-background shadow-lg z-20 overflow-hidden py-1">
                    <div className="px-3 py-2.5 border-b border-border/40">
                      <p className="text-[13px] font-semibold text-foreground truncate">{userName}</p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{session?.user?.email}</p>
                    </div>
                    <Link
                      to="/portal/account"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <User className="h-3.5 w-3.5" />
                      My Account
                    </Link>
                    <div className="border-t border-border/40 mt-1 pt-1">
                      <button
                        onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile burger */}
            <button
              className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/60 bg-background px-4 py-3 space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                    isActive
                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
            <div className="pt-2 border-t border-border/40 mt-2">
              <div className="flex items-center gap-2.5 px-3 py-2">
                <div className="h-7 w-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[11px] font-bold">
                  {userInitial}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">{userName}</p>
                  <p className="text-[11px] text-muted-foreground">{session?.user?.email}</p>
                </div>
              </div>
              <button
                onClick={() => { setMobileOpen(false); handleSignOut(); }}
                className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg text-[13px] font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 bg-background/50">
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-muted-foreground/50">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground/50">
            <Link to="/help" className="hover:text-muted-foreground transition-colors">Help Center</Link>
            <Link to="/portal/catalog" className="hover:text-muted-foreground transition-colors">Service Catalog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
