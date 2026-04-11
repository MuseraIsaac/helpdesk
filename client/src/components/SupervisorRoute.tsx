import { Navigate, Outlet } from "react-router";
import { can } from "core/constants/permission.ts";
import { useSession } from "../lib/auth-client";

/** Allows admin and supervisor. Redirects everyone else to /. */
export default function SupervisorRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-muted-foreground">
        Loading...
      </div>
    );
  }

  const role = session?.user?.role ?? "";
  if (!can(role, "kb.manage")) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
