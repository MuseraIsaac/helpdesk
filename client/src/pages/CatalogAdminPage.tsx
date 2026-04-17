import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  createCatalogCategorySchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  type CreateCatalogCategoryInput,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from "core/schemas/catalog.ts";
import type {
  CatalogCategorySummary,
  CatalogItemSummary,
  CatalogItemDetail,
  FormField,
} from "core/constants/catalog.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ErrorAlert from "@/components/ErrorAlert";
import CatalogFormBuilder from "@/components/CatalogFormBuilder";
import {
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Tag,
  ArrowLeft,
  Settings,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentOption { id: string; name: string }
interface TeamOption { id: number; name: string; color: string }

// ── Category dialog ───────────────────────────────────────────────────────────

function CategoryDialog({
  trigger,
  category,
  onSaved,
}: {
  trigger: React.ReactNode;
  category?: CatalogCategorySummary;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCatalogCategoryInput>({
    resolver: zodResolver(createCatalogCategorySchema),
    defaultValues: category
      ? { name: category.name, description: category.description ?? "", position: category.position }
      : { name: "", description: "", position: 0, isActive: true },
  });

  const mutation = useMutation({
    mutationFn: (data: CreateCatalogCategoryInput) =>
      category
        ? axios.patch(`/api/catalog/admin/categories/${category.id}`, data)
        : axios.post("/api/catalog/admin/categories", data),
    onSuccess: () => {
      onSaved();
      setOpen(false);
      reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input placeholder="e.g. Hardware, Software, HR" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} placeholder="Optional description" {...register("description")} />
          </div>
          <div className="space-y-1.5">
            <Label>Position</Label>
            <Input type="number" min={0} {...register("position", { valueAsNumber: true })} />
          </div>
          {mutation.error && <ErrorAlert error={mutation.error} fallback="Failed to save category" />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Item dialog ───────────────────────────────────────────────────────────────

function ItemDialog({
  trigger,
  item,
  categories,
  agents,
  teams,
  onSaved,
}: {
  trigger: React.ReactNode;
  item?: CatalogItemDetail;
  categories: CatalogCategorySummary[];
  agents: AgentOption[];
  teams: TeamOption[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [formSchema, setFormSchema] = useState<FormField[]>(item?.formSchema ?? []);
  const [activeTab, setActiveTab] = useState("details");

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateCatalogItemInput | UpdateCatalogItemInput>({
    resolver: zodResolver(item ? updateCatalogItemSchema : createCatalogItemSchema),
    defaultValues: item
      ? {
          name: item.name,
          shortDescription: item.shortDescription ?? "",
          description: item.description ?? "",
          categoryId: item.category?.id,
          isActive: item.isActive,
          requestorInstructions: item.requestorInstructions ?? "",
          fulfillmentTeamId: item.fulfillmentTeam?.id,
          requiresApproval: item.requiresApproval,
          approvalMode: (item.approvalMode as "all" | "any") ?? "all",
          approverIds: item.approverIds ?? [],
          position: item.position,
          icon: item.icon ?? "",
        }
      : {
          name: "",
          shortDescription: "",
          description: "",
          isActive: true,
          requiresApproval: false,
          approvalMode: "all",
          approverIds: [],
          position: 0,
          icon: "",
          formSchema: [],
        },
  });

  const requiresApproval = watch("requiresApproval");

  const mutation = useMutation({
    mutationFn: (data: CreateCatalogItemInput | UpdateCatalogItemInput) => {
      const payload = { ...data, formSchema };
      return item
        ? axios.patch(`/api/catalog/admin/items/${item.id}`, payload)
        : axios.post("/api/catalog/admin/items", payload);
    },
    onSuccess: () => {
      onSaved();
      setOpen(false);
      reset();
      setFormSchema([]);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setActiveTab("details"); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Catalog Item" : "New Catalog Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="form">Request Form</TabsTrigger>
              <TabsTrigger value="approval">Approval</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3 space-y-1.5">
                  <Label>Name *</Label>
                  <Input placeholder="e.g. Request a Laptop" {...register("name")} />
                  {errors.name && <p className="text-xs text-destructive">{(errors.name as {message?: string}).message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Icon</Label>
                  <Input placeholder="💻" {...register("icon")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Short description</Label>
                <Input placeholder="One-line summary shown in the catalog" {...register("shortDescription")} />
              </div>
              <div className="space-y-1.5">
                <Label>Full description</Label>
                <Textarea rows={3} placeholder="Detailed description shown on the item page" {...register("description")} />
              </div>
              <div className="space-y-1.5">
                <Label>Requestor instructions</Label>
                <Textarea rows={2} placeholder="Shown as a warning before the request form (e.g. 'Get manager approval first')" {...register("requestorInstructions")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Controller
                    name="categoryId"
                    control={control}
                    render={({ field: f }) => (
                      <Select
                        value={f.value ? String(f.value) : "none"}
                        onValueChange={(v) => f.onChange(v === "none" ? undefined : Number(v))}
                      >
                        <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Uncategorized</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fulfillment team</Label>
                  <Controller
                    name="fulfillmentTeamId"
                    control={control}
                    render={({ field: f }) => (
                      <Select
                        value={f.value ? String(f.value) : "none"}
                        onValueChange={(v) => f.onChange(v === "none" ? undefined : Number(v))}
                      >
                        <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No team</SelectItem>
                          {teams.map((t) => (
                            <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Position</Label>
                  <Input type="number" min={0} {...register("position", { valueAsNumber: true })} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Controller
                    name="isActive"
                    control={control}
                    render={({ field: f }) => (
                      <Switch checked={!!f.value} onCheckedChange={f.onChange} />
                    )}
                  />
                  <Label>Active (visible in catalog)</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="form">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Define fields that requestors must fill in when submitting this service.
                </p>
                <CatalogFormBuilder value={formSchema} onChange={setFormSchema} />
              </div>
            </TabsContent>

            <TabsContent value="approval" className="space-y-4">
              <div className="flex items-center gap-3">
                <Controller
                  name="requiresApproval"
                  control={control}
                  render={({ field: f }) => (
                    <Switch checked={!!f.value} onCheckedChange={f.onChange} />
                  )}
                />
                <div>
                  <Label>Requires approval</Label>
                  <p className="text-xs text-muted-foreground">Request will be sent to approvers before fulfillment</p>
                </div>
              </div>

              {requiresApproval && (
                <>
                  <div className="space-y-1.5">
                    <Label>Approval mode</Label>
                    <Controller
                      name="approvalMode"
                      control={control}
                      render={({ field: f }) => (
                        <Select value={f.value as string ?? "all"} onValueChange={f.onChange}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All approvers must approve</SelectItem>
                            <SelectItem value="any">Any single approver can approve</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Approvers</Label>
                    <p className="text-xs text-muted-foreground">Select the agents who will receive approval requests.</p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                      <Controller
                        name="approverIds"
                        control={control}
                        render={({ field: f }) => {
                          const selected: string[] = Array.isArray(f.value) ? f.value as string[] : [];
                          return (
                            <>
                              {agents.map((a) => (
                                <div key={a.id} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id={`approver-${a.id}`}
                                    checked={selected.includes(a.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) f.onChange([...selected, a.id]);
                                      else f.onChange(selected.filter((x) => x !== a.id));
                                    }}
                                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                                  />
                                  <label htmlFor={`approver-${a.id}`} className="text-sm cursor-pointer">{a.name}</label>
                                </div>
                              ))}
                              {agents.length === 0 && (
                                <p className="text-xs text-muted-foreground py-2">No agents available</p>
                              )}
                            </>
                          );
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          {mutation.error && <ErrorAlert error={mutation.error} fallback="Failed to save item" />}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CatalogAdminPage() {
  const queryClient = useQueryClient();

  const { data: categoriesData, isLoading: catLoading } = useQuery<{ categories: CatalogCategorySummary[] }>({
    queryKey: ["catalog-admin-categories"],
    queryFn: () => axios.get("/api/catalog/admin/categories").then((r) => r.data),
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ items: CatalogItemSummary[] }>({
    queryKey: ["catalog-admin-items"],
    queryFn: () => axios.get("/api/catalog/admin/items").then((r) => r.data),
  });

  const { data: agentsData } = useQuery<{ agents: AgentOption[] }>({
    queryKey: ["agents-simple"],
    queryFn: () => axios.get("/api/agents").then((r) => r.data),
  });

  const { data: teamsData } = useQuery<{ teams: TeamOption[] }>({
    queryKey: ["teams-simple"],
    queryFn: () => axios.get("/api/teams").then((r) => r.data),
  });

  const categories = categoriesData?.categories ?? [];
  const items = itemsData?.items ?? [];
  const agents: AgentOption[] = (agentsData?.agents ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }));
  const teams: TeamOption[] = (teamsData?.teams ?? []).map((t: { id: number; name: string; color: string }) => ({ id: t.id, name: t.name, color: t.color }));

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["catalog-admin-categories"] });
    queryClient.invalidateQueries({ queryKey: ["catalog-admin-items"] });
    queryClient.invalidateQueries({ queryKey: ["catalog"] });
  };

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/catalog/admin/categories/${id}`),
    onSuccess: () => refetchAll(),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/catalog/admin/items/${id}`),
    onSuccess: () => refetchAll(),
  });

  const toggleItemMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      axios.patch(`/api/catalog/admin/items/${id}`, { isActive }),
    onSuccess: () => refetchAll(),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/catalog" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Manage Service Catalog</h1>
            <p className="text-sm text-muted-foreground">Create and edit categories and service items</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/catalog">
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            View Catalog
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">
            <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
            Items ({items.length})
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="h-3.5 w-3.5 mr-1.5" />
            Categories ({categories.length})
          </TabsTrigger>
        </TabsList>

        {/* Items tab */}
        <TabsContent value="items" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
            <ItemDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New item
                </Button>
              }
              categories={categories}
              agents={agents}
              teams={teams}
              onSaved={refetchAll}
            />
          </div>

          {itemsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => <Skeleton key={n} className="h-12" />)}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No items yet. Create one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{item.icon ?? "📦"}</span>
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.shortDescription && (
                              <div className="text-xs text-muted-foreground truncate max-w-48">
                                {item.shortDescription}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.category?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.fulfillmentTeam?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {item.requiresApproval && (
                          <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200">
                            Approval
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.isActive}
                          onCheckedChange={(v) => toggleItemMutation.mutate({ id: item.id, isActive: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <ItemDialog
                            trigger={
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            }
                            item={item as unknown as CatalogItemDetail}
                            categories={categories}
                            agents={agents}
                            teams={teams}
                            onSaved={refetchAll}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                                deleteItemMutation.mutate(item.id);
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
            </div>
          )}
        </TabsContent>

        {/* Categories tab */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
            </p>
            <CategoryDialog
              trigger={
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New category
                </Button>
              }
              onSaved={refetchAll}
            />
          </div>

          {catLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => <Skeleton key={n} className="h-12" />)}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No categories yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {categories.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cat.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {cat.slug}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{cat.position}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <CategoryDialog
                            trigger={
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            }
                            category={cat}
                            onSaved={refetchAll}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              const itemCount = items.filter((i) => i.category?.id === cat.id).length;
                              const msg = itemCount > 0
                                ? `Delete "${cat.name}"? This category has ${itemCount} item(s). They will become uncategorized.`
                                : `Delete "${cat.name}"?`;
                              if (confirm(msg)) {
                                deleteCategoryMutation.mutate(cat.id);
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
