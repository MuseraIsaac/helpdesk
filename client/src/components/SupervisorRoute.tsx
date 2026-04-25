import { Navigate, Outlet } from "react-router";
import { can } from "core/constants/permission.ts";
import { useSession } from "../lib/auth-client";
import AppLoader from "./AppLoader";

/** Allows admin and supervisor. Redirects everyone else to /. */
export default function SupervisorRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) return <AppLoader />;

  const role = session?.user?.role ?? "";
  if (!can(role, "kb.manage")) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
