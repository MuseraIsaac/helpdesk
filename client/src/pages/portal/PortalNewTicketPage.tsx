import { useState, useCallback } from "react";
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
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import BackLink from "@/components/BackLink";
import ArticleSuggestions from "@/components/ArticleSuggestions";
import RichTextEditor from "@/components/RichTextEditor";

export default function PortalNewTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PortalCreateTicketInput>({
    resolver: zodResolver(portalCreateTicketSchema),
    defaultValues: { body: " " }, // satisfy schema min(1) — actual value comes from editor
  });

  const handleBodyChange = useCallback((html: string, text: string) => {
    setBodyHtml(html);
    setBodyText(text);
  }, []);

  const subject = watch("subject") ?? "";
  const suggestionQuery = `${subject} ${bodyText}`.trim();

  const mutation = useMutation({
    mutationFn: async (data: PortalCreateTicketInput) => {
      const { data: res } = await axios.post<{ ticket: { id: number } }>(
        "/api/portal/tickets",
        { ...data, body: bodyText, bodyHtml }
      );
      return res.ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["portal-tickets"] });
      navigate(`/portal/tickets/${ticket.id}`, { replace: true });
    },
  });

  const canSubmit = bodyText.trim().length > 0 && !mutation.isPending;

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
            <ArticleSuggestions query={suggestionQuery} />
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
              <Label>Description</Label>
              <RichTextEditor
                content={bodyHtml}
                onChange={handleBodyChange}
                placeholder="Please describe your issue in as much detail as possible…"
                minHeight="140px"
              />
              {!bodyText.trim() && mutation.isError && (
                <p className="text-sm text-destructive">Description is required</p>
              )}
            </div>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? "Submitting…" : "Submit ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
