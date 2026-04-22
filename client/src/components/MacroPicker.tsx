import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { type Macro } from "core/constants/macro.ts";
import { categoryLabel, type TicketCategory } from "core/constants/ticket-category.ts";
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
import { Search, BookOpen, Globe, Lock, Shield, Zap } from "lucide-react";

interface MacroPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (resolvedBody: string) => void;
  context: MacroContext;
}

const CATEGORY_ORDER: (TicketCategory | "__none__")[] = [
  "general_question",
  "technical_question",
  "refund_request",
  "__none__",
];

const CATEGORY_LABELS: Record<string, string> = {
  general_question: categoryLabel.general_question,
  technical_question: categoryLabel.technical_question,
  refund_request: categoryLabel.refund_request,
  __none__: "Uncategorised",
};

function VisibilityIcon({ macro }: { macro: Macro }) {
  if (macro.isSystem) return <Shield className="h-3 w-3 text-violet-500 shrink-0" />;
  if (macro.visibility === "personal") return <Lock className="h-3 w-3 text-amber-500 shrink-0" />;
  return <Globe className="h-3 w-3 text-blue-500 shrink-0" />;
}

export default function MacroPicker({ open, onClose, onSelect, context }: MacroPickerProps) {
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<number | null>(null);

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
    return m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q);
  });

  // Group by category
  const grouped = new Map<string, Macro[]>();
  for (const macro of macros) {
    const key = macro.category ?? "__none__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(macro);
  }

  const orderedKeys = CATEGORY_ORDER.filter((k) => grouped.has(k));
  // any remaining categories not in the order list
  for (const k of grouped.keys()) {
    if (!orderedKeys.includes(k as any)) orderedKeys.push(k as any);
  }

  const hoveredMacro = hovered ? (data ?? []).find((m) => m.id === hovered) : null;

  function handleSelect(macro: Macro) {
    onSelect(resolveMacroBody(macro.body, context));
    setSearch("");
    setHovered(null);
    onClose();
  }

  function handleClose() {
    setSearch("");
    setHovered(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="p-1 rounded-md bg-primary/10">
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
            Insert Macro
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[440px]">
          {/* Left: list */}
          <div className="flex-1 flex flex-col border-r border-border/60 min-w-0">
            {/* Search */}
            <div className="px-3 py-2.5 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search macros…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-muted/30 border-0 focus-visible:ring-1"
                />
              </div>
            </div>

            {/* Macro list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {isLoading && (
                <div className="space-y-1 p-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              )}

              {!isLoading && macros.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {search ? "No macros match your search." : "No macros available."}
                  </p>
                </div>
              )}

              {!isLoading && orderedKeys.map((catKey) => {
                const items = grouped.get(catKey);
                if (!items?.length) return null;
                return (
                  <div key={catKey}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2 mb-1">
                      {CATEGORY_LABELS[catKey] ?? catKey}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((macro) => (
                        <button
                          key={macro.id}
                          type="button"
                          onClick={() => handleSelect(macro)}
                          onMouseEnter={() => setHovered(macro.id)}
                          onMouseLeave={() => setHovered(null)}
                          className={`
                            w-full text-left rounded-lg px-3 py-2.5 transition-all duration-100 group
                            ${hovered === macro.id
                              ? "bg-primary/10 ring-1 ring-primary/20"
                              : "hover:bg-accent"
                            }
                          `}
                        >
                          <div className="flex items-center gap-2">
                            <VisibilityIcon macro={macro} />
                            <span className="text-sm font-medium truncate flex-1">
                              {macro.title}
                            </span>
                            {macro.isSystem && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-violet-500/30 text-violet-600 dark:text-violet-400 shrink-0">
                                System
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 ml-5 leading-relaxed">
                            {macro.body.split("\n")[0]}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: preview */}
          <div className="w-64 shrink-0 flex flex-col bg-muted/20">
            {hoveredMacro ? (
              <div className="flex flex-col h-full">
                <div className="px-4 pt-3 pb-2 border-b border-border/50">
                  <p className="text-xs font-semibold text-foreground line-clamp-2">{hoveredMacro.title}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {hoveredMacro.category && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {categoryLabel[hoveredMacro.category]}
                      </Badge>
                    )}
                    {hoveredMacro.isSystem && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-500/30 text-violet-600 dark:text-violet-400">
                        System
                      </Badge>
                    )}
                    {hoveredMacro.visibility === "personal" && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400">
                        Personal
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {resolveMacroBody(hoveredMacro.body, context)}
                  </p>
                </div>
                <div className="px-4 py-3 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => handleSelect(hoveredMacro)}
                    className="w-full py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Insert this macro
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                <BookOpen className="h-6 w-6 text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  Hover a macro to preview how it will look
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20 flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-violet-500" /> System</span>
            <span className="flex items-center gap-1"><Globe className="h-3 w-3 text-blue-500" /> Global</span>
            <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-amber-500" /> Personal</span>
          </div>
          <p className="text-[11px] text-muted-foreground ml-auto">
            Variables like <code className="font-mono bg-background border rounded px-1">{"{{customer_name}}"}</code> are auto-filled.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
