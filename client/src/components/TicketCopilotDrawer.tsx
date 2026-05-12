/**
 * TicketCopilotDrawer — AI Copilot side panel for the ticket detail page.
 *
 * Opens via the "Copilot" button in the ticket header or ⌘/Ctrl+I. Shows
 * four AI-assisted surfaces in a single, focused drawer:
 *   • Summary       — collapses the entire conversation into 2–4 sentences.
 *   • Draft Reply   — produces a ready-to-send agent reply from scratch.
 *   • Articles      — KB articles ranked against the ticket subject + body.
 *   • Similar       — recent tickets in the same category, for context.
 *
 * Synchronizes with admin policy via the `tickets.copilotEnabled` setting
 * (and `tickets.summarizeEnabled` for the summary surface specifically).
 * The parent <TicketDetailPage> is responsible for *not rendering* the
 * trigger when copilot is disabled — this component still defends in depth
 * by hiding individual tabs whose underlying endpoint will refuse.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Sparkles, Wand2, BookOpen, Layers, Copy, Check, Loader2,
  ChevronRight, X, RefreshCw,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import ErrorAlert from "@/components/ErrorAlert";
import { fetchSuggestions, type SuggestedArticle } from "@/lib/kb-suggest";
import { useSettings } from "@/hooks/useSettings";
import { type Ticket } from "core/constants/ticket.ts";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TicketCopilotDrawerProps {
  ticket:    Ticket;
  open:      boolean;
  onOpenChange: (next: boolean) => void;
}

// ── Tab IDs ───────────────────────────────────────────────────────────────────

type TabId = "summary" | "draft" | "articles" | "similar";

// ── Copy-to-clipboard helper ──────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5 h-8"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — fail quietly */ }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

// ── Reusable typing skeleton (for AI calls in flight) ────────────────────────

function TypingSkeleton() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-3.5 w-[92%]" />
      <Skeleton className="h-3.5 w-[78%]" />
      <Skeleton className="h-3.5 w-[85%]" />
      <Skeleton className="h-3.5 w-[60%]" />
    </div>
  );
}

// ── Summary tab ──────────────────────────────────────────────────────────────

