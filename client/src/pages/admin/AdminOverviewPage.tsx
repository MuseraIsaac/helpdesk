import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import {
  ADMIN_TABS,
  ADMIN_TAB_GROUPS,
  type AdminTabGroup,
} from "@/lib/admin-tabs";

/**
 * Administration overview — landing page at `/admin`.
 *
 * Renders every admin tool grouped by purpose. Each card is the same
 * NavLink target used by the hub's tab bar, so admins can either click
 * through here or jump directly via the tabs above.
 */
export default function AdminOverviewPage() {
  return (
    <div className="space-y-8">
      {ADMIN_TAB_GROUPS.map((group) => (
        <Group key={group} group={group} />
      ))}
    </div>
  );
}

function Group({ group }: { group: AdminTabGroup }) {
  const tabs = ADMIN_TABS.filter((t) => t.group === group);
  if (tabs.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-[2px] w-4 rounded-full bg-gradient-to-r from-primary to-primary/0" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {group}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              className="group relative flex items-start gap-3 rounded-xl border bg-card p-4 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 group-hover:bg-primary/15 transition-colors">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-semibold tracking-tight text-foreground">
                    {tab.label}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
                <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                  {tab.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
