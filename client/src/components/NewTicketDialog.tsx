import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { createTicketSchema, type CreateTicketInput } from "core/schemas/tickets.ts";
import { ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Plus } from "lucide-react";

interface Agent {
  id: string;
  name: string;
}

export default function NewTicketDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data;
    },
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateTicketInput) => {
      const { data: ticket } = await axios.post("/api/tickets", data);
      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setOpen(false);
      reset();
    },
  });

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (!value) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1.5" />
          New Ticket
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Ticket</DialogTitle>
        </DialogHeader>

        <form
          id="new-ticket-form"
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="space-y-4 py-2"
        >
          {createMutation.error && (
            <ErrorAlert error={createMutation.error} fallback="Failed to create ticket" />
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="subject">
              Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject"
              placeholder="Brief summary of the issue"
              {...register("subject")}
            />
            {errors.subject && <ErrorMessage message={errors.subject.message} />}
          </div>

          {/* Sender Name + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="senderName">
                Sender Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="senderName"
                placeholder="John Smith"
                {...register("senderName")}
              />
              {errors.senderName && <ErrorMessage message={errors.senderName.message} />}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senderEmail">
                Sender Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="senderEmail"
                type="email"
                placeholder="john@example.com"
                {...register("senderEmail")}
              />
              {errors.senderEmail && <ErrorMessage message={errors.senderEmail.message} />}
            </div>
          </div>

          {/* Category + Assigned To */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(val) =>
                      field.onChange(val === "none" ? null : val)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {ticketCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {categoryLabel[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.category && <ErrorMessage message={errors.category.message} />}
            </div>

            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Controller
                name="assignedToId"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "unassigned"}
                    onValueChange={(val) =>
                      field.onChange(val === "unassigned" ? null : val)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {agentsData?.agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="body">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              placeholder="Describe the issue in detail..."
              rows={5}
              {...register("body")}
            />
            {errors.body && <ErrorMessage message={errors.body.message} />}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-ticket-form"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
