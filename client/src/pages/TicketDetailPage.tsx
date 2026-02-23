import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type TicketStatus, ticketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { type TicketCategory, ticketCategories, categoryLabel } from "core/constants/ticket-category.ts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";

interface TicketDetail {
  id: number;
  subject: string;
  body: string;
  bodyHtml: string | null;
  status: TicketStatus;
  category: TicketCategory | null;
  senderName: string;
  senderEmail: string;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Agent {
  id: string;
  name: string;
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data } = await axios.get<TicketDetail>(`/api/tickets/${id}`);
      return data;
    },
  });

  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await axios.patch<TicketDetail>(
        `/api/tickets/${id}`,
        body
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    },
  });

  return (
    <div className="space-y-6">
      <Link
        to="/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tickets
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-96" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {axios.isAxiosError(error) && error.response?.status === 404
              ? "Ticket not found"
              : "Failed to load ticket"}
          </AlertDescription>
        </Alert>
      )}

      {ticket && (
        <div className="grid grid-cols-[1fr_auto] gap-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">{ticket.subject}</h1>
              <div className="mt-2 space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">From: </span>
                  {ticket.senderName} ({ticket.senderEmail})
                </div>
                <div>
                  <span className="text-muted-foreground">Created: </span>
                  {new Date(ticket.createdAt).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Updated: </span>
                  {new Date(ticket.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Message</CardTitle>
                <CardDescription>
                  From {ticket.senderName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ticket.bodyHtml ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: ticket.bodyHtml }}
                  />
                ) : (
                  <p className="whitespace-pre-wrap">{ticket.body}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="w-48 space-y-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground">Status</span>
              <Select
                value={ticket.status}
                onValueChange={(value) =>
                  updateMutation.mutate({ status: value })
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ticketStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground">Category</span>
              <Select
                value={ticket.category ?? "none"}
                onValueChange={(value) =>
                  updateMutation.mutate({
                    category: value === "none" ? null : value,
                  })
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
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
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground">Assigned To</span>
              <Select
                value={ticket.assignedTo?.id ?? "unassigned"}
                onValueChange={(value) =>
                  updateMutation.mutate({
                    assignedToId: value === "unassigned" ? null : value,
                  })
                }
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
