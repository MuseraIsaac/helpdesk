import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  portalCreateTicketSchema,
  type PortalCreateTicketInput,
} from "core/schemas/portal.ts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";

export default function PortalNewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PortalCreateTicketInput>({
    resolver: zodResolver(portalCreateTicketSchema),
  });

  const mutation = useMutation({
    mutationFn: async (data: PortalCreateTicketInput) => {
      const { data: res } = await axios.post<{ ticket: { id: number } }>(
        "/api/portal/tickets",
        data
      );
      return res.ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["portal-tickets"] });
      navigate(`/portal/tickets/${ticket.id}`, { replace: true });
    },
  });

  return (
    <div className="space-y-6 max-w-[640px]">
      <BackLink to="/portal/tickets">Back to my tickets</BackLink>

      <Card>
        <CardHeader>
          <CardTitle>Submit a support request</CardTitle>
          <CardDescription>
            Describe your issue and our team will get back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((data) => mutation.mutate(data))}
            className="space-y-4"
            noValidate
          >
            {mutation.error && (
              <ErrorAlert
                error={mutation.error}
                fallback="Failed to submit ticket. Please try again."
              />
            )}
            <div className="grid gap-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                type="text"
                placeholder="Brief summary of your issue"
                {...register("subject")}
              />
              {errors.subject && (
                <ErrorMessage message={errors.subject.message} />
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="body">Description</Label>
              <Textarea
                id="body"
                placeholder="Please describe your issue in as much detail as possible..."
                rows={6}
                {...register("body")}
              />
              {errors.body && <ErrorMessage message={errors.body.message} />}
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Submit ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
