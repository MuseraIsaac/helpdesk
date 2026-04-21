import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { createAssetSchema, type CreateAssetInput } from "core/schemas/assets.ts";
import {
  ASSET_TYPES, ASSET_STATUSES, ASSET_CONDITIONS,
  ASSET_TYPE_LABEL, ASSET_STATUS_LABEL, ASSET_CONDITION_LABEL,
} from "core/constants/assets.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Props {
  onCreated?: (id: number) => void;
  trigger?: React.ReactNode;
}

export default function NewAssetDialog({ onCreated, trigger }: Props = {}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateAssetInput>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      status:    "in_stock",
      condition: "new_item",
      currency:  "USD",
      depreciationMethod: "none",
      tags:      [],
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateAssetInput) => {
      const { data: asset } = await axios.post<{ id: number }>("/api/assets", data);
      return asset;
    },
    onSuccess: (asset) => {
      setOpen(false);
      reset();
      if (onCreated) {
        onCreated(asset.id);
      } else {
        navigate(`/assets/${asset.id}`);
      }
    },
  });

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            New Asset
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register Asset</DialogTitle>
        </DialogHeader>

        <form
          id="new-asset-form"
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4 py-2"
        >
          {mutation.error && <ErrorAlert error={mutation.error} fallback="Failed to create asset" />}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="asset-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="asset-name"
              placeholder="e.g. MacBook Pro 16-inch, Cisco ASA 5505, Microsoft 365 E3"
              {...register("name")}
            />
            {errors.name && <ErrorMessage message={errors.name.message} />}
          </div>

          {/* Type + Status + Condition */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Controller name="type" control={control} render={({ field }) => (
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select type…" /></SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{ASSET_TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
              {errors.type && <ErrorMessage message={errors.type.message} />}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller name="status" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_STATUSES.map((s) => <SelectItem key={s} value={s}>{ASSET_STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Controller name="condition" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CONDITIONS.map((c) => <SelectItem key={c} value={c}>{ASSET_CONDITION_LABEL[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>

          {/* Manufacturer + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Input placeholder="e.g. Apple, Dell, Cisco" {...register("manufacturer")} />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input placeholder="e.g. MacBook Pro M3, PowerEdge R750" {...register("model")} />
            </div>
          </div>

          {/* Serial number + Asset tag */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Serial number</Label>
              <Input placeholder="Manufacturer serial number" {...register("serialNumber")} />
            </div>
            <div className="space-y-1.5">
              <Label>Asset tag</Label>
              <Input placeholder="Internal tag (must be unique)" {...register("assetTag")} />
            </div>
          </div>

          {/* Purchase date + Price + Vendor */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Purchase date</Label>
              <Input type="date" {...register("purchaseDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Purchase price</Label>
              <Input placeholder="0.00" {...register("purchasePrice")} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Input placeholder="e.g. CDW, Insight" {...register("vendor")} />
            </div>
          </div>

          {/* Warranty expiry + Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Warranty expiry</Label>
              <Input type="date" {...register("warrantyExpiry")} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input placeholder="e.g. Server Room A, Floor 2" {...register("location")} />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="new-asset-form" disabled={mutation.isPending}>
            {mutation.isPending ? "Registering…" : "Register Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
