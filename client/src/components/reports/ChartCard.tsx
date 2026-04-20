import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Optional accent colour dot to the left of the title (Tailwind bg class) */
  accentColor?: string;
  children: ReactNode;
}

export default function ChartCard({
  title,
  description,
  action,
  className,
  contentClassName,
  accentColor,
  children,
}: ChartCardProps) {
  return (
    <div className={cn(
      "bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden",
      "transition-shadow hover:shadow-md",
      className,
    )}>
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/40">
        <div className="flex items-start gap-2.5 min-w-0">
          {accentColor && (
            <div className={cn("h-4 w-1 rounded-full mt-0.5 shrink-0", accentColor)} />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-snug text-foreground">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0 -mt-0.5">{action}</div>}
      </div>
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </div>
  );
}
