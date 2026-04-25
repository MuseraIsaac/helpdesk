import { Navigate, Outlet } from "react-router";
import { Role } from "core/constants/role.ts";
import { useSession } from "../lib/auth-client";
import AppLoader from "./AppLoader";

export default function ProtectedRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) return <AppLoader />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Customer accounts belong to the portal, not the agent UI
  if (session.user.role === Role.customer) {
    return <Navigate to="/portal/tickets" replace />;
  }

  return <Outlet />;
}
