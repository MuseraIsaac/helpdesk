/**
 * AboutDialog — branded "About" panel for the helpdesk.
 *
 * Shows the product name (from branding settings), a short positioning
 * statement, version + build metadata, the runtime stack, and a few
 * helpful links. Opened from the ProfileMenu.
 *
 * The dialog reads the public branding so the product name and primary
 * colour adapt to whatever the operator has configured — no hard-coded
 * "Helpdesk" string in the UI.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/lib/useBranding";
import { useSettings } from "@/hooks/useSettings";
import {
  Activity, Mail, Globe, ExternalLink, Copy, Check, X,
  ShieldCheck, MessageSquare,
} from "lucide-react";

// Build-time constants — Vite injects these at build. The `__APP_VERSION__`
// global is configured in vite.config.ts via `define` (see vite docs); we
// fall back to a dev label so this works in development without a build step.
declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD_DATE__: string | undefined;
const APP_VERSION = (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__) || "dev";
const APP_BUILD   = (typeof __APP_BUILD_DATE__ !== "undefined" && __APP_BUILD_DATE__) || new Date().toISOString().slice(0, 10);

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FEATURES = [
  "AI-classified inbound email tickets",
  "Multi-channel intake (email, portal, API)",
  "ITIL-aligned Incidents · Problems · Changes · CMDB",
  "Real-time SLA tracking with auto-escalation",
  "Customisable dashboards with role-based sharing",
];

export default function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { data: branding } = useBranding();
  const { data: general }  = useSettings("general");
  const [copied, setCopied] = useState(false);

  const productName  = general?.helpdeskName  || branding?.companyName || "Zentra";
  // Engraved subtitle and copyright — intentionally NOT pulled from any
  // branding/general setting so they always identify the underlying ITSM
  // product, even when an operator has rebranded the helpdesk for their
  // own organisation.
  const ENGRAVED_SUBTITLE  = "ITSM MANAGEMENT · AI-Powered ITSM";
  const ENGRAVED_COPYRIGHT = "© 2026 Zentra. All rights reserved.";
  const accentColor  = branding?.primaryColor  || "#6366f1";
  const supportEmail = branding?.serviceDeskEmail || general?.supportEmail || "";
  const websiteUrl   = branding?.companyWebsite || "";

  // Reset the "Copied!" state when the dialog reopens
  useEffect(() => { if (open) setCopied(false); }, [open]);

  const fullVersion = `${productName} v${APP_VERSION} · ${APP_BUILD}`;

  async function copyVersion() {
    try {
      await navigator.clipboard.writeText(fullVersion);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — silent */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[540px] p-0 overflow-hidden gap-0 border-border/60"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">About {productName}</DialogTitle>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div
          className="relative px-7 pt-8 pb-6 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${accentColor}1f 0%, ${accentColor}0a 50%, transparent 100%)`,
          }}
        >
          {/* Decorative glow */}
          <div
            className="absolute -top-20 -right-20 h-56 w-56 rounded-full blur-3xl opacity-40 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${accentColor}, transparent 70%)` }}
          />
          {/* Decorative grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />

          {/* Close button (custom, themed) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative flex items-center gap-4">
            {/* Logo / brand mark */}
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm shrink-0 overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${accentColor}28, ${accentColor}14)`,
                borderColor: `${accentColor}40`,
              }}
            >
              {branding?.logoDataUrl ? (
                <img src={branding.logoDataUrl} alt="" className="h-9 w-9 object-contain" />
              ) : (
                <Activity className="h-7 w-7" style={{ color: accentColor }} />
              )}
            </span>

            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight leading-tight">{productName}</h2>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                {ENGRAVED_SUBTITLE}
              </p>
              <button
                type="button"
                onClick={copyVersion}
                title="Click to copy"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border bg-background/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                v{APP_VERSION}
                <span className="text-muted-foreground/40">·</span>
                {APP_BUILD}
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="px-7 py-5 space-y-5 bg-card">

          {/* Tagline */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            A modern, AI-augmented service desk for IT teams who want to move
            fast without breaking things — built around the ITIL-4 lifecycle
            with a customer portal, real-time analytics, and a workflow engine
            that adapts to your team's process.
          </p>

          {/* Feature highlights */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              What's inside
            </p>
            <ul className="space-y-1">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-foreground/85">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: accentColor }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Useful links — only render rows where the operator actually
              configured a value, so this section never shows empty buttons. */}
          {(supportEmail || websiteUrl) && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Need help?
              </p>
              <div className="flex flex-wrap gap-2">
                {supportEmail && (
                  <a
                    href={`mailto:${supportEmail}`}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background hover:bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors"
                  >
                    <Mail className="h-3 w-3" />
                    {supportEmail}
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background hover:bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors"
                  >
                    <Globe className="h-3 w-3" />
                    Website
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </a>
                )}
                <a
                  href="/help"
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background hover:bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  Help Center
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="border-t border-border/60 px-7 py-3 bg-muted/20 flex items-center justify-between gap-3">
          <p className="text-[10px] text-muted-foreground/70">
            {ENGRAVED_COPYRIGHT}
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
