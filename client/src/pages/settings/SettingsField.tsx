/**
 * SettingsField — a labelled row for a single settings input.
 * Keeps the layout consistent across all section forms.
 */
import { type ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface SettingsFieldProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function SettingsField({ label, description, htmlFor, children }: SettingsFieldProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr] gap-3 items-start">
      <div className="pt-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium leading-none">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

/**
 * SettingsSwitchRow — a horizontal row for a boolean toggle with label + description.
 * Used for inline on/off settings (not the two-column grid layout).
 */
interface SettingsSwitchRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSwitchRow({ label, description, children }: SettingsSwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0 mt-0.5">{children}</div>
    </div>
  );
}

/**
 * SettingsGroup — a titled group of fields within a section.
 */
interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {title}
      </p>
      {children}
    </div>
  );
}
