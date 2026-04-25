import { useState, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  prefix?: React.ReactNode;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Extra classes applied to the trigger button. Use to set height (e.g. "h-7") or width. */
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const current = options.find((o) => o.value === value);
  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  function handleSelect(val: string) {
    onChange(val);
    setOpen(false);
    setSearch("");
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
              if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0]!.value);
            }}
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No results</p>
          ) : (
            filtered.map((o) => (
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
                <span className="flex-1 text-left">{o.label}</span>
                {o.value === value && <Check className="h-3.5 w-3.5 opacity-60 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
