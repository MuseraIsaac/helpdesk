import { Navigate, Outlet } from "react-router";
import { Role } from "core/constants/role.ts";
import { useSession } from "../lib/auth-client";
import AppLoader from "./AppLoader";

/**
 * Route guard for customer portal pages.
 * Unauthenticated users → /portal/login
 * Agents / admins → / (their home)
 */
export default function CustomerRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) return <AppLoader />;

  if (!session) {
    return <Navigate to="/portal/login" replace />;
  }

  if (session.user.role !== Role.customer) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
