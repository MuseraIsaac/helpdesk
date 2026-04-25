import { Navigate, Outlet } from "react-router";
import { Role } from "core/constants/role.ts";
import { useSession } from "../lib/auth-client";
import AppLoader from "./AppLoader";

export default function AdminRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) return <AppLoader />;

  if (session?.user?.role !== Role.admin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
