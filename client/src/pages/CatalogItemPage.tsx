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
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import ErrorAlert from "@/components/ErrorAlert";
import CatalogFormRenderer from "@/components/CatalogFormRenderer";
import { ArrowLeft, ShoppingBag, CheckSquare, Users, Send } from "lucide-react";

const requestSchema = z.object({
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  description: z.string().max(5000).optional(),
  formData: z.record(z.string(), z.unknown()).default({}),
});

type RequestFormValues = z.infer<typeof requestSchema>;

export default function CatalogItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // The server returns the catalog item directly (`res.json(item)` in
  // routes/catalog.ts), not wrapped in `{ item }`. Reading `data.item`
  // resolved to undefined and the page short-circuited into the
  // "Failed to load catalog item" branch even on a 200 response.
  const { data: item, isLoading, error } = useQuery<CatalogItemDetail>({
    queryKey: ["catalog-item", id],
    queryFn: () => axios.get<CatalogItemDetail>(`/api/catalog/items/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { priority: "medium", formData: {} },
  });

  const priority = watch("priority");

  // Server responds with the created Request directly (status 201), not
  // wrapped in `{ request }` — match its shape so we can navigate to
  // /requests/<id> after submission.
  const mutation = useMutation({
    mutationFn: (values: RequestFormValues) =>
      axios.post<{ id: number }>(`/api/catalog/items/${id}/request`, values).then((r) => r.data),
    onSuccess: (request) => {
      navigate(`/requests/${request.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="p-6">
        <ErrorAlert error={error} fallback="Failed to load catalog item" />
      </div>
    );
  }

  const onSubmit = (values: RequestFormValues) => mutation.mutate(values);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/catalog" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" />
          Service Catalog
        </Link>
        <span>/</span>
        <span className="text-foreground">{item.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-3xl shrink-0">
          {item.icon ?? "📦"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold">{item.name}</h1>
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
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {item.category && (
              <span className="flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" />
                {item.category.name}
              </span>
            )}
            {item.fulfillmentTeam && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Fulfilled by {item.fulfillmentTeam.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Description + instructions */}
        <div className="lg:col-span-1 space-y-4">
          {item.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">About this service</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
              </CardContent>
            </Card>
          )}
          {item.requestorInstructions && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-800 dark:text-amber-400">Before you submit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                  {item.requestorInstructions}
                </p>
              </CardContent>
            </Card>
          )}
          {item.requiresApproval && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex gap-2 text-sm text-muted-foreground">
                  <CheckSquare className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <p>
                    This request requires approval before fulfillment. You'll be notified once a decision is made.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Request form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit a request</CardTitle>
              {item.formSchema.length === 0 && (
                <CardDescription>No additional information required.</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Dynamic fields */}
                {item.formSchema.length > 0 && (
                  <CatalogFormRenderer
                    fields={item.formSchema}
                    control={control}
                    errors={errors}
                  />
                )}

                {/* Priority */}
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setValue("priority", v as RequestFormValues["priority"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional notes */}
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

                <Button type="submit" disabled={mutation.isPending} className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  {mutation.isPending ? "Submitting…" : "Submit request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
