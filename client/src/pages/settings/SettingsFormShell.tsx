/**
 * SettingsFormShell — shared layout wrapper for each settings section form.
 */
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import ErrorAlert from "@/components/ErrorAlert";
import { cn } from "@/lib/utils";

interface SettingsFormShellProps {
  title: string;
  description: string;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  isDirty: boolean;
  error: Error | null;
  isSuccess: boolean;
  children: ReactNode;
}

export default function SettingsFormShell({
  title,
  description,
  onSubmit,
  isPending,
  isDirty,
  error,
  isSuccess,
  children,
}: SettingsFormShellProps) {
  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-8">

      {/* Section title */}
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Error / success feedback */}
      {error && <ErrorAlert error={error} fallback="Failed to save settings" />}

      {/* Form content */}
      <div className="space-y-0 rounded-xl border bg-background overflow-hidden divide-y">
        {children}
      </div>

      {/* Sticky save footer */}
      <div className={cn(
        "flex items-center justify-between rounded-xl border px-5 py-3 transition-all duration-200",
        isDirty
          ? "bg-primary/5 border-primary/20 shadow-sm"
          : "bg-muted/30 border-transparent",
      )}>
        <div className="flex items-center gap-2 text-sm">
          {isPending ? (
            <span className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              Saving changes…
            </span>
          ) : isSuccess && !isDirty ? (
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="size-3.5" />
              All changes saved
            </span>
          ) : isDirty ? (
            <span className="text-xs text-muted-foreground">You have unsaved changes</span>
          ) : (
            <span className="text-xs text-muted-foreground/50">No pending changes</span>
          )}
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!isDirty || isPending}
          className={cn("gap-1.5 transition-all", !isDirty && "opacity-50")}
        >
          <Save className="size-3.5" />
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
