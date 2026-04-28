import { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  prefix?: React.ReactNode;
  /** Optional secondary text rendered after the label in muted style. */
  hint?: React.ReactNode;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SearchableSelectProps {
  /** Flat options list. Mutually exclusive with `groups`. */
  options?: SelectOption[];
  /** Grouped options. When provided, renders group headers and is filtered together. */
  groups?: SelectGroup[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Extra classes applied to the trigger button. Use to set height (e.g. "h-7") or width. */
  className?: string;
  /** Optional content shown above the list (e.g. a "current user" pinned shortcut). */
  pinned?: React.ReactNode;
}

export default function SearchableSelect({
  options,
  groups,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
  className,
  pinned,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const flatOptions: SelectOption[] = groups
    ? groups.flatMap((g) => g.options)
    : (options ?? []);
  const current = flatOptions.find((o) => o.value === value);

  const term = search.trim().toLowerCase();
  const matches = (o: SelectOption) =>
    !term || o.label.toLowerCase().includes(term);

  const filteredGroups: SelectGroup[] = groups
    ? groups
        .map((g) => ({ label: g.label, options: g.options.filter(matches) }))
        .filter((g) => g.options.length > 0)
    : [];
  const filteredFlat = options ? options.filter(matches) : [];
  const totalFiltered = groups
    ? filteredGroups.reduce((n, g) => n + g.options.length, 0)
    : filteredFlat.length;

  function handleSelect(val: string) {
    onChange(val);
    setOpen(false);
    setSearch("");
  }

  function renderOption(o: SelectOption) {
    return (
      <button
        key={o.value}
        type="button"
        onClick={() => handleSelect(o.value)}
        className={cn(
          "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm cursor-pointer transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          o.value === value && "bg-accent/60 font-medium"
        )}
      >
        {o.prefix && <span className="shrink-0">{o.prefix}</span>}
        <span className="flex-1 text-left truncate">{o.label}</span>
        {o.hint && (
          <span className="text-[11px] text-muted-foreground shrink-0">{o.hint}</span>
        )}
        {o.value === value && <Check className="h-3.5 w-3.5 opacity-60 shrink-0" />}
      </button>
    );
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) setTimeout(() => inputRef.current?.focus(), 0);
    else setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs",
            "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:border-ring/50",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            {current?.prefix && <span className="shrink-0">{current.prefix}</span>}
            <span className={cn("truncate", !current && "text-muted-foreground")}>
              {current?.label ?? placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[180px] shadow-lg"
      >
        <div className="flex items-center border-b px-2.5 py-1">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground mr-2" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-8 w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && totalFiltered === 1) {
                const only = groups
                  ? filteredGroups.flatMap((g) => g.options)[0]
                  : filteredFlat[0];
                if (only) handleSelect(only.value);
              }
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {pinned && !term && (
            <>
              {pinned}
              <div className="my-1 mx-1 border-t" />
            </>
          )}
          {totalFiltered === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No results</p>
          ) : groups ? (
            filteredGroups.map((g, gi) => (
              <div key={g.label} className={cn(gi > 0 && "mt-1")}>
                <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {g.label}
                </div>
                {g.options.map(renderOption)}
              </div>
            ))
          ) : (
            filteredFlat.map(renderOption)
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
