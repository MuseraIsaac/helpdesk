import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
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
import { Settings, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Search, LogOut } from "lucide-react";
import SidebarRail from "./SidebarRail";

// ── Sidebar collapse — persisted to localStorage ──────────────────────────────

/**
 * Routes that benefit from edge-to-edge layout — large data tables and grids
 * where the default 1200px container leaves visible empty gutters.
 */
function isFullWidthRoute(pathname: string): boolean {
  // /tickets list view (but NOT /tickets/123 detail or /tickets/new)
  if (pathname === "/tickets" || pathname === "/tickets/") return true;
  return false;
}

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; }
    catch { return false; }
  });

  // Listen for preference saves from ProfilePage so the sidebar updates immediately
  // without requiring a page reload.
  useEffect(() => {
    function onPrefChange(e: CustomEvent<{ collapsed: boolean }>) {
      setCollapsed(e.detail.collapsed);
    }
    window.addEventListener("sidebar-pref-changed", onPrefChange as EventListener);
    return () => window.removeEventListener("sidebar-pref-changed", onPrefChange as EventListener);
  }, []);

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
        // Active item: gradient backdrop + soft inset highlight + subtle shadow
        // Inactive: keep low contrast so the active row visually pops
        isActive
          ? "bg-gradient-to-r from-sidebar-primary/[0.18] via-sidebar-primary/[0.10] to-sidebar-primary/[0.04] text-sidebar-primary font-semibold shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)]"
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
    <p className="px-3 pt-3 pb-1 text-[9.5px] font-bold uppercase tracking-[0.14em] select-none flex items-center gap-1.5 text-sidebar-foreground/45">
      {/* Tiny gradient stripe gives the label a colour identity without
          fighting the overall neutral sidebar palette. */}
      <span className="h-[2px] w-3 rounded-full bg-gradient-to-r from-sidebar-primary/60 to-sidebar-primary/0" />
      {label}
    </p>
  );
}

// ── Collapsible section header ───────────────────────────────────────────────
//
// Renders the section label as a clickable button with a rotating chevron
// + a small count badge so admins can see how many items are tucked away
// without expanding. The expanded state is persisted to localStorage so
// "open Administration once, stays open between visits" feels right.

function CollapsibleSectionHeader({
  label,
  count,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={[
        "group w-full flex items-center gap-1.5 pl-3 pr-2 pt-3 pb-1",
        "text-[9.5px] font-bold uppercase tracking-[0.14em] select-none",
        "text-sidebar-foreground/45 hover:text-sidebar-foreground/70 transition-colors",
      ].join(" ")}
    >
      <span className="h-[2px] w-3 rounded-full bg-gradient-to-r from-sidebar-primary/60 to-sidebar-primary/0" />
      <span>{label}</span>
      <span className="text-[9px] font-semibold tabular-nums text-sidebar-foreground/30 group-hover:text-sidebar-foreground/50 transition-colors">
        {count}
      </span>
      <ChevronDown
        className={[
          "ml-auto h-3 w-3 shrink-0 text-sidebar-foreground/35 group-hover:text-sidebar-foreground/60 transition-transform duration-200",
          expanded ? "rotate-0" : "-rotate-90",
        ].join(" ")}
      />
    </button>
  );
}

// ── Sidebar content ───────────────────────────────────────────────────────────

interface SidebarContentProps {
  collapsed: boolean;
  role: string;
  name: string;
  email: string;
  showDemoData?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onSignOut: () => void;
}

