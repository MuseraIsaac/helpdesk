/**
 * WatchButton — reusable watch/unwatch toggle for any ITSM entity.
 *
 * Shows a Bell icon when not watching and BellOff when watching.
 * Passes the entityPath and entityId through to useEntityWatch.
 */

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntityWatch, type WatchableEntity } from "@/hooks/useEntityFollow";

interface WatchButtonProps {
  entityPath: WatchableEntity;
  entityId:   number;
  /** Optional extra className applied to the Button */
  className?: string;
}

export default function WatchButton({ entityPath, entityId, className = "" }: WatchButtonProps) {
  const { watching, isPending, toggle } = useEntityWatch(entityPath, entityId);

  return (
    <Button
      type="button"
      variant={watching ? "default" : "outline"}
      size="sm"
      className={[
        "gap-1.5 h-8 transition-all",
        watching
          ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary/50 shadow-none"
          : "",
        className,
      ].join(" ")}
      disabled={isPending || entityId === 0}
      onClick={toggle}
      title={watching ? "Unwatch — stop receiving status notifications" : "Watch — get notified on status changes"}
    >
      {watching ? (
        <>
          <BellOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Watching</span>
        </>
      ) : (
        <>
          <Bell className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Watch</span>
        </>
      )}
    </Button>
  );
}