function SummaryTab({ ticketId, summarizeEnabled }: { ticketId: number; summarizeEnabled: boolean }) {
  const summarize = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post(`/api/tickets/${ticketId}/replies/summarize`);
      return data.summary as string;
    },
  });

  if (!summarizeEnabled) {
    return (
      <div className="text-sm text-muted-foreground py-6 text-center">
        Conversation summary is disabled by your administrator.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          Collapse this thread into a 2–4 sentence brief.
        </p>
        <Button
          type="button"
          size="sm"
          variant={summarize.data ? "outline" : "default"}
          className="gap-1.5 h-8"
          onClick={() => summarize.mutate()}
          disabled={summarize.isPending}
        >
          {summarize.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          {summarize.data ? "Regenerate" : "Summarize"}
        </Button>
      </div>

      {summarize.error && (
        <ErrorAlert error={summarize.error} fallback="Failed to generate summary" />
      )}

      {summarize.isPending && !summarize.data && <TypingSkeleton />}

      {summarize.data && (
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-4 space-y-3">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
            {summarize.data}
          </p>
          <div className="flex justify-end">
            <CopyButton text={summarize.data} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Draft tab ────────────────────────────────────────────────────────────────

function DraftTab({ ticketId }: { ticketId: number }) {
  const draft = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post(`/api/tickets/${ticketId}/replies/draft`);
      return data.body as string;
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          Generate a ready-to-send agent reply from the conversation.
        </p>
        <Button
          type="button"
          size="sm"
          variant={draft.data ? "outline" : "default"}
          className="gap-1.5 h-8"
          onClick={() => draft.mutate()}
          disabled={draft.isPending}
        >
          {draft.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Wand2 className="h-3.5 w-3.5" />}
          {draft.data ? "Regenerate" : "Draft reply"}
        </Button>
      </div>

      {draft.error && (
        <ErrorAlert error={draft.error} fallback="Failed to draft reply" />
      )}

      {draft.isPending && !draft.data && <TypingSkeleton />}

      {draft.data && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed font-[400]">
            {draft.data}
          </p>
          <div className="flex justify-end gap-2">
            <CopyButton text={draft.data} label="Copy reply" />
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2 border-emerald-500/15">
            Tip: paste this into the Reply box below, then refine before sending.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Articles tab ─────────────────────────────────────────────────────────────

function ArticlesTab({ subject, body }: { subject: string; body: string }) {
  const trimmedSubject = subject.trim();
  const trimmedBody    = body.trim();
  const minLen = (trimmedSubject + " " + trimmedBody).trim().length;

  const { data: articles = [], isFetching, error } = useQuery<SuggestedArticle[]>({
    queryKey:  ["copilot-kb", trimmedSubject, trimmedBody],
    queryFn:   () => fetchSuggestions({ subject: trimmedSubject, body: trimmedBody }),
    enabled:   minLen >= 3,
    staleTime: 60_000,
  });

  if (minLen < 3) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Not enough context to suggest articles yet.
      </p>
    );
  }

  if (isFetching && articles.length === 0) return <TypingSkeleton />;
  if (error) return <ErrorAlert error={error} fallback="Failed to load articles" />;

  if (articles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No matching knowledge base articles.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {articles.map((a) => (
        <li key={a.id}>
          <Link
            to={`/help/articles/${a.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 rounded-md border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug group-hover:text-primary transition-colors">
                {a.title}
              </p>
              {a.excerpt && (
                <p className="text-[11.5px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {a.excerpt}
                </p>
              )}
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Similar tickets tab ──────────────────────────────────────────────────────

interface TicketHit {
  id:           number;
  ticketNumber: string;
  subject:      string;
  status:       string;
  category:     string | null;
  createdAt:    string;
}

function SimilarTab({ ticket }: { ticket: Ticket }) {
  // Match strategy: same category if present, otherwise same sender email.
  const params = useMemo(() => {
    const p: Record<string, string | number> = { pageSize: 6 };
    if (ticket.category) p.category = ticket.category;
    return p;
  }, [ticket.category]);

  const { data, isLoading, error } = useQuery<{ tickets: TicketHit[] }>({
    queryKey: ["copilot-similar", ticket.id, ticket.category],
    queryFn:  async () => (await axios.get("/api/tickets", { params })).data,
    enabled:  Boolean(ticket.category),
    staleTime: 60_000,
  });

  if (!ticket.category) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Set a category on this ticket to surface similar work.
      </p>
    );
  }

  if (isLoading) return <TypingSkeleton />;
  if (error)     return <ErrorAlert error={error} fallback="Failed to load similar tickets" />;

  const others = (data?.tickets ?? []).filter((t) => t.id !== ticket.id);
  if (others.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No other open tickets in this category.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {others.slice(0, 6).map((t) => (
        <li key={t.id}>
          <Link
            to={`/tickets/${t.id}`}
            className="group flex items-center gap-3 rounded-md border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-colors"
          >
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug truncate group-hover:text-primary transition-colors">
                {t.subject}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                {t.ticketNumber}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] capitalize">
              {t.status.replace(/_/g, " ")}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Drawer shell ─────────────────────────────────────────────────────────────

export default function TicketCopilotDrawer({ ticket, open, onOpenChange }: TicketCopilotDrawerProps) {
  const [tab, setTab] = useState<TabId>("summary");
  const { data: ticketSettings } = useSettings("tickets");

  // Defend in depth: even if the trigger is rendered, server endpoints will
  // 403 when the admin has switched off the corresponding feature.
  const summarizeEnabled = ticketSettings?.summarizeEnabled ?? true;

  // Used by the Articles tab — kept separate so the server can weight
  // subject keywords much higher than body keywords (and gate candidate
  // articles on the subject, which is what makes results topical).
  const articleSubject = ticket.subject ?? "";
  const articleBody    = useMemo(() => (ticket.body ?? "").slice(0, 800), [ticket.body]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b bg-gradient-to-br from-violet-500/[0.06] via-violet-500/[0.02] to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
                <Sparkles className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <SheetTitle className="text-[15px] leading-tight">AI Copilot</SheetTitle>
                <SheetDescription className="text-[11.5px] leading-tight mt-0.5">
                  {ticket.ticketNumber} · {ticket.subject}
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabId)}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="px-5 pt-3 pb-0 border-b">
            <TabsList className="grid grid-cols-4 w-full h-9">
              <TabsTrigger value="summary"  className="text-[12px]">Summary</TabsTrigger>
              <TabsTrigger value="draft"    className="text-[12px]">Draft</TabsTrigger>
              <TabsTrigger value="articles" className="text-[12px]">Articles</TabsTrigger>
              <TabsTrigger value="similar"  className="text-[12px]">Similar</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            <TabsContent value="summary" className="mt-0">
              <SummaryTab ticketId={ticket.id} summarizeEnabled={summarizeEnabled} />
            </TabsContent>

            <TabsContent value="draft" className="mt-0">
              <DraftTab ticketId={ticket.id} />
            </TabsContent>

            <TabsContent value="articles" className="mt-0">
              <ArticlesTab subject={articleSubject} body={articleBody} />
            </TabsContent>

            <TabsContent value="similar" className="mt-0">
              <SimilarTab ticket={ticket} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="border-t px-5 py-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-500" />
            Powered by AI · responses can vary
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="border rounded px-1 py-0.5 text-[10px]">⌘ I</kbd> toggle
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
