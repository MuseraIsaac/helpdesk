import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Role } from "core/constants/role.ts";
import { can } from "core/constants/permission.ts";
import { signOut, useSession } from "../lib/auth-client";
import ProfileMenu from "./ProfileMenu";
import {
  LayoutDashboard,
  Ticket,
  Users,
  BookOpen,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart2,
  Zap,
  FileText,
  AlertCircle,
  ArrowUpDown,
  Wrench,
  Menu,
  X,
} from "lucide-react";

// ── Sidebar collapse state persisted to localStorage ──────────────────────────

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  };

  return { collapsed, toggle };
}

// ── Reusable nav item ──────────────────────────────────────────────────────────

interface NavItemProps {
  to: string;
  end?: boolean;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}

function NavItem({ to, end, icon, label, collapsed }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          "flex items-center rounded-lg text-[13px] font-medium transition-colors duration-150",
          collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        ].join(" ")
      }
    >
      <span className="shrink-0 h-4 w-4 flex items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 pt-1 pb-1">
      {label}
    </p>
  );
}

// ── Sidebar content (shared between desktop + mobile drawer) ──────────────────

interface SidebarContentProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  role: string;
}

function SidebarContent({
  collapsed,
  onToggleCollapse,
  onClose,
  role,
}: SidebarContentProps) {
  const isAdmin = role === Role.admin;
  const canManageKb = can(role, "kb.manage");
  const iconCls = "h-4 w-4";

  return (
    <div className="flex flex-col h-full select-none">
      {/* Logo row */}
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
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-sm">H</span>
          </div>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight truncate group-hover:text-foreground transition-colors">
              Helpdesk
            </span>
          )}
        </Link>
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

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 min-h-0">
        {/* Main */}
        <div className="space-y-0.5">
          {!collapsed && <SectionLabel label="Main" />}
          <NavItem to="/" end icon={<LayoutDashboard className={iconCls} />} label="Dashboard" collapsed={collapsed} />
          <NavItem to="/tickets" icon={<Ticket className={iconCls} />} label="Tickets" collapsed={collapsed} />
        </div>

        {/* ITSM */}
        <div className="space-y-0.5">
          {!collapsed && <SectionLabel label="ITSM" />}
          {collapsed && <div className="h-px bg-border mx-1 my-1" />}
          <NavItem to="/requests" icon={<Inbox className={iconCls} />} label="Requests" collapsed={collapsed} />
          <NavItem to="/problems" icon={<AlertCircle className={iconCls} />} label="Problems" collapsed={collapsed} />
          <NavItem to="/changes" icon={<ArrowUpDown className={iconCls} />} label="Changes" collapsed={collapsed} />
        </div>

        {/* Knowledge */}
        {(canManageKb || isAdmin) && (
          <div className="space-y-0.5">
            {!collapsed && <SectionLabel label="Knowledge" />}
            {collapsed && <div className="h-px bg-border mx-1 my-1" />}
            {canManageKb && (
              <NavItem to="/kb" icon={<BookOpen className={iconCls} />} label="Knowledge Base" collapsed={collapsed} />
            )}
            {isAdmin && (
              <NavItem to="/templates" icon={<FileText className={iconCls} />} label="Templates" collapsed={collapsed} />
            )}
          </div>
        )}

        {/* Automation */}
        {isAdmin && (
          <div className="space-y-0.5">
            {!collapsed && <SectionLabel label="Automation" />}
            {collapsed && <div className="h-px bg-border mx-1 my-1" />}
            <NavItem to="/automations" icon={<Zap className={iconCls} />} label="Automations" collapsed={collapsed} />
            <NavItem to="/reports" icon={<BarChart2 className={iconCls} />} label="Reports" collapsed={collapsed} />
          </div>
        )}

        {/* Management */}
        {isAdmin && (
          <div className="space-y-0.5">
            {!collapsed && <SectionLabel label="Management" />}
            {collapsed && <div className="h-px bg-border mx-1 my-1" />}
            <NavItem to="/teams" icon={<Users className={iconCls} />} label="Teams" collapsed={collapsed} />
            <NavItem to="/users" icon={<Users className={iconCls} />} label="Users" collapsed={collapsed} />
            <NavItem to="/macros" icon={<Wrench className={iconCls} />} label="Macros" collapsed={collapsed} />
          </div>
        )}
      </nav>

      {/* Bottom: settings + collapse toggle */}
      <div className="border-t px-2 py-2 shrink-0 space-y-0.5">
        <NavItem to="/settings" icon={<Settings className={iconCls} />} label="Settings" collapsed={collapsed} />
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={[
              "flex items-center w-full rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150",
              collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
            ].join(" ")}
          >
            <span className="shrink-0 h-4 w-4 flex items-center justify-center">
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </span>
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = session?.user?.role ?? "";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Desktop sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={[
          "hidden lg:flex flex-col border-r bg-background shrink-0 sticky top-0 h-screen overflow-hidden transition-[width] duration-200",
          collapsed ? "w-14" : "w-60",
        ].join(" ")}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapse={toggle}
          role={role}
        />
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────────────────── */}
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
          collapsed={false}
          onClose={() => setMobileOpen(false)}
          role={role}
        />
      </aside>

      {/* ── Main content area ────────────────────────────────────────────────── */}
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Profile menu */}
          <ProfileMenu onSignOut={handleSignOut} />
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 py-8 max-w-[1200px] w-full mx-auto animate-in-page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
