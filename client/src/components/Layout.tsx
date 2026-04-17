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
import { Settings, ChevronLeft, ChevronRight, Menu, X, Search } from "lucide-react";

// ── Sidebar collapse — persisted to localStorage ───────────────────────────────

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {}
      return next;
    });

  return { collapsed, toggle };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

function roleLabel(role: string): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// ── Nav badge pill ─────────────────────────────────────────────────────────────

function NavBadgePill({ badge }: { badge: NonNullable<NavItem["badge"]> }) {
  const cls =
    badge === "beta"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  return (
    <span
      className={`ml-auto text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${cls}`}
    >
      {badge}
    </span>
  );
}

// ── Nav item ───────────────────────────────────────────────────────────────────

interface NavItemProps {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}

function SidebarNavItem({ item, collapsed, onClick }: NavItemProps) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        [
          "flex items-center rounded-md text-[13px] font-medium transition-colors duration-150",
          collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        ].join(" ")
      }
    >
      <span className="shrink-0 flex items-center justify-center h-4 w-4">
        <Icon className="h-4 w-4" />
      </span>
      {!collapsed && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {item.badge && <NavBadgePill badge={item.badge} />}
        </>
      )}
    </NavLink>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 pt-1 pb-1">
      {label}
    </p>
  );
}

// ── Sidebar content (shared between desktop + mobile drawer) ───────────────────

interface SidebarContentProps {
  collapsed: boolean;
  role: string;
  name: string;
  email: string;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

function SidebarContent({
  collapsed,
  role,
  name,
  email,
  onToggleCollapse,
  onClose,
}: SidebarContentProps) {
  const initials = getInitials(name);
  const { data: branding } = useBranding();
  const logoDataUrl = branding?.logoDataUrl;

  return (
    <div className="flex flex-col h-full select-none">
      {/* ── Platform wordmark ── */}
      <div
        className={[
          "h-14 flex items-center border-b shrink-0",
          collapsed ? "justify-center px-2" : "px-4",
        ].join(" ")}
      >
        <Link
          to="/"
          onClick={onClose}
          className="flex items-center gap-2.5 min-w-0 group"
        >
          {logoDataUrl ? (
            <img
              src={logoDataUrl}
              alt="Zentra"
              className="h-7 w-7 rounded-lg object-contain shrink-0"
            />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-[11px] tracking-tight">
                Z
              </span>
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-[14px] font-semibold tracking-tight truncate block group-hover:text-foreground transition-colors">
                Zentra
              </span>
            </div>
          )}
        </Link>

        {/* Mobile close button */}
        {!collapsed && onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Navigation sections ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 min-h-0">
        {NAV_SECTIONS.filter((s) => isNavSectionVisible(s, role)).map(
          (section: NavSection) => {
            const visibleItems = section.items.filter((item) =>
              isNavItemVisible(item, role)
            );
            return (
              <div key={section.id} className="space-y-0.5">
                {!collapsed && <SectionLabel label={section.label} />}
                {collapsed && (
                  <div className="h-px bg-border mx-1 my-1" aria-hidden />
                )}
                {visibleItems.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    item={item}
                    collapsed={collapsed}
                    onClick={onClose}
                  />
                ))}
              </div>
            );
          }
        )}
      </nav>

      {/* ── Footer ── */}
      <div className="border-t shrink-0">
        {/* Settings link */}
        <div className="px-2 pt-2 pb-1 space-y-0.5">
          <NavLink
            to="/settings"
            onClick={onClose}
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              [
                "flex items-center rounded-md text-[13px] font-medium transition-colors duration-150",
                collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              ].join(" ")
            }
          >
            <span className="shrink-0 flex items-center justify-center h-4 w-4">
              <Settings className="h-4 w-4" />
            </span>
            {!collapsed && <span className="truncate">Settings</span>}
          </NavLink>
        </div>

        {/* User identity block */}
        {collapsed ? (
          <div className="flex justify-center pb-2 px-2">
            <div
              title={`${name} · ${roleLabel(role)}`}
              className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-semibold"
            >
              {initials || "?"}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-3 pb-3 pt-1">
            <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium leading-none truncate">
                {name}
              </p>
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5 truncate">
                {email}
              </p>
            </div>
            {role && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {roleLabel(role)}
              </span>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        {onToggleCollapse && (
          <div className="px-2 pb-2">
            <button
              onClick={onToggleCollapse}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={[
                "flex items-center w-full rounded-md text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150",
                collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
              ].join(" ")}
            >
              <span className="shrink-0 flex items-center justify-center h-4 w-4">
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </span>
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = session?.user?.role ?? "";
  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";

  const breadcrumb = resolveModuleBreadcrumb(pathname, role);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const sidebarProps: SidebarContentProps = { collapsed, role, name, email };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside
        className={[
          "hidden lg:flex flex-col border-r bg-background shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-200",
          collapsed ? "w-14" : "w-60",
        ].join(" ")}
      >
        <SidebarContent {...sidebarProps} onToggleCollapse={toggle} />
      </aside>

      {/* ── Mobile sidebar overlay ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={[
          "lg:hidden fixed inset-y-0 left-0 z-50 w-60 bg-background border-r flex flex-col transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <SidebarContent
          {...sidebarProps}
          collapsed={false}
          onClose={() => setMobileOpen(false)}
        />
      </aside>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-30 h-14 border-b bg-background flex items-center px-4 gap-3 shrink-0">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Module breadcrumb */}
          <p className="hidden sm:block text-sm text-muted-foreground font-medium tracking-wide">
            {breadcrumb}
          </p>

          <div className="flex-1" />

          {/* Global search trigger */}
          <button
            onClick={() => {
              // Dispatch synthetic Ctrl+K to open GlobalSearch
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
              );
            }}
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border bg-muted/50 text-muted-foreground text-[13px] hover:bg-accent hover:text-foreground transition-colors"
            title="Search (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-2 text-[10px] border rounded px-1 py-0.5 bg-background">⌘K</kbd>
          </button>

          {/* Notification bell */}
          <NotificationBell />

          {/* Profile menu */}
          <ProfileMenu onSignOut={handleSignOut} />
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto animate-in-page">
          <Outlet />
        </main>
      </div>

      {/* Global search overlay — rendered outside the sidebar/content split */}
      <GlobalSearch />
    </div>
  );
}
