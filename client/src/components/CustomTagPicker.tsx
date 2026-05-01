/**
 * CustomTagPicker — a select-style dropdown that combines a fixed list of
 * built-in options with a list of admin-defined custom entries fetched from
 * the server, plus an inline "+ Add new…" affordance that creates a new
 * custom entry via POST and selects it.
 *
 * Used by:
 *  - SaaSSubscriptionsPage      (categories — built-ins from SAAS_CATEGORIES,
 *                                customs from /api/saas-categories)
 *  - SoftwareLicensesPage       (license types — built-ins from
 *                                SOFTWARE_LICENSE_TYPES, customs from
 *                                /api/license-types)
 *
 * Selection model:
 *  - Built-in selected → caller stores the enum value (e.g. "devtools") and
 *    null for the customId.
 *  - Custom selected   → caller stores the customId and a fallback enum
 *    value (typically "other").
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel, SelectSeparator,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ErrorAlert from "@/components/ErrorAlert";
import { Plus, Tag, Sparkles } from "lucide-react";

interface CustomEntry {
  id:       number;
  name:     string;
  color:    string | null;
  isActive: boolean;
}

export type CustomTagSelection =
  | { kind: "builtin"; value: string }
  | { kind: "custom";  id: number; name: string };

interface CustomTagPickerProps {
  /** API base for the custom collection — e.g. "/api/saas-categories". */
  endpoint: string;
  /** Cache key root for React Query. */
  queryKey: string;
  /** Built-in options (always rendered first). */
  builtins: { value: string; label: string }[];
  /** Currently selected built-in value (e.g. "devtools") — used when no customId is set. */
  builtinValue: string;
  /** Currently selected custom-entry id, or null. Custom selection trumps built-in. */
  customId: number | null;
  /** Fired with the new selection. */
  onChange: (sel: CustomTagSelection) => void;
  /** Singular noun for dialog copy ("category", "license type"). */
  noun: string;
  /** Disable while a parent mutation is in flight. */
  disabled?: boolean;
  /** Trigger-button height — mirrors the consuming page's other controls. */
  triggerClassName?: string;
}

const ADD_SENTINEL = "__add_new__";

export default function CustomTagPicker({
  endpoint, queryKey, builtins, builtinValue, customId,
  onChange, noun, disabled, triggerClassName,
}: CustomTagPickerProps) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftName, setDraftName]   = useState("");
  const [draftColor, setDraftColor] = useState("");

  // Fetch custom entries (active only — inactive ones stay in DB but are
  // hidden from new pickers).
  const { data: customs = [], isLoading } = useQuery<CustomEntry[]>({
    queryKey: [queryKey],
    queryFn: () => axios.get<{ items: CustomEntry[] }>(endpoint).then((r) => r.data.items),
    staleTime: 60_000,
  });
  const activeCustoms = customs.filter((c) => c.isActive);

  // Current selection — encoded as the actual <select> value:
  //   - "custom_<id>" when a custom is active
  //   - "<enum>"      when a built-in is active
  const selectValue = customId != null ? `custom_${customId}` : builtinValue;

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; color: string | null }) => {
      const { data } = await axios.post<{ item: CustomEntry }>(endpoint, body);
      return data.item;
    },
    onSuccess: (item) => {
      // Refresh the list and select the new entry
      qc.setQueryData<CustomEntry[]>([queryKey], (prev) => [...(prev ?? []), item]);
      onChange({ kind: "custom", id: item.id, name: item.name });
      setDialogOpen(false);
      setDraftName("");
      setDraftColor("");
    },
  });

  function handleSelect(value: string) {
    if (value === ADD_SENTINEL) {
      setDialogOpen(true);
      return;
    }
    if (value.startsWith("custom_")) {
      const id = Number(value.replace("custom_", ""));
      const entry = activeCustoms.find((c) => c.id === id);
      if (!entry) return;
      onChange({ kind: "custom", id, name: entry.name });
      return;
    }
    onChange({ kind: "builtin", value });
  }

  function handleCreate() {
    const name = draftName.trim();
    if (!name) return;
    createMutation.mutate({
      name,
      color: draftColor.trim() || null,
    });
  }

  return (
    <>
      <Select value={selectValue} onValueChange={handleSelect} disabled={disabled || isLoading}>
        <SelectTrigger className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Built-in
            </SelectLabel>
            {builtins.map((b) => (
              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
            ))}
          </SelectGroup>
          {activeCustoms.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                  Custom
                </SelectLabel>
                {activeCustoms.map((c) => (
                  <SelectItem key={c.id} value={`custom_${c.id}`}>
                    <span className="inline-flex items-center gap-1.5">
                      {c.color && (
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      )}
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
          <SelectSeparator />
          <SelectItem value={ADD_SENTINEL} className="text-primary font-medium">
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add new {noun}…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); createMutation.reset(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 shrink-0">
                <Tag className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </span>
              <div>
                <DialogTitle className="text-base capitalize">Add new {noun}</DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Custom {noun}s appear under the built-in list everywhere this picker is used.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-xs flex items-center gap-1">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cat-name"
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && draftName.trim()) handleCreate(); }}
                placeholder={`e.g. ${noun === "category" ? "AI & ML" : "Enterprise Agreement"}`}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-color" className="text-xs flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                Colour
                <span className="text-[10px] font-normal text-muted-foreground/70 ml-auto">optional</span>
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draftColor || "#7c3aed"}
                  onChange={(e) => setDraftColor(e.target.value)}
                  className="h-8 w-12 rounded border border-input cursor-pointer"
                  aria-label="Pick colour"
                />
                <Input
                  id="cat-color"
                  value={draftColor}
                  onChange={(e) => setDraftColor(e.target.value)}
                  placeholder="#7c3aed"
                  maxLength={20}
                  className="flex-1 font-mono text-xs"
                />
              </div>
            </div>

            {createMutation.error && (
              <ErrorAlert error={createMutation.error} fallback={`Failed to create ${noun}`} />
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!draftName.trim() || createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending
                ? <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                    Creating…
                  </>
                : <>
                    <Plus className="h-3.5 w-3.5" />
                    Create {noun}
                  </>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
