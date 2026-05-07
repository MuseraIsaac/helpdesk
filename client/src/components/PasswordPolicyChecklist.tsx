import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Check, X, Loader2 } from "lucide-react";

/**
 * Live password complexity checklist driven by Settings → Security.
 *
 * Pass the current password value; each configured rule renders as a row that
 * flips green / cleared once satisfied. The component intentionally renders
 * nothing while the policy is loading — first impression should be the form,
 * not a flash of placeholder rules.
 *
 * Mirrors the server-side `validatePasswordPolicy` regex set so client and
 * server agree on what passes. The server is still the source of truth — any
 * payload that doesn't satisfy the policy is rejected with 400 — but this UI
 * gives users immediate feedback instead of a one-line error after submit.
 */

export interface PasswordPolicy {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
}

export function usePasswordPolicy() {
  return useQuery<PasswordPolicy>({
    queryKey: ["security", "password-policy"],
    queryFn: async () => {
      const { data } = await axios.get<PasswordPolicy>("/api/settings/password-policy");
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

interface Rule {
  label: string;
  ok: boolean;
}

export function evaluatePassword(password: string, policy: PasswordPolicy): Rule[] {
  const rules: Rule[] = [
    { label: `At least ${policy.passwordMinLength} characters`, ok: password.length >= policy.passwordMinLength },
  ];
  if (policy.passwordRequireUppercase) rules.push({ label: "One uppercase letter (A–Z)", ok: /[A-Z]/.test(password) });
  if (policy.passwordRequireNumber)    rules.push({ label: "One number (0–9)",            ok: /\d/.test(password) });
  if (policy.passwordRequireSymbol)    rules.push({ label: "One symbol (!@#…)",           ok: /[^A-Za-z0-9]/.test(password) });
  return rules;
}

/** Returns true if the password satisfies every active rule. */
export function isPasswordCompliant(password: string, policy: PasswordPolicy | undefined): boolean {
  if (!policy) return true; // policy not loaded — defer to server
  return evaluatePassword(password, policy).every((r) => r.ok);
}

interface Props {
  /** Current value of the password field. */
  password: string;
  /** When true, render even if `password` is empty (e.g. show on focus). */
  alwaysShow?: boolean;
  className?: string;
}

export function PasswordPolicyChecklist({ password, alwaysShow = false, className }: Props) {
  const { data: policy, isLoading } = usePasswordPolicy();

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading policy…
      </div>
    );
  }
  if (!policy) return null;
  if (!alwaysShow && password.length === 0) return null;

  const rules = evaluatePassword(password, policy);
  const allOk = rules.every((r) => r.ok);

  return (
    <div
      className={`rounded-md border p-2.5 transition-colors ${
        allOk
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-muted/30"
      } ${className ?? ""}`}
      aria-live="polite"
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        Password requirements
      </div>
      <ul className="space-y-1">
        {rules.map((r) => (
          <li
            key={r.label}
            className={`flex items-center gap-2 text-xs transition-colors ${
              r.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
            }`}
          >
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0 transition-colors ${
                r.ok
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-border bg-background text-muted-foreground/60"
              }`}
            >
              {r.ok ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <X className="h-2 w-2" strokeWidth={3} />}
            </span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PasswordPolicyChecklist;
