import { NavLink, Outlet, useLocation } from "react-router";
import { ShieldCheck, ChevronRight } from "lucide-react";
import {
  ADMIN_TABS,
  findActiveAdminTab,
  type AdminTab,
} from "@/lib/admin-tabs";

/**
 * Administration Hub — chrome shared by every admin sub-page.
 *
 * Renders a gradient hero strip followed by a horizontal, scrollable tab
 * bar. The active page renders below via `<Outlet />`. URLs are unchanged
 * — each tab is a real route that existed before the hub was introduced,
 * so deep-links and the existing nav-config breadcrumb still resolve.
 */
export default function AdminHubLayout() {
  const { pathname } = useLocation();
  const active = findActiveAdminTab(pathname);
  const isOverview = pathname === "/admin" || pathname === "/admin/";

  return (
    <div className="space-y-6">
      <HubHero active={active} isOverview={isOverview} />
      <HubTabBar />
      <div className="animate-in-page">
        <Outlet />
      </div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function HubHero({
  active,
  isOverview,
}: {
  active: AdminTab | undefined;
  isOverview: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.10] via-primary/[0.04] to-transparent p-6">
      {/* Decorative radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex items-start gap-4">
        <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span>Administration</span>
            {!isOverview && active && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="text-primary normal-case tracking-normal text-[12px]">
                  {active.label}
                </span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {isOverview ? "Administration" : active?.label ?? "Administration"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            {isOverview
              ? "Configure how your service desk runs — ticketing, workflows, access and system health, all in one place."
              : active?.description ??
                "Configure how your service desk runs."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Tab bar ──────────────────────────────────────────────────────────────────

function HubTabBar() {
  return (
    <div className="-mx-1 overflow-x-auto sidebar-scrollbar">
      <div className="flex items-center gap-1 px-1 pb-1 min-w-max">
        <OverviewTab />
        <span className="mx-1 h-6 w-px bg-border shrink-0" aria-hidden />
        {ADMIN_TABS.map((tab) => (
          <HubTabLink key={tab.id} tab={tab} />
        ))}
      </div>
    </div>
  );
}

function OverviewTab() {
  return (
    <NavLink
      to="/admin"
      end
      className={({ isActive }) =>
        [
          "group relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors shrink-0",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <span className="text-[13px]">Overview</span>
          {isActive && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          )}
        </>
      )}
    </NavLink>
  );
}

function HubTabLink({ tab }: { tab: AdminTab }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      className={({ isActive }) =>
        [
          "group relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors shrink-0",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={[
              "h-4 w-4 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground",
            ].join(" ")}
          />
          <span>{tab.label}</span>
          {isActive && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          )}
        </>
      )}
    </NavLink>
  );
}
