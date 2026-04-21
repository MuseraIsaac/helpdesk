/**
 * ShareReportEmailDialog — send a report snapshot to one or more email addresses.
 *
 * The server generates a formatted HTML email containing key metrics and a
 * direct link back to the live report in the system.
 */
import { useState, useRef, type KeyboardEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Mail, X, Send, Loader2, Info } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ErrorAlert from "@/components/ErrorAlert";
import { cn } from "@/lib/utils";

// ── Section label map ─────────────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  overview:  "Overview",
  tickets:   "Tickets",
  sla:       "SLA",
  agents:    "Agents",
  teams:     "Teams",
  incidents: "Incidents",
  requests:  "Requests",
  problems:  "Problems",
  approvals: "Approvals",
  changes:   "Changes",
  csat:      "CSAT",
  kb:        "Knowledge Base",
  realtime:  "Real-time",
};

// ── Email chip ────────────────────────────────────────────────────────────────

function EmailChip({ email, onRemove }: { email: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-1 shrink-0">
      <Mail className="h-3 w-3 opacity-70" />
      {email}
      <button
        type="button"
        onClick={onRemove}
        className="text-primary/60 hover:text-primary transition-colors ml-0.5"
        aria-label={`Remove ${email}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ── Period label ──────────────────────────────────────────────────────────────

function periodLabel(period: string, customFrom?: string, customTo?: string): string {
  if (period === "custom" && customFrom && customTo) {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(customFrom)} – ${fmt(customTo)}`;
  }
  const map: Record<string, string> = {
    "7":  "Last 7 days",
    "30": "Last 30 days",
    "90": "Last 90 days",
  };
  return map[period] ?? `Last ${period} days`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ShareReportEmailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Which report section is being shared, e.g. "overview" */
  section: string;
  /** Raw period string from search params, e.g. "30" */
  period: string;
  customFrom?: string;
  customTo?: string;
  /** For custom builder reports — the saved report ID */
  reportId?: number;
  /** For custom builder reports — the report name */
  reportName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShareReportEmailDialog({
  open, onOpenChange,
  section, period, customFrom, customTo,
  reportId, reportName,
}: ShareReportEmailDialogProps) {
  const [emails,      setEmails]      = useState<string[]>([]);
  const [inputValue,  setInputValue]  = useState("");
  const [message,     setMessage]     = useState("");
  const [inputError,  setInputError]  = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sectionLabel = reportName ?? SECTION_LABELS[section] ?? section;
  const pLabel       = periodLabel(period, customFrom, customTo);

  // ── Email validation & chip management ───────────────────────────────────

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }

  function addEmail(raw: string) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) { setInputError("Invalid email address"); return; }
    if (emails.includes(trimmed)) { setInputError("Already added"); return; }
    setEmails(prev => [...prev, trimmed]);
    setInputValue("");
    setInputError(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      setEmails(prev => prev.slice(0, -1));
    } else {
      setInputError(null);
    }
  }

  // ── Send mutation ─────────────────────────────────────────────────────────

  const sendMut = useMutation({
    mutationFn: async () => {
      const allEmails = [...emails];
      const pending   = inputValue.trim();
      if (pending) {
        if (!isValidEmail(pending)) throw new Error("Invalid email address: " + pending);
        allEmails.push(pending.toLowerCase());
      }
      if (allEmails.length === 0) throw new Error("Add at least one recipient email.");

      await axios.post("/api/reports/share-email", {
        section,
        period,
        from:     customFrom,
        to:       customTo,
        reportId: reportId ?? null,
        emails:   allEmails,
        message:  message.trim() || undefined,
      });
    },
    onSuccess: () => {
      setEmails([]);
      setInputValue("");
      setMessage("");
      onOpenChange(false);
    },
  });

  function handleClose(v: boolean) {
    if (!v) {
      setEmails([]);
      setInputValue("");
      setMessage("");
      setInputError(null);
      sendMut.reset();
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            Share Report via Email
          </DialogTitle>
          <DialogDescription className="text-xs">
            Send a snapshot of the <strong className="text-foreground">{sectionLabel}</strong> report
            ({pLabel}) to one or more recipients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* ── Recipients ────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Recipients</Label>
            <div
              className={cn(
                "min-h-[40px] flex flex-wrap gap-1.5 p-2 rounded-lg border bg-background cursor-text",
                inputError ? "border-destructive" : "border-input",
                "focus-within:ring-1 focus-within:ring-ring",
              )}
              onClick={() => inputRef.current?.focus()}
            >
              {emails.map(e => (
                <EmailChip
                  key={e}
                  email={e}
                  onRemove={() => setEmails(prev => prev.filter(x => x !== e))}
                />
              ))}
              <input
                ref={inputRef}
                type="email"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setInputError(null); }}
                onKeyDown={handleKeyDown}
                onBlur={() => { if (inputValue.trim()) addEmail(inputValue); }}
                placeholder={emails.length === 0 ? "Enter email and press Enter or comma…" : "Add another…"}
                className="flex-1 min-w-[160px] text-xs outline-none bg-transparent placeholder:text-muted-foreground"
              />
            </div>
            {inputError ? (
              <p className="text-[11px] text-destructive">{inputError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> or{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">,</kbd> after each address.
              </p>
            )}
          </div>

          {/* ── Personal message ──────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Message <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Add a personal note to include in the email…"
              className="text-xs resize-none h-20"
              maxLength={500}
            />
          </div>

          {/* ── Info banner ───────────────────────────────────────────── */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border/60">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Recipients will receive a summary of the report's key metrics and a link to view the full report in the system.
              Only users with access to this system can view live data.
            </p>
          </div>
        </div>

        {sendMut.isError && (
          <ErrorAlert error={sendMut.error as Error} fallback="Failed to send email" />
        )}

        {sendMut.isSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <div className="h-4 w-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <span className="text-white text-[9px] font-bold">✓</span>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400">Report shared successfully!</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={sendMut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending || (emails.length === 0 && !inputValue.trim())}
            className="gap-1.5"
          >
            {sendMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
              : <><Send className="h-3.5 w-3.5" /> Send Report</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
