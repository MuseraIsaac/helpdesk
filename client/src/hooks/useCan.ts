import { useSession } from "@/lib/auth-client";
import { can, type Permission } from "core/constants/permission.ts";
import { usePermissionsVersion } from "./usePermissionsVersion";

/**
 * Permission gate hook — wraps `can(role, permission)` so components don't
 * need to repeat the session/role plumbing every time they want to hide a
 * button.
 *
 *   const canCreate = useCan("tickets.create");
 *   {canCreate && <Button>New Ticket</Button>}
 *
 * Subscribes to the global ROLE_PERMISSIONS map so the calling component
 * re-renders whenever an admin updates the role's permissions, without
 * requiring a page reload.
 */
export function useCan(permission: Permission): boolean {
  const { data: session } = useSession();
  usePermissionsVersion();
  return can(session?.user?.role ?? "", permission);
}
