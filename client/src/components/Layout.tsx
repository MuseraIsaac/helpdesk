import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import {
  NAV_SECTIONS,
  isNavItemVisible,
  isNavSectionVisible,
  resolveModuleBreadcrumb,
  type NavItem,
  type NavSection,
} from "../lib/nav-config";
import { signOut, useSession } from "../lib/auth-client";
import { useBranding } from "../lib/useBranding";
import ProfileMenu from "./ProfileMenu";
import NotificationBell from "./NotificationBell";
import GlobalSearch from "./GlobalSearch";
import { Settings, ChevronLeft, ChevronRight, Menu, X, Search, LogOut } from "lucide-react";

// ── Sidebar collapse — persisted to localStorage ──────────────────────────────

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  return { collapsed, toggle };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join("");
}

function roleLabel(role: string) {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
}

// ── Badge pill ────────────────────────────────────────────────────────────────

function NavBadgePill({ badge }: { badge: NonNullable<NavItem["badge"]> }) {
  return (
    <span className={[
      "ml-auto text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full",
      badge === "beta"
        ? "bg-sidebar-primary/20 text-sidebar-primary"
        : "bg-emerald-500/20 text-emerald-500 dark:text-emerald-400",
    ].join(" ")}>
      {badge}
    </span>
  );
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function SidebarNavItem({ item, collapsed, onClick }: { item: NavItem; collapsed: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => [
        "group relative flex items-center rounded-lg text-[13px] font-medium transition-all duration-150",
        collapsed ? "justify-center p-2.5 mx-0.5" : "gap-3 px-3 py-2",
        isActive
          ? "bg-sidebar-primary/[0.13] text-sidebar-primary font-semibold"
          : "text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent",
      ].join(" ")}
    >
      {({ isActive }) => (
        <>
          {/* Active left-edge bar — glows in dark mode via CSS utility */}
          {isActive && !collapsed && (
            <span className="sidebar-active-bar" />
          )}
          {/* Collapsed: dot indicator on right edge */}
          {isActive && collapsed && (
            <span
              className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-l-full bg-sidebar-primary"
              style={{ boxShadow: "0 0 8px var(--sidebar-glow)" }}
            />
          )}

          <span className={[
            "shrink-0 flex items-center justify-center h-[18px] w-[18px] transition-colors",
            isActive
              ? "text-sidebar-primary"
              : "text-sidebar-foreground/45 group-hover:text-sidebar-accent-foreground",
          ].join(" ")}>
            <Icon className="h-[18px] w-[18px]" />
          </span>

          {!collapsed && (
            <>
              <span className="truncate flex-1">{item.label}</span>
              {item.badge && <NavBadgePill badge={item.badge} />}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/30 select-none">
      {label}
    </p>
  );
}

// ── Sidebar content ───────────────────────────────────────────────────────────

interface SidebarContentProps {
  collapsed: boolean;
  role: string;
  name: string;
  email: string;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onSignOut: () => void;
}

function SidebarContent({ collapsed, role, name, email, onToggleCollapse, onClose, onSignOut }: SidebarContentProps) {
  const initials = getInitials(name);
  const { data: branding } = useBranding();
  const logoDataUrl = branding?.logoDataUrl;

  const orbStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--sidebar-primary) 0%, var(--sidebar-ring) 100%)",
    boxShadow: "0 0 18px var(--sidebar-glow), 0 2px 8px rgb(0 0 0 / 0.25)",
  };

  const avatarStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--sidebar-primary) 0%, var(--sidebar-ring) 100%)",
    boxShadow: "0 0 14px var(--sidebar-glow), 0 2px 6px rgb(0 0 0 / 0.20)",
  };

  return (
    <div className="sidebar-surface flex flex-col h-full select-none border-r border-sidebar-border">

      {/* ── Wordmark ── */}
      <div className={[
        "h-14 flex items-center shrink-0 border-b border-sidebar-border",
        collapsed ? "justify-center px-2" : "px-4",
      ].join(" ")}>
        <Link to="/" onClick={onClose} className="flex items-center gap-2.5 min-w-0 group">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Logo"
              className="h-7 w-7 rounded-lg object-contain shrink-0 ring-1 ring-sidebar-border" />
          ) : (
            <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={orbStyle}>
              <span className="text-white font-bold text-[11px] tracking-tight">Z</span>
            </div>
          )}

          {!collapsed && (
            <div className="min-w-0 leading-none">
              <span className="text-[14px] font-semibold tracking-tight text-sidebar-foreground truncate block group-hover:text-sidebar-primary transition-colors duration-150">
                Zentra
              </span>
              <span className="text-[10px] text-sidebar-foreground/30 mt-0.5 block">ITSM Platform</span>
            </div>
          )}
        </Link>

        {!collapsed && onClose && (
          <button onClick={onClose} aria-label="Close sidebar"
            className="ml-auto p-1.5 rounded-md text-sidebar-foreground/40 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 min-h-0 sidebar-scrollbar">
        {NAV_SECTIONS.filter((s) => isNavSectionVisible(s, role)).map((section: NavSection) => {
          const visibleItems = section.items.filter((item) => isNavItemVisible(item, role));
          return (
            <div key={section.id}>
              {!collapsed
                ? <SectionLabel label={section.label} />
                : <div className="h-px bg-sidebar-border mx-2 my-2" aria-hidden />
              }
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <SidebarNavItem key={item.id} item={item} collapsed={collapsed} onClick={onClose} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="shrink-0 border-t border-sidebar-border">

        {/* Settings link */}
        <div className="px-2 pt-2 pb-1">
          <NavLink
            to="/settings"
            onClick={onClose}
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) => [
              "group relative flex items-center rounded-lg text-[13px] font-medium transition-all duration-150",
              collapsed ? "justify-center p-2.5 mx-0.5" : "gap-3 px-3 py-2",
              isActive
                ? "bg-sidebar-primary/[0.13] text-sidebar-primary font-semibold"
                : "text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent",
            ].join(" ")}
          >
            {({ isActive }) => (
              <>
                {isActive && !collapsed && <span className="sidebar-active-bar" />}
                <span className={[
                  "shrink-0 flex items-center justify-center h-[18px] w-[18px]",
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/45 group-hover:text-sidebar-accent-foreground",
                ].join(" ")}>
                  <Settings className="h-[18px] w-[18px]" />
                </span>
                {!collapsed && <span className="truncate">Settings</span>}
              </>
            )}
          </NavLink>
        </div>

        {/* User block */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 pb-3 px-2">
            <div
              title={`${name} · ${roleLabel(role)}`}
              className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={avatarStyle}
            >
              {initials || "?"}
            </div>
            <button onClick={onSignOut} title="Sign out"
              className="p-1.5 rounded-md text-sidebar-foreground/35 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mx-2 mb-3 mt-1 rounded-xl bg-sidebar-accent border border-sidebar-border p-2.5 flex items-center gap-2.5">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-2 ring-sidebar-border"
              style={avatarStyle}
            >
              {initials || "?"}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-sidebar-foreground leading-none truncate">{name}</p>
              <p className="text-[11px] text-sidebar-foreground/45 leading-none mt-0.5 truncate">{email}</p>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {role && (
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-sidebar-primary/18 text-sidebar-primary">
                  {roleLabel(role)}
                </span>
              )}
              <button onClick={onSignOut} title="Sign out"
                className="p-0.5 rounded text-sidebar-foreground/35 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors">
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        {onToggleCollapse && (
          <div className="px-2 pb-2">
            <button
              onClick={onToggleCollapse}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={[
                "flex items-center w-full rounded-lg text-[12px] font-medium text-sidebar-foreground/30 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors duration-150",
                collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
              ].join(" ")}
            >
              <span className="shrink-0 flex items-center justify-center h-4 w-4">
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </span>
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role  = session?.user?.role  ?? "";
  const name  = session?.user?.name  ?? "";
  const email = session?.user?.email ?? "";

  const breadcrumb = resolveModuleBreadcrumb(pathname, role);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const sharedProps: SidebarContentProps = { collapsed, role, name, email, onSignOut: handleSignOut };

  return (
    <div className="min-h-screen flex bg-muted/20">

      {/* ── Desktop sidebar ── */}
      <aside className={[
        "hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-200",
        collapsed ? "w-[52px]" : "w-60",
      ].join(" ")}>
        <SidebarContent {...sharedProps} onToggleCollapse={toggle} />
      </aside>

      {/* ── Mobile backdrop ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside className={[
        "lg:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col shadow-2xl transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}>
        <SidebarContent {...sharedProps} collapsed={false} onClose={() => setMobileOpen(false)} />
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 border-b bg-background/95 backdrop-blur-sm flex items-center px-4 gap-3 shrink-0">
          <button
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <p className="hidden sm:block text-sm text-muted-foreground font-medium tracking-wide select-none">
            {breadcrumb}
          </p>

          <div className="flex-1" />

          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border bg-muted/50 text-muted-foreground text-[13px] hover:bg-accent hover:text-foreground transition-colors"
            title="Search (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-1.5 text-[10px] border rounded px-1 py-0.5 bg-background font-mono leading-none">⌘K</kbd>
          </button>

          <NotificationBell />
          <ProfileMenu onSignOut={handleSignOut} />
        </header>

        <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto animate-in-page">
          <Outlet />
        </main>
      </div>

      <GlobalSearch />
    </div>
  );
}
