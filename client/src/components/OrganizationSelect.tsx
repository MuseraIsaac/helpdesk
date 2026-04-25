/**
 * OrganizationSelect — searchable dropdown for picking an Organisation from Contacts.
 * Used by the new-ticket, new-request, new-change, and new-problem forms.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Building2, ChevronsUpDown, Check, X } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Org { id: number; name: string; industry: string | null; supportTier: string }

interface OrganizationSelectProps {
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function OrganizationSelect({
  value,
  onChange,
  placeholder = "Select organization…",
  disabled,
  className,
}: OrganizationSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["organizations-light"],
    queryFn: async () => {
      const { data } = await axios.get<{ organizations: Org[] }>("/api/organizations?pageSize=500");
      return data.organizations ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const orgs = data ?? [];
  const selected = orgs.find((o) => o.id === value);
  const filtered = search
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  function pick(org: Org | null) {
    onChange(org?.id ?? null);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2",
            "text-sm shadow-sm ring-offset-background",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{selected ? selected.name : placeholder}</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                className="rounded hover:bg-accent p-0.5 transition-colors"
                onClick={(e) => { e.stopPropagation(); pick(null); }}
                onKeyDown={(e) => e.key === "Enter" && pick(null)}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-40" />
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[220px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organisations…"
            className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent px-1"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-3">No organisations found</p>
          ) : (
            <>
              {/* Clear option */}
              <button
                type="button"
                onClick={() => pick(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                  "hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors",
                  !value && "bg-accent/60 font-medium",
                )}
              >
                <span className="text-muted-foreground italic">None</span>
                {!value && <Check className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />}
              </button>

              {filtered.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => pick(org)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                    "hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors",
                    org.id === value && "bg-accent/60 font-medium",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate">{org.name}</div>
                    {org.industry && (
                      <div className="text-[11px] text-muted-foreground truncate">{org.industry}</div>
                    )}
                  </div>
                  {org.id === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
