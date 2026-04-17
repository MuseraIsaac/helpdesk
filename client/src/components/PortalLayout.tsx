import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { signOut, useSession } from "../lib/auth-client";
import { useBranding } from "../lib/useBranding";
import { useTheme } from "../lib/theme";
import { Ticket, PlusCircle, LogOut, Sun, Moon, BookOpen, Inbox, ShoppingBag } from "lucide-react";

export default function PortalLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { data: branding } = useBranding();
  const logoDataUrl = branding?.logoDataUrl;

  const handleSignOut = async () => {
    await signOut();
    navigate("/portal/login", { replace: true });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
      isActive
        ? "text-primary-foreground bg-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-accent"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <nav className="sticky top-0 z-50 bg-background border-b px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-2 mr-5">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Zentra" className="h-7 w-7 rounded-lg object-contain" />
            ) : (
              <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">Z</span>
              </div>
            )}
            <span className="text-[15px] font-semibold tracking-tight">
              Zentra Support
            </span>
          </div>
          <NavLink to="/portal/tickets" className={navLinkClass}>
            <Ticket className="h-3.5 w-3.5" />
            My Tickets
          </NavLink>
          <NavLink to="/portal/new-ticket" className={navLinkClass}>
            <PlusCircle className="h-3.5 w-3.5" />
            New Ticket
          </NavLink>
          <NavLink to="/portal/requests" className={navLinkClass}>
            <Inbox className="h-3.5 w-3.5" />
            My Requests
          </NavLink>
          <NavLink to="/portal/new-request" className={navLinkClass}>
            <PlusCircle className="h-3.5 w-3.5" />
            New Request
          </NavLink>
          <NavLink to="/portal/catalog" className={navLinkClass}>
            <ShoppingBag className="h-3.5 w-3.5" />
            Service Catalog
          </NavLink>
          <Link
            to="/help"
            className="inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Help Center
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center rounded-lg h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 cursor-pointer"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <div className="h-5 w-px bg-border mx-2" />
          <span className="text-[13px] text-muted-foreground mr-1">
            {session?.user?.name}
          </span>
          <button
            className="inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200 cursor-pointer"
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1 px-8 py-8 max-w-[860px] w-full mx-auto animate-in-page">
        <Outlet />
      </main>
    </div>
  );
}
