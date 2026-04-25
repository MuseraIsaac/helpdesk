import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { signOut, useSession } from "../lib/auth-client";
import { useBranding } from "../lib/useBranding";
import { portalAccentVars } from "../lib/portalColor";
import { useTheme } from "../lib/theme";
import {
  BookOpen, Ticket, PlusCircle, Inbox, ShoppingBag,
  Search, Sun, Moon, LogOut, Menu, X,
  ChevronDown, HeadphonesIcon, Globe, Zap,
} from "lucide-react";

const PORTAL_LINKS = [
  { to: "/portal/tickets",     label: "My Tickets",      icon: Ticket,      end: true },
  { to: "/portal/new-ticket",  label: "New Ticket",      icon: PlusCircle,  end: true },
  { to: "/portal/requests",    label: "My Requests",     icon: Inbox,       end: true },
  { to: "/portal/catalog",     label: "Service Catalog", icon: ShoppingBag, end: true },
  { to: "/help",               label: "Help Center",     icon: BookOpen,    end: true },
] as const;

export default function HelpLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { data: branding } = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const logoDataUrl    = branding?.logoDataUrl;
  const companyName    = branding?.companyName    || "Zentra";
  const companyWebsite = branding?.companyWebsite || "";
  const accentVars     = portalAccentVars(branding?.portalAccentColor);
  const isLoggedIn  = !!session;
  const userName    = session?.user?.name ?? "";
  const userInitial = userName[0]?.toUpperCase() ?? "?";

  const handleSignOut = async () => {
    await signOut();
    navigate("/portal/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" style={accentVars}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/60 shadow-sm">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">

          {/* Brand */}
          <Link to="/help" className="flex items-center gap-2.5 shrink-0 group mr-2">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt={companyName} className="h-7 w-7 rounded-lg object-contain" />
            ) : (
              <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--pa)" }}>
                <BookOpen className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="text-[14px] font-bold tracking-tight text-foreground transition-colors" style={{ "--hover-color": "var(--pa)" } as React.CSSProperties}>
              {companyName}
              <span className="text-muted-foreground font-normal"> · Help Center</span>
            </span>
          </Link>

          {/* Desktop nav — only show portal links if logged in */}
          {isLoggedIn && (
            <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
              {PORTAL_LINKS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-all duration-150 ${
                      isActive
                        ? "font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`
                  }
                  style={({ isActive }) =>
                    isActive
                      ? { color: "var(--pa)", backgroundColor: "var(--pa-10)" }
                      : undefined
                  }
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </nav>
          )}

          {/* Guest nav */}
          {!isLoggedIn && (
            <nav className="hidden md:flex items-center gap-1 ml-auto">
              <Link
                to="/portal/login"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              >
                <HeadphonesIcon className="h-3.5 w-3.5" />
                Sign in to portal
              </Link>
              <Link
                to="/portal/new-ticket"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-white transition-colors ml-1"
                style={{ backgroundColor: "var(--pa)" }}
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Submit a request
              </Link>
            </nav>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Search link */}
            <Link
              to="/help"
              className="hidden sm:flex h-8 w-8 rounded-lg items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Link>

            {/* Logged-in user menu */}
            {isLoggedIn && (
              <div className="relative hidden md:block">
                <button
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 h-8 px-2.5 rounded-lg hover:bg-muted/60 transition-all"
                >
                  <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ backgroundColor: "var(--pa)" }}>
                    {userInitial}
                  </div>
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
                        to="/portal/tickets"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <Ticket className="h-3.5 w-3.5" />
                        My Tickets
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
            )}

            {/* Mobile burger */}
            <button
              className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/60 bg-background px-4 py-3 space-y-1">
            {isLoggedIn
              ? PORTAL_LINKS.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                        isActive ? "font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`
                    }
                    style={({ isActive }) =>
                      isActive ? { color: "var(--pa)", backgroundColor: "var(--pa-10)" } : undefined
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </NavLink>
                ))
              : (
                <>
                  <Link to="/portal/login" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50">
                    <HeadphonesIcon className="h-4 w-4" /> Sign in to portal
                  </Link>
                  <Link to="/portal/new-ticket" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold hover:bg-muted/40 transition-colors"
                    style={{ color: "var(--pa)" }}>
                    <PlusCircle className="h-4 w-4" /> Submit a request
                  </Link>
                </>
              )
            }
            {isLoggedIn && (
              <div className="pt-2 border-t border-border/40 mt-2">
                <button
                  onClick={() => { setMobileOpen(false); handleSignOut(); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg text-[13px] font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/5"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Page content ──────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[900px] w-full mx-auto px-4 sm:px-6 py-10">
        <Outlet />
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 bg-background/60 backdrop-blur-sm">

        {/* Top row: copyright + nav links */}
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-muted-foreground/50">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground/50">
            {isLoggedIn && (
              <Link to="/portal/tickets" className="hover:text-muted-foreground transition-colors">
                My Tickets
              </Link>
            )}
            <Link to="/portal/new-ticket" className="hover:text-muted-foreground transition-colors">
              Submit a Request
            </Link>
            <Link to="/portal/catalog" className="hover:text-muted-foreground transition-colors">
              Service Catalog
            </Link>
            {companyWebsite && (
              <a
                href={companyWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-muted-foreground transition-colors"
              >
                <Globe className="h-3 w-3" />
                {companyName} Website
              </a>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="max-w-[900px] mx-auto px-4 sm:px-6">
          <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
        </div>

        {/* Bottom row: "Powered by Zentra ITSM" badge */}
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-center">
          <div className="group inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-3.5 py-1.5 transition-all duration-200 hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-sm cursor-default">
            {/* Icon pill */}
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/15 transition-colors">
              <Zap className="h-2.5 w-2.5 text-primary/70 group-hover:text-primary transition-colors" />
            </span>

            <span className="text-[10px] font-medium text-muted-foreground/50 tracking-wide group-hover:text-muted-foreground/70 transition-colors">
              Powered by
            </span>

            <span className="flex items-center gap-1">
              {/* Zentra wordmark */}
              <span className="text-[10px] font-black tracking-tight text-foreground/40 group-hover:text-foreground/60 transition-colors">
                Zentra
              </span>
              <span className="text-[10px] font-medium text-primary/50 group-hover:text-primary/70 transition-colors tracking-tight">
                ITSM
              </span>
            </span>
          </div>
        </div>

      </footer>
    </div>
  );
}
