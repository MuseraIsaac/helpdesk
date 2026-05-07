import { Navigate, Outlet, useLocation } from "react-router";
import { Role } from "core/constants/role.ts";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useSession } from "../lib/auth-client";
import AppLoader from "./AppLoader";

interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  };
}

export default function ProtectedRoute() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  // Pull the latest profile flags. Better Auth's session may surface
  // additional fields, but the freshly-loaded /me row is the source of truth
  // for `mustChangePassword` so an admin-issued change applies on the next
  // navigation, not only after sign-out / sign-in.
  const { data: me, isLoading: meLoading } = useQuery<MeResponse>({
    queryKey: ["users", "me"],
    queryFn: async () => (await axios.get<MeResponse>("/api/users/me")).data,
    enabled: !!session && session.user.role !== Role.customer,
    staleTime: 30_000,
  });

  if (isPending) return <AppLoader />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Customer accounts belong to the portal, not the agent UI
  if (session.user.role === Role.customer) {
    return <Navigate to="/portal/tickets" replace />;
  }

  // Force-change-password gate. Block every protected route until the user
  // picks a new password — the only screen that's exempt is /change-password
  // itself (so they can actually complete the flow).
  if (
    me?.user.mustChangePassword &&
    !location.pathname.startsWith("/change-password")
  ) {
    return <Navigate to="/change-password" replace />;
  }
  // While the /me query is in-flight we let the user through; if the flag is
  // set, the next render re-evaluates and bounces them. Avoids a flash of
  // <AppLoader /> on every navigation.
  void meLoading;

  return <Outlet />;
}
