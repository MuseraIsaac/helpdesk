import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { createTicketTypeSchema, updateTicketTypeSchema } from "core/schemas/ticket-types.ts";
import type { CreateTicketTypeInput, UpdateTicketTypeInput } from "core/schemas/ticket-types.ts";
import { Tag, Pencil, Trash2, Settings2, ArrowRight, Plus, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketTypeConfig {
  id:             number;
  name:           string;
  slug:           string;
  description:    string | null;
  color:          string;
  isActive:       boolean;
  createdAt:      string;
  formDefinition: { id: number; updatedAt: string } | null;
}

// ─── Color picker ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#6366f1", "#3b82f6", "#0ea5e9", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6",
  "#64748b", "#1d4ed8", "#059669", "#dc2626",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`h-7 w-7 rounded-full border-2 transition-all ${
              value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded-full border shrink-0"
          style={{ backgroundColor: value }}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          className="h-7 text-xs font-mono w-32"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  onSuccess: (slug: string, name: string) => void;
}

function CreateTicketTypeForm({ onSuccess }: CreateFormProps) {
  const [color, setColor] = useState("#6366f1");

  const form = useForm<CreateTicketTypeInput>({
    resolver: zodResolver(createTicketTypeSchema),
    defaultValues: { name: "", description: "", color: "#6366f1" },
  });

  const mutation = useMutation({
    mutationFn: async (payload: CreateTicketTypeInput) => {
      const { data } = await axios.post<{ ticketType: TicketTypeConfig; formBuilderUrl: string }>(
        "/api/ticket-types",
        { ...payload, color }
      );
      return data;
    },
    onSuccess: (data) => {
      onSuccess(data.ticketType.slug, data.ticketType.name);
    },
  });

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate({ ...d, color }))} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input {...form.register("name")} placeholder="e.g. Hardware Request, Software Issue" />
        {form.formState.errors.name && (
          <ErrorMessage message={form.formState.errors.name.message} />
        )}
        <p className="text-[11px] text-muted-foreground">
          A URL-safe slug is auto-generated from the name.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          {...form.register("description")}
          placeholder="Briefly describe when agents should use this type…"
          className="min-h-[80px] resize-none text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to create ticket type" />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create Ticket Type"}
        </Button>
      </div>
    </form>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  ticketType: TicketTypeConfig;
  onSuccess: () => void;
}

function EditTicketTypeForm({ ticketType, onSuccess }: EditFormProps) {
  const queryClient = useQueryClient();
  const [color, setColor] = useState(ticketType.color);

  const form = useForm<UpdateTicketTypeInput>({
    resolver: zodResolver(updateTicketTypeSchema),
    defaultValues: {
      name:        ticketType.name,
      description: ticketType.description ?? "",
      isActive:    ticketType.isActive,
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: UpdateTicketTypeInput) => {
      const { data } = await axios.put(`/api/ticket-types/${ticketType.id}`, { ...payload, color });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-types"] });
      queryClient.invalidateQueries({ queryKey: ["dict", "ticket-types"] });
      onSuccess();
    },
  });

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate({ ...d, color }))} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input {...form.register("name")} />
        {form.formState.errors.name && (
          <ErrorMessage message={form.formState.errors.name.message} />
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          {...form.register("description")}
          className="min-h-[80px] resize-none text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          className="accent-primary"
          {...form.register("isActive")}
        />
        <label htmlFor="isActive" className="text-sm cursor-pointer select-none">
          Active (visible to agents when creating tickets)
        </label>
      </div>

      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to update ticket type" />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

// ─── Post-creation banner ─────────────────────────────────────────────────────

interface CreatedBannerProps {
  name: string;
  slug: string;
  onDismiss: () => void;
}

function CreatedBanner({ name, slug, onDismiss }: CreatedBannerProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
      <CircleDot className="h-5 w-5 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          <strong>{name}</strong> was created successfully.
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Head to the Form Builder to customize which fields agents see when using this ticket type.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => navigate(`/admin/forms?ticketType=${slug}`)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Customize Form
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── TicketTypesPage ──────────────────────────────────────────────────────────

export default function TicketTypesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TicketTypeConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketTypeConfig | null>(null);
  const [justCreated, setJustCreated] = useState<{ slug: string; name: string } | null>(null);

  const { data, isLoading, error } = useQuery<{ ticketTypes: TicketTypeConfig[] }>({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get("/api/ticket-types");
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/ticket-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-types"] });
      queryClient.invalidateQueries({ queryKey: ["dict", "ticket-types"] });
      setDeleteTarget(null);
    },
  });

  function handleCreated(slug: string, name: string) {
    queryClient.invalidateQueries({ queryKey: ["ticket-types"] });
      queryClient.invalidateQueries({ queryKey: ["dict", "ticket-types"] });
    setCreateOpen(false);
    setJustCreated({ slug, name });
  }

  const ticketTypes = data?.ticketTypes ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Ticket Types</h1>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => { setCreateOpen(true); setJustCreated(null); }}
        >
          <Plus className="h-3.5 w-3.5" />
          New Ticket Type
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Define custom ticket types for your helpdesk. Each type gets its own form layout that
        agents see when creating tickets.
      </p>

      {justCreated && (
        <div className="mb-6">
          <CreatedBanner
            name={justCreated.name}
            slug={justCreated.slug}
            onDismiss={() => setJustCreated(null)}
          />
        </div>
      )}

      {error && <ErrorAlert message="Failed to load ticket types" />}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : ticketTypes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Tag className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No ticket types yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Create your first ticket type to let agents categorize tickets more precisely.
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Ticket Type
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {ticketTypes.map((tt) => (
            <div
              key={tt.id}
              className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${
                !tt.isActive ? "opacity-60 bg-muted/30" : "bg-background"
              }`}
            >
              {/* Color dot */}
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: tt.color }}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{tt.name}</span>
                  <code className="text-[10px] text-muted-foreground font-mono bg-muted border rounded px-1.5 py-0.5">
                    {tt.slug}
                  </code>
                  {!tt.isActive && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      Inactive
                    </Badge>
                  )}
                  {tt.formDefinition ? (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-primary border-primary/30">
                      Form customized
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                      Default form
                    </Badge>
                  )}
                </div>
                {tt.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{tt.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground"
                  onClick={() => navigate(`/admin/forms?ticketType=${tt.slug}`)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Form Builder
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditTarget(tt)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(tt)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Ticket Type</DialogTitle>
          </DialogHeader>
          <CreateTicketTypeForm onSuccess={handleCreated} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ticket Type</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <EditTicketTypeForm
              key={editTarget.id}
              ticketType={editTarget}
              onSuccess={() => setEditTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); deleteMutation.reset(); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ticket type?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> and its form definition will be permanently
              deleted. Existing tickets that use this type will not be affected, but the type
              will no longer be selectable. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete ticket type" />}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
