/**
 * BridgeCallButton — one-click video bridge call creation for incidents.
 *
 * States:
 *   no bridge configured  → nothing rendered (invisible, uses no space)
 *   no active call        → "Start Bridge Call" button (provider label + icon)
 *   active call           → Join link chip + Copy + End buttons
 *
 * The active provider is read from the public branding query; bridge creation
 * hits POST /api/incidents/:id/bridge.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Video, Copy, PhoneOff, ExternalLink, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  teams:      "Microsoft Teams",
  googlemeet: "Google Meet",
  zoom:       "Zoom",
  webex:      "Webex",
};

const PROVIDER_COLOR: Record<string, string> = {
  teams:      "text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/40",
  googlemeet: "text-green-700 border-green-200 bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/40",
  zoom:       "text-blue-500 border-blue-200 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/40",
  webex:      "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/40",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BridgeDialIn {
  label: string;
  uri: string;
  pin?: string;
  regionCode?: string;
}

export interface BridgeCallDetails {
  meetingId?: string | null;
  passcode?: string | null;
  startUrl?: string | null;
  organizerEmail?: string | null;
  dialIn?: BridgeDialIn[];
}

interface BridgeResponse {
  bridge: {
    joinUrl: string;
    provider: string;
    createdAt: string;
  } & BridgeCallDetails;
}

interface VideoBridgeSetting {
  videoBridgeProvider: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  incidentId: number;
  incidentNumber?: string;
  incidentTitle?: string;
  bridgeCallUrl: string | null;
  bridgeCallProvider: string | null;
  bridgeCallCreatedAt: string | null;
  bridgeCallDetails?: BridgeCallDetails | null;
  canManage: boolean;
}

export default function BridgeCallButton({
  incidentId,
  incidentNumber,
  incidentTitle,
  bridgeCallUrl,
  bridgeCallProvider,
  bridgeCallCreatedAt,
  bridgeCallDetails,
  canManage,
}: Props) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Fetch configured video provider (cached, rarely changes)
  const { data: integrations } = useQuery<VideoBridgeSetting>({
    queryKey: ["settings-video-bridge"],
    queryFn: async () => {
      const { data } = await axios.get<{ data: VideoBridgeSetting }>("/api/settings/integrations");
      return { videoBridgeProvider: data.data.videoBridgeProvider ?? "none" };
    },
    staleTime: 5 * 60_000,
  });

  const activeProvider = integrations?.videoBridgeProvider ?? "none";

  // Create bridge call
  const createBridge = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<BridgeResponse>(`/api/incidents/${incidentId}/bridge`);
      return data.bridge;
    },
    onSuccess: () => {
      // Invalidate both numeric and string key variants used on the page
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      qc.invalidateQueries({ queryKey: ["incident", String(incidentId)] });
    },
  });

  // End / remove bridge
  const endBridge = useMutation({
    mutationFn: async () => {
      await axios.delete(`/api/incidents/${incidentId}/bridge`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident", incidentId] });
      qc.invalidateQueries({ queryKey: ["incident", String(incidentId)] });
    },
  });

  // Build a multi-line meeting-details block for the clipboard. Falls back
  // to URL-only if the rich details aren't available (e.g. bridges created
  // before the bridgeCallDetails column existed).
  function buildClipboardText(): string {
    if (!bridgeCallUrl) return "";
    const lines: string[] = [];
    const providerName =
      PROVIDER_LABEL[bridgeCallProvider ?? ""] ?? "Video bridge";

    const heading = incidentNumber && incidentTitle
      ? `${providerName} — INC ${incidentNumber}: ${incidentTitle}`
      : `${providerName} bridge call`;
    lines.push(heading);
    lines.push("─".repeat(Math.min(heading.length, 60)));
    lines.push("");
    lines.push(`Join: ${bridgeCallUrl}`);

    const d = bridgeCallDetails;
    if (d?.meetingId)      lines.push(`Meeting ID: ${d.meetingId}`);
    if (d?.passcode)       lines.push(`Passcode: ${d.passcode}`);
    if (d?.organizerEmail) lines.push(`Organizer: ${d.organizerEmail}`);

    if (d?.dialIn && d.dialIn.length > 0) {
      lines.push("");
      lines.push("Dial-in:");
      for (const dialIn of d.dialIn) {
        const region = dialIn.regionCode ? ` (${dialIn.regionCode})` : "";
        const pin    = dialIn.pin ? ` — PIN ${dialIn.pin}` : "";
        lines.push(`  • ${dialIn.label}${region}${pin}`);
      }
    }

    if (bridgeCallCreatedAt) {
      lines.push("");
      lines.push(`Created: ${new Date(bridgeCallCreatedAt).toLocaleString()}`);
    }
    return lines.join("\n");
  }

  // Copy full meeting details to clipboard.
  async function handleCopy() {
    if (!bridgeCallUrl) return;
    const text = buildClipboardText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Not configured — render nothing
  if (activeProvider === "none") return null;

  const providerLabel  = PROVIDER_LABEL[activeProvider] ?? activeProvider;
  const providerColor  = PROVIDER_COLOR[activeProvider] ?? "";
  const hasActiveBridge = Boolean(bridgeCallUrl);

  // ── Active bridge ─────────────────────────────────────────────────────────
  if (hasActiveBridge && bridgeCallUrl) {
    return (
      <TooltipProvider>
        <div className={cn(
          "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
          PROVIDER_COLOR[bridgeCallProvider ?? ""] ?? "bg-muted border-border text-foreground",
        )}>
          <Video className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline mr-1">{PROVIDER_LABEL[bridgeCallProvider ?? ""] ?? "Bridge"} active</span>

          {/* Open link */}
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={bridgeCallUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-white/30 hover:bg-white/50 transition-colors"
              >
                Join <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open in {providerLabel}</TooltipContent>
          </Tooltip>

          {/* Copy link */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                className="p-0.5 rounded hover:bg-white/30 transition-colors"
              >
                {copied
                  ? <Check className="h-3.5 w-3.5" />
                  : <Copy className="h-3.5 w-3.5" />
                }
              </button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied!" : "Copy meeting details"}</TooltipContent>
          </Tooltip>

          {/* End bridge */}
          {canManage && (
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-white/30 transition-colors"
                      disabled={endBridge.isPending}
                    >
                      {endBridge.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <PhoneOff className="h-3.5 w-3.5" />
                      }
                    </button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Remove bridge call link</TooltipContent>
              </Tooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove bridge call link?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the link from the incident. The meeting itself is <strong>not cancelled</strong> in {PROVIDER_LABEL[bridgeCallProvider ?? ""] ?? "the provider"} — attendees with the link can still join until it expires.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => endBridge.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // ── No active bridge ──────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5 h-8 text-xs border", providerColor)}
            onClick={() => createBridge.mutate()}
            disabled={createBridge.isPending || !canManage}
          >
            {createBridge.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Video className="h-3.5 w-3.5" />
            }
            <span className="hidden sm:inline">
              {createBridge.isPending ? "Starting call…" : `Start ${providerLabel} Call`}
            </span>
            <span className="sm:hidden">Bridge</span>
          </Button>
        </TooltipTrigger>
        {!canManage && (
          <TooltipContent>You need manage permission to start a bridge call</TooltipContent>
        )}
        {canManage && !createBridge.isPending && (
          <TooltipContent>Create a one-click {providerLabel} meeting for this incident</TooltipContent>
        )}
      </Tooltip>
      {createBridge.isError && (
        <p className="text-[11px] text-destructive mt-1">
          {(createBridge.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to start call"}
        </p>
      )}
    </TooltipProvider>
  );
}
