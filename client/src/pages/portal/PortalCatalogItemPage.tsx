import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import axios from "axios";
import type { CatalogItemDetail } from "core/constants/catalog.ts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ErrorAlert from "@/components/ErrorAlert";
import CatalogFormRenderer from "@/components/CatalogFormRenderer";
import { ArrowLeft, CheckSquare, Send } from "lucide-react";

const requestSchema = z.object({
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  description: z.string().max(5000).optional(),
  formData: z.record(z.string(), z.unknown()).default({}),
});

type RequestFormValues = z.infer<typeof requestSchema>;

export default function PortalCatalogItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<{ item: CatalogItemDetail }>({
    queryKey: ["portal-catalog-item", id],
    queryFn: () => axios.get(`/api/portal/catalog/${id}`).then((r) => r.data),
  });

  const item = data?.item;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { priority: "medium", formData: {} },
  });

  const mutation = useMutation({
    mutationFn: (values: RequestFormValues) =>
      axios.post(`/api/portal/catalog/${id}/request`, values).then((r) => r.data),
    onSuccess: (data) => {
      navigate(`/portal/requests/${data.request.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return <ErrorAlert error={error} fallback="Failed to load catalog item" />;
  }

  const onSubmit = (values: RequestFormValues) => mutation.mutate(values);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/portal/catalog" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Service Catalog
        </Link>
        <span>/</span>
        <span className="text-foreground">{item.name}</span>
      </div>

      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-3xl shrink-0">
          {item.icon ?? "📦"}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{item.name}</h1>
            {item.requiresApproval && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200">
                <CheckSquare className="h-3 w-3 mr-1" />
                Approval required
              </Badge>
            )}
          </div>
          {item.shortDescription && (
            <p className="text-muted-foreground mt-1">{item.shortDescription}</p>
          )}
        </div>
      </div>

      {item.description && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
      )}

      {item.requestorInstructions && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800 p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-1">Before you submit</p>
          <p className="text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
            {item.requestorInstructions}
          </p>
        </div>
      )}

      {item.requiresApproval && (
        <div className="flex gap-2 text-sm text-muted-foreground rounded-lg border p-4 bg-muted/30">
          <CheckSquare className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <p>
            This request requires approval. You'll receive a notification once your request has been reviewed.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {item.formSchema.length > 0 && (
              <CatalogFormRenderer
                fields={item.formSchema}
                control={control}
                errors={errors}
              />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="description">Additional notes</Label>
              <Textarea
                id="description"
                placeholder="Any additional context or requirements…"
                rows={3}
                {...register("description")}
              />
            </div>

            {mutation.error && (
              <ErrorAlert error={mutation.error} fallback="Failed to submit request" />
            )}

            {mutation.isSuccess && (
              <p className="text-sm text-green-600 font-medium">
                Request submitted! Redirecting…
              </p>
            )}

            <Button type="submit" disabled={mutation.isPending} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {mutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
