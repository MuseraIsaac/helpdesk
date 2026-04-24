/**
 * OutboundWebhooksPage — Manage outbound webhook endpoints.
 *
 * Shows all registered webhooks, delivery stats, and allows
 * creating, editing, toggling, pinging, and deleting webhooks.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  Plus, Webhook, ArrowLeft, Trash2, Send, ToggleLeft,
  ToggleRight, CheckCircle2, XCircle, Copy, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { createOutboundWebhookSchema } from "core/schemas/automations";
import { AUTOMATION_TRIGGER_LABELS } from "core/constants/automation";
import type { AutomationTriggerType } from "core/constants/automation";
import type { z } from "zod/v4";

type WebhookFormValues = z.infer<typeof createOutboundWebhookSchema>;

interface OutboundWebhook {
  id: number;
  name: string;
  description: string | null;
  isEnabled: boolean;
  url: string;
  method: string;
  events: string[];
  retryLimit: number;
  timeoutMs: number;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  _count: { deliveries: number };
}

const ALL_EVENTS = Object.keys(AUTOMATION_TRIGGER_LABELS) as AutomationTriggerType[];

// ── Webhook form dialog ───────────────────────────────────────────────────────

function WebhookFormDialog({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: OutboundWebhook;
}) {
  const queryClient = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);

  const {
    register, control, handleSubmit, reset,
    formState: { errors },
  } = useForm<WebhookFormValues>({
    resolver: zodResolver(createOutboundWebhookSchema),
    defaultValues: existing
      ? {
          name:          existing.name,
          description:   existing.description ?? "",
          isEnabled:     existing.isEnabled,
          url:           existing.url,
          method:        existing.method as "POST" | "PUT" | "PATCH",
          events:        existing.events,
          retryLimit:    existing.retryLimit,
          timeoutMs:     existing.timeoutMs,
        }
      : {
          name: "",
          description: "",
          isEnabled: true,
          url: "",
          method: "POST",
          events: ["ticket.created"],
          retryLimit: 3,
          timeoutMs: 10000,
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: WebhookFormValues) => {
      if (existing) {
        await axios.patch(`/api/webhooks/outbound/${existing.id}`, values);
      } else {
        await axios.post("/api/webhooks/outbound", values);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      toast.success(existing ? "Webhook updated" : "Webhook registered");
      onClose();
      reset();
    },
    onError: () => toast.error("Failed to save webhook"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Webhook" : "Register Outbound Webhook"}</DialogTitle>
          <DialogDescription>
            Configure an endpoint to receive event payloads from this platform.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Slack alerts" {...register("name")} />
              {errors.name && <ErrorMessage message={errors.name.message} />}
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Endpoint URL <span className="text-destructive">*</span></Label>
              <Input placeholder="https://..." {...register("url")} />
              {errors.url && <ErrorMessage message={errors.url.message} />}
            </div>

            <div className="space-y-1.5">
              <Label>HTTP Method</Label>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Timeout (ms)</Label>
              <Input type="number" {...register("timeoutMs", { valueAsNumber: true })} />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Signing Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Optional HMAC signing secret"
                  {...register("signingSecret")}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 size-7"
                  onClick={() => setShowSecret((s) => !s)}
                >
                  {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                If set, payloads will include an X-Webhook-Signature header (HMAC-SHA256).
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Subscribe to events <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto border rounded-md p-2">
              <Controller
                control={control}
                name="events"
                render={({ field }) => (
                  <>
                    {ALL_EVENTS.map((event) => (
                      <label key={event} className="flex items-center gap-2 text-xs cursor-pointer p-1 rounded hover:bg-muted">
                        <input
                          type="checkbox"
                          checked={field.value.includes(event)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              field.onChange([...field.value, event]);
                            } else {
                              field.onChange(field.value.filter((v) => v !== event));
                            }
                          }}
                          className="rounded"
                        />
                        {AUTOMATION_TRIGGER_LABELS[event]}
                      </label>
                    ))}
                  </>
                )}
              />
            </div>
            {errors.events && <ErrorMessage message="Select at least one event." />}
          </div>

          {mutation.error && <ErrorAlert error={mutation.error} fallback="Failed to save webhook" />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : existing ? "Save changes" : "Register webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Webhook card ──────────────────────────────────────────────────────────────

function WebhookCard({
  webhook,
  onEdit,
  onDelete,
  onToggle,
  onPing,
}: {
  webhook: OutboundWebhook;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onPing: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    navigator.clipboard.writeText(webhook.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded-md ${webhook.isEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              <Webhook className="size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold">{webhook.name}</CardTitle>
              {webhook.description && (
                <CardDescription className="text-xs truncate">{webhook.description}</CardDescription>
              )}
            </div>
          </div>
          <Badge variant={webhook.isEnabled ? "default" : "secondary"} className="text-xs shrink-0">
            {webhook.isEnabled ? "Active" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono bg-muted rounded px-2 py-1.5">
          <span className="text-muted-foreground">{webhook.method}</span>
          <span className="truncate flex-1 text-foreground">{webhook.url}</span>
          <Button variant="ghost" size="icon" className="size-5 shrink-0" onClick={copyUrl}>
            {copied ? <CheckCircle2 className="size-3 text-green-500" /> : <Copy className="size-3" />}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {webhook.events.slice(0, 4).map((e) => (
            <Badge key={e} variant="outline" className="text-[10px]">
              {AUTOMATION_TRIGGER_LABELS[e as AutomationTriggerType] ?? e}
            </Badge>
          ))}
          {webhook.events.length > 4 && (
            <Badge variant="outline" className="text-[10px]">
              +{webhook.events.length - 4} more
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{webhook._count.deliveries.toLocaleString()} deliveries</span>
          <span>·</span>
          <span>Retry {webhook.retryLimit}×</span>
          <span>·</span>
          <span>{webhook.timeoutMs / 1000}s timeout</span>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPing} className="gap-1.5">
            <Send className="size-3.5" />
            Ping
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            className="ml-auto gap-1.5"
          >
            {webhook.isEnabled
              ? <><ToggleRight className="size-3.5" />Disable</>
              : <><ToggleLeft className="size-3.5" />Enable</>
            }
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OutboundWebhooksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OutboundWebhook | undefined>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["outbound-webhooks"],
    queryFn: async () => {
      const { data } = await axios.get<{ webhooks: OutboundWebhook[] }>("/api/webhooks/outbound");
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => axios.patch(`/api/webhooks/outbound/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      toast.success("Webhook updated");
    },
    onError: () => toast.error("Failed to update webhook"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/webhooks/outbound/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-webhooks"] });
      toast.success("Webhook deleted");
    },
    onError: () => toast.error("Failed to delete webhook"),
  });

  const pingMutation = useMutation({
    mutationFn: (id: number) => axios.post<{ status: string; responseCode: number | null; durationMs: number }>(`/api/webhooks/outbound/${id}/ping`),
    onSuccess: (resp) => {
      const { status, responseCode, durationMs } = resp.data;
      if (status === "delivered") {
        toast.success(`Ping delivered — ${responseCode} in ${durationMs}ms`);
      } else {
        toast.error(`Ping failed — ${responseCode ?? "no response"} after ${durationMs}ms`);
      }
    },
    onError: () => toast.error("Ping failed"),
  });

  const webhooks = data?.webhooks ?? [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/automations")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Outbound Webhooks</h1>
          <p className="text-sm text-muted-foreground">
            Register endpoints to receive event payloads from this platform.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditTarget(undefined); setFormOpen(true); }}>
          <Plus className="size-4 mr-1.5" />
          Register webhook
        </Button>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load webhooks" />}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <div className="mb-3 rounded-full bg-muted p-3">
            <Webhook className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No webhooks registered</p>
          <p className="text-xs text-muted-foreground mt-1">
            Register an endpoint to start receiving event payloads.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setFormOpen(true)}>
            <Plus className="size-4 mr-1.5" />
            Register webhook
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {webhooks.map((wh) => (
            <WebhookCard
              key={wh.id}
              webhook={wh}
              onEdit={() => { setEditTarget(wh); setFormOpen(true); }}
              onDelete={() => deleteMutation.mutate(wh.id)}
              onToggle={() => toggleMutation.mutate(wh.id)}
              onPing={() => pingMutation.mutate(wh.id)}
            />
          ))}
        </div>
      )}

      <WebhookFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(undefined); }}
        existing={editTarget}
      />
    </div>
  );
}
