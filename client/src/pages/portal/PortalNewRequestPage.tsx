import { useNavigate } from "react-router";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  portalCreateRequestSchema,
  type PortalCreateRequestInput,
} from "core/schemas/requests.ts";
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
import { Plus, Trash2 } from "lucide-react";

export default function PortalNewRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PortalCreateRequestInput>({
    resolver: zodResolver(portalCreateRequestSchema),
    defaultValues: {
      formData: {},
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const mutation = useMutation({
    mutationFn: async (data: PortalCreateRequestInput) => {
      const { data: res } = await axios.post<{ request: { id: number } }>(
        "/api/portal/requests",
        data
      );
      return res.request;
    },
    onSuccess: (request) => {
      queryClient.invalidateQueries({ queryKey: ["portal-requests"] });
      navigate(`/portal/requests/${request.id}`);
    },
  });

  return (
    <div className="space-y-6">
      <BackLink to="/portal/requests">Back to my requests</BackLink>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Service Request</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit a request for IT services, equipment, or access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request Details</CardTitle>
          <CardDescription>
            Describe what you need and provide as much context as possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((d) => mutation.mutate(d))}
            className="space-y-5"
          >
            {mutation.error && (
              <ErrorAlert error={mutation.error} fallback="Failed to submit request" />
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="title">
                What do you need?{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g. New laptop, VPN access, Software license"
                {...register("title")}
              />
              {errors.title && <ErrorMessage message={errors.title.message} />}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Details</Label>
              <Textarea
                id="description"
                placeholder="Provide any relevant details, justification, or requirements…"
                rows={4}
                {...register("description")}
              />
            </div>

            {/* Catalog item name — free-text until catalog picker is built */}
            <div className="space-y-1.5">
              <Label htmlFor="catalogItemName">Service Category</Label>
              <Input
                id="catalogItemName"
                placeholder="e.g. Hardware, Software, Access & Permissions"
                {...register("catalogItemName")}
              />
              <p className="text-xs text-muted-foreground">
                Optional — helps route your request to the right team.
              </p>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items (optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => append({ name: "", quantity: 1, formData: {} })}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add item
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use items to specify individual products or quantities (e.g. 3 monitors, 2 keyboards).
              </p>
              {fields.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Input
                          placeholder="Item name *"
                          {...register(`items.${index}.name`)}
                          className="h-8 text-sm"
                        />
                        {errors.items?.[index]?.name && (
                          <ErrorMessage message={errors.items[index]?.name?.message} />
                        )}
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          min={1}
                          placeholder="Qty"
                          {...register(`items.${index}.quantity`, {
                            valueAsNumber: true,
                          })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          placeholder="Unit"
                          {...register(`items.${index}.unit`)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Submitting…" : "Submit Request"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/portal/requests")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
