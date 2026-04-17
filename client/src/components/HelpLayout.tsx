import { Link, NavLink, Outlet } from "react-router";
import { BookOpen } from "lucide-react";
import { useBranding } from "@/lib/useBranding";

export default function HelpLayout() {
  const { data: branding } = useBranding();
  const logoDataUrl = branding?.logoDataUrl;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="sticky top-0 z-50 bg-background border-b px-6 h-14 flex items-center justify-between">
        <Link to="/help" className="flex items-center gap-2 group">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Zentra" className="h-7 w-7 rounded-lg object-contain" />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
          <span className="text-[15px] font-semibold tracking-tight group-hover:text-foreground transition-colors">
            Help Center
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <NavLink
            to="/portal/tickets"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            My tickets
          </NavLink>
          <NavLink
            to="/portal/new-ticket"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Submit a request
          </NavLink>
        </div>
      </nav>
      <main className="flex-1 px-6 py-10 max-w-[860px] w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
