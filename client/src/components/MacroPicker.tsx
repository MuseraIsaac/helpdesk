import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { type Macro } from "core/constants/macro.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { type MacroContext, resolveMacroBody } from "@/lib/macro-variables";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, BookOpen } from "lucide-react";

interface MacroPickerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the resolved body text ready to insert into the composer */
  onSelect: (resolvedBody: string) => void;
  context: MacroContext;
}

export default function MacroPicker({ open, onClose, onSelect, context }: MacroPickerProps) {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["macros"],
    queryFn: async () => {
      const { data } = await axios.get<{ macros: Macro[] }>("/api/macros");
      return data.macros;
    },
    enabled: open,
  });

  const macros = (data ?? []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q)
    );
  });

  function handleSelect(macro: Macro) {
    onSelect(resolveMacroBody(macro.body, context));
    setSearch("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSearch(""); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Insert Macro
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search macros..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto -mx-1 space-y-1">
          {isLoading && (
            <div className="space-y-2 px-1 pt-1">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!isLoading && macros.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? "No macros match your search." : "No macros available."}
            </p>
          )}

          {macros.map((macro) => (
            <button
              key={macro.id}
              type="button"
              onClick={() => handleSelect(macro)}
              className="w-full text-left rounded-md px-3 py-2.5 hover:bg-accent transition-colors group"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium group-hover:text-foreground">
                  {macro.title}
                </span>
                {macro.category && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {categoryLabel[macro.category]}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {macro.body}
              </p>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground border-t pt-3">
          Variables like <code className="font-mono bg-muted px-1 rounded">{"{{customer_name}}"}</code> are
          filled in automatically. You can edit the text before sending.
        </p>
      </DialogContent>
    </Dialog>
  );
}