function SidebarContent({ collapsed, role, name, email, showDemoData, onToggleCollapse, onClose, onSignOut }: SidebarContentProps) {
  const initials = getInitials(name);
  const { data: branding } = useBranding();
  const logoDataUrl      = branding?.logoDataUrl;
  const companyName      = branding?.companyName      || "Zentra";
  const platformSubtitle = branding?.platformSubtitle || "Service Desk";
  const location = useLocation();

  // Persisted expanded-state for collapsible sections. Auto-expands when
  // the active route lives inside the section so the user sees the
  // current page on first navigation. Subsequent toggles are remembered
  // across page loads via localStorage.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("sidebar:expanded");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? false) };
      try { localStorage.setItem("sidebar:expanded", JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }
  function isSectionExpanded(section: NavSection): boolean {
    if (!section.collapsible) return true;
    // Force-open when the active route is inside this section, so the
    // user can always see where they are.
    const containsActive = section.items.some((item) =>
      item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(item.to + "/"),
    );
    if (containsActive) return true;
    return expandedSections[section.id] ?? section.defaultExpanded ?? false;
  }

  const orbStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--sidebar-primary) 0%, var(--sidebar-ring) 100%)",
    boxShadow: "0 0 18px var(--sidebar-glow), 0 2px 8px rgb(0 0 0 / 0.25)",
  };

  const avatarStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, var(--sidebar-primary) 0%, var(--sidebar-ring) 100%)",
    boxShadow: "0 0 14px var(--sidebar-glow), 0 2px 6px rgb(0 0 0 / 0.20)",
  };

  return (
    // Outer flex row: sidebar body on the left, decorative rail on the right.
    // The rail spans the full sidebar height and replaces the previous flat
    // border-r — same separation, more presence.
    <div className="flex h-full">
    <div className="sidebar-surface flex flex-col h-full min-h-0 select-none flex-1 border-r border-sidebar-border">

      {/* ── Wordmark ── */}
      <div className={[
        "h-14 flex items-center shrink-0 border-b border-sidebar-border",
        collapsed ? "justify-center px-2" : "px-4",
      ].join(" ")}>
        <Link to="/" onClick={onClose} className="flex items-center gap-2.5 min-w-0 group">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Logo"
              className="h-7 w-7 object-contain shrink-0" />
          ) : (
            <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={orbStyle}>
              <span className="text-white font-bold text-[11px] tracking-tight">Z</span>
            </div>
          )}

          {!collapsed && (
            <div className="min-w-0 leading-none">
              <span className="text-[14px] font-semibold tracking-tight text-sidebar-foreground truncate block group-hover:text-sidebar-primary transition-colors duration-150">
                {companyName}
              </span>
              <span className="text-[10px] text-sidebar-foreground/30 mt-0.5 block">{platformSubtitle}</span>
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
        {NAV_SECTIONS
          .filter((s) => {
            if (s.id === "demo-data" && !showDemoData) return false;
            return isNavSectionVisible(s, role);
          })
          .map((section: NavSection) => {
          const visibleItems = section.items.filter((item) => isNavItemVisible(item, role));
          // In collapsed-rail mode the chevron is meaningless (the labels
          // aren't rendered), so we always show every visible item there.
          const expanded = collapsed ? true : isSectionExpanded(section);
          return (
            <div key={section.id}>
              {!collapsed
                ? section.collapsible
                    ? <CollapsibleSectionHeader
                        label={section.label}
                        count={visibleItems.length}
                        expanded={expanded}
                        onToggle={() => toggleSection(section.id)}
                      />
                    : <SectionLabel label={section.label} />
                : <div className="h-px bg-sidebar-border mx-2 my-2" aria-hidden />
              }
              {/* Smooth expand/collapse — uses grid-template-rows trick so
                  height transitions even though the inner content height
                  is unknown at compile time. */}
              <div
                className={[
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                ].join(" ")}
              >
                <div className="overflow-hidden">
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => (
                      <SidebarNavItem key={item.id} item={item} collapsed={collapsed} onClick={onClose} />
                    ))}
                  </div>
                </div>
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
                ? "bg-gradient-to-r from-sidebar-primary/[0.18] via-sidebar-primary/[0.10] to-sidebar-primary/[0.04] text-sidebar-primary font-semibold shadow-[inset_0_1px_0_rgb(255_255_255_/_0.04)]"
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
          <div className="mx-2 mb-3 mt-1 rounded-xl bg-gradient-to-br from-sidebar-primary/[0.08] via-sidebar-accent to-sidebar-accent border border-sidebar-border p-2.5 flex items-center gap-2.5 shadow-sm">
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
      {/* Decorative rail — sits flush against the sidebar's right edge. Uses
       *  the sidebar-primary token so it picks up palette colour shifts. */}
      <SidebarRail side="right" tone="sidebar" />
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

  // Fetch demo_data setting only for admins — determines sidebar section visibility.
  // staleTime is generous (5 min) since this rarely changes during a session.
  const { data: demoSettings } = useQuery({
    queryKey: ["settings", "demo_data"],
    queryFn:  () =>
      axios
        .get<{ section: string; data: { enableDemoDataTools: boolean } }>("/api/settings/demo_data")
        .then((r) => r.data.data),
    enabled:   role === "admin",
    staleTime: 5 * 60_000,
  });
  const showDemoData = role === "admin" && (demoSettings?.enableDemoDataTools ?? false);

  const breadcrumb = resolveModuleBreadcrumb(pathname, role);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const sharedProps: SidebarContentProps = { collapsed, role, name, email, showDemoData, onSignOut: handleSignOut };

  return (
    <div className="min-h-screen flex bg-muted/20">

      {/* ── Desktop sidebar ── */}
      <aside className={[
        "hidden lg:flex flex-col shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-200",
        // Width includes the 6px decorative rail on the right edge.
        collapsed ? "w-[58px]" : "w-[252px]",
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

        <main
          className={[
            "flex-1 px-6 py-8 w-full mx-auto animate-in-page",
            // Pages that need every available pixel (large data tables, kanban boards, etc.)
            // opt out of the default centered max-width container.
            isFullWidthRoute(pathname) ? "" : "max-w-[1200px]",
          ].join(" ")}
        >
          <Outlet />
        </main>
      </div>

      <GlobalSearch />
    </div>
  );
}
