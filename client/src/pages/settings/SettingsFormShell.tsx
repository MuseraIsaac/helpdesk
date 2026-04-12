/**
 * SettingsFormShell — shared layout wrapper for each section form.
 * Provides consistent title, description, form body, and save button.
 */
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ErrorAlert from "@/components/ErrorAlert";

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
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Separator />

      {error && <ErrorAlert error={error} fallback="Failed to save settings" />}
      {isSuccess && !isDirty && (
        <p className="text-sm text-green-600 dark:text-green-400">Settings saved.</p>
      )}

      <div className="space-y-5">{children}</div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={!isDirty || isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
