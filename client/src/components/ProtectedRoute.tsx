import { Navigate, Outlet } from "react-router";
import { useSession } from "../lib/auth-client";

export default function ProtectedRoute() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-500">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
