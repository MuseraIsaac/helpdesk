import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createQueueSchema,
  type CreateQueueInput,
  updateQueueSchema,
  type UpdateQueueInput,
  setQueueMembersSchema,
  type SetQueueMembersInput,
} from "core/schemas/queues.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Users, Plus } from "lucide-react";

interface Queue {
  id: number;
  name: string;
  description: string | null;
  color: string;
  ticketCount: number;
  memberCount: number;
  createdAt: string;
}

interface QueueDetail extends Queue {
  members: { id: string; name: string; email: string; role: string }[];
}

interface Agent {
  id: string;
  name: string;
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────

interface QueueFormDialogProps {
  queue?: QueueDetail | null;
  onClose: () => void;
}

function QueueFormDialog({ queue, onClose }: QueueFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(queue);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateQueueInput>({
    resolver: zodResolver(isEdit ? updateQueueSchema : createQueueSchema),
    defaultValues: {
      name: queue?.name ?? "",
      description: queue?.description ?? "",
      color: queue?.color ?? "#6366f1",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateQueueInput | UpdateQueueInput) => {
      if (isEdit && queue) {
        const { data: res } = await axios.patch(`/api/queues/${queue.id}`, data);
        return res;
      }
      const { data: res } = await axios.post("/api/queues", data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queues"] });
      onClose();
    },
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit Queue" : "New Queue"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 mt-2">
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} queue`} />
        )}
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <Input {...register("name")} placeholder="e.g. Billing Support" />
          {errors.name && <ErrorMessage message={errors.name.message} />}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            {...register("description")}
            placeholder="Optional description of this queue's purpose"
            rows={2}
          />
          {errors.description && <ErrorMessage message={errors.description.message} />}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              {...register("color")}
              className="h-9 w-12 cursor-pointer rounded border p-0.5"
            />
            <Input {...register("color")} placeholder="#6366f1" className="font-mono" />
          </div>
          {errors.color && <ErrorMessage message={errors.color.message} />}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Queue"}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

// ── Members dialog ────────────────────────────────────────────────────────────

interface MembersDialogProps {
  queue: QueueDetail;
  onClose: () => void;
}

function MembersDialog({ queue, onClose }: MembersDialogProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(queue.members.map((m) => m.id))
  );

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: SetQueueMembersInput) => {
      const { data: res } = await axios.put(`/api/queues/${queue.id}/members`, data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queues"] });
      queryClient.invalidateQueries({ queryKey: ["queue", queue.id] });
      onClose();
    },
  });

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Members — {queue.name}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        Select agents who belong to this queue. Membership is used for display and future auto-assignment rules.
      </p>
      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback="Failed to update members" />
      )}
      <div className="mt-2 space-y-1 max-h-72 overflow-y-auto">
        {(agentsData?.agents ?? []).map((agent) => (
          <label
            key={agent.id}
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(agent.id)}
              onChange={() => toggle(agent.id)}
              className="h-4 w-4 rounded"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{agent.name}</p>
            </div>
          </label>
        ))}
        {agentsData && agentsData.agents.length === 0 && (
          <p className="text-sm text-muted-foreground px-3 py-2">No agents found.</p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({ memberIds: Array.from(selectedIds) })
          }
        >
          {mutation.isPending ? "Saving..." : "Save Members"}
        </Button>
      </div>
    </DialogContent>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function QueuesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editQueue, setEditQueue] = useState<QueueDetail | null>(null);
  const [membersQueue, setMembersQueue] = useState<QueueDetail | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["queues"],
    queryFn: async () => {
      const { data } = await axios.get<{ queues: Queue[] }>("/api/queues");
      return data.queues;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`/api/queues/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queues"] });
    },
  });

  async function openEdit(queue: Queue) {
    const { data } = await axios.get<{ queue: QueueDetail }>(`/api/queues/${queue.id}`);
    setEditQueue(data.queue);
  }

  async function openMembers(queue: Queue) {
    const { data } = await axios.get<{ queue: QueueDetail }>(`/api/queues/${queue.id}`);
    setMembersQueue(data.queue);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Queues</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage support inboxes and team queues for ticket routing.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Queue
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load queues" />}

      {!isLoading && data?.length === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">No queues yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create a queue to organize tickets by team or support channel.
            </p>
            <Button variant="outline" className="mt-1 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New Queue
            </Button>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">All Queues</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Tickets</TableHead>
                <TableHead className="text-center">Members</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((queue) => (
                <TableRow key={queue.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: queue.color }}
                      />
                      {queue.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {queue.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{queue.ticketCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{queue.memberCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Manage members"
                        onClick={() => openMembers(queue)}
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Edit queue"
                        onClick={() => openEdit(queue)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Delete queue"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete queue "${queue.name}"? Tickets will not be deleted.`)) {
                            deleteMutation.mutate(queue.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {createOpen && <QueueFormDialog onClose={() => setCreateOpen(false)} />}
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editQueue !== null} onOpenChange={(open) => !open && setEditQueue(null)}>
        {editQueue && (
          <QueueFormDialog queue={editQueue} onClose={() => setEditQueue(null)} />
        )}
      </Dialog>

      {/* Members dialog */}
      <Dialog open={membersQueue !== null} onOpenChange={(open) => !open && setMembersQueue(null)}>
        {membersQueue && (
          <MembersDialog queue={membersQueue} onClose={() => setMembersQueue(null)} />
        )}
      </Dialog>
    </div>
  );
}
