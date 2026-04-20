import { Navigate, Outlet } from "react-router";
import { can } from "core/constants/permission.ts";
import { useSession } from "../lib/auth-client";

interface PermissionRouteProps {
  /** The permission string that the current user must have to access child routes. */
  permission: string;
  /** Path to redirect to when the check fails. Defaults to "/". */
  redirectTo?: string;
}

/**
 * Generic permission-based route guard.
 *
 * Mirrors the pattern used by AdminRoute / SupervisorRoute but accepts any
 * `permission` string instead of hard-coding a specific role or permission,
 * making it reusable across multiple route groups.
 *
 * Usage in App.tsx:
 *   <Route element={<PermissionRoute permission="reports.view" />}>
 *     <Route path="/reports/..." element={<.../>} />
 *   </Route>
 */
export default function PermissionRoute({
  permission,
  redirectTo = "/",
}: PermissionRouteProps) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const role = session?.user?.role ?? "";
  if (!can(role, permission as Parameters<typeof can>[1])) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
