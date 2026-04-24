/**
 * Settings field primitives.
 *
 * SettingsField      — two-column row: label+desc on left, input on right.
 * SettingsSwitchRow  — horizontal row: text on left, toggle on right.
 * SettingsGroup      — titled group of fields with a subtle section header.
 *
 * All three render inside the SettingsFormShell's divided card container,
 * so they have `px-5 py-4` padding and rely on parent `divide-y`.
 */
import { type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── SettingsField ─────────────────────────────────────────────────────────────

interface SettingsFieldProps {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  /** Extra CSS class for the outer row wrapper */
  className?: string;
  children: ReactNode;
}

export function SettingsField({
  label,
  description,
  htmlFor,
  className,
  children,
}: SettingsFieldProps) {
  return (
    <div className={cn(
      "grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-4 items-start px-5 py-4",
      "hover:bg-muted/20 transition-colors",
      className,
    )}>
      <div className="pt-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium leading-none cursor-pointer">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ── SettingsSwitchRow ──────────────────────────────────────────────────────────

interface SettingsSwitchRowProps {
  label: string;
  description?: ReactNode;
  /** Extra CSS class */
  className?: string;
  children: ReactNode;
}

export function SettingsSwitchRow({
  label,
  description,
  className,
  children,
}: SettingsSwitchRowProps) {
  return (
    <div className={cn(
      "flex items-start justify-between gap-6 px-5 py-4",
      "hover:bg-muted/20 transition-colors",
      className,
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0 mt-0.5">{children}</div>
    </div>
  );
}

// ── SettingsGroup ─────────────────────────────────────────────────────────────

interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <div>
      {/* Group header — sits inside the divided card */}
      <div className="px-5 py-3 bg-muted/30 border-b">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 leading-none">
          {title}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {/* Group rows — divided inside */}
      <div className="divide-y">
        {children}
      </div>
    </div>
  );
}
