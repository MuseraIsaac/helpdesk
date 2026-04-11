import { Navigate, Outlet } from "react-router";
import { Role } from "core/constants/role.ts";
import { useSession } from "../lib/auth-client";

/**
 * Route guard for customer portal pages.
 * Unauthenticated users → /portal/login
 * Agents / admins → / (their home)
 */
export default function CustomerRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/portal/login" replace />;
  }

  if (session.user.role !== Role.customer) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
