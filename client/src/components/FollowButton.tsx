/**
 * FollowButton — reusable follow/unfollow toggle for any ITSM entity.
 *
 * Shows a Bell icon when not following and BellOff when following.
 * Passes the entityPath and entityId through to useEntityFollow.
 */

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntityFollow, type FollowableEntity } from "@/hooks/useEntityFollow";

interface FollowButtonProps {
  entityPath: FollowableEntity;
  entityId:   number;
  /** Optional extra className applied to the Button */
  className?: string;
}

export default function FollowButton({ entityPath, entityId, className = "" }: FollowButtonProps) {
  const { following, isPending, toggle } = useEntityFollow(entityPath, entityId);

  return (
    <Button
      type="button"
      variant={following ? "default" : "outline"}
      size="sm"
      className={[
        "gap-1.5 h-8 transition-all",
        following
          ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary/50 shadow-none"
          : "",
        className,
      ].join(" ")}
      disabled={isPending || entityId === 0}
      onClick={toggle}
      title={following ? "Unfollow — stop receiving status notifications" : "Follow — get notified on status changes"}
    >
      {following ? (
        <>
          <BellOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Following</span>
        </>
      ) : (
        <>
          <Bell className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Follow</span>
        </>
      )}
    </Button>
  );
}
