import { useEffect, useCallback, useState, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import MentionList, { type MentionListHandle } from "./MentionList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  Link as LinkIcon,
  Minus,
} from "lucide-react";
import "./RichTextEditor.css";

export interface RichTextEditorHandle {
  /** Insert HTML at the current cursor position (or end if editor has no selection). */
  insertAtCursor: (html: string) => void;
}

export interface RichTextEditorProps {
  /** Initial HTML content */
  content?: string;
  /** Called on every change with (html, plainText) */
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
  className?: string;
  /** Extra classes applied to the editable area wrapper */
  editorClassName?: string;
  /** Enable @mention autocomplete. Fetches agents from /api/agents. */
  enableMentions?: boolean;
  /** Called with the selected agent's email each time an @mention is committed. */
  onMentionSelect?: (email: string) => void;
}

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // keep editor focus
        onClick();
      }}
      title={title}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded p-1 transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-4 w-px bg-border" />;
}

// ── Mention email extraction ──────────────────────────────────────────────────

/** Extract unique, lowercase emails from all @mention spans in TipTap HTML. */
function parseMentionEmails(html: string): Set<string> {
  const result = new Set<string>();
  const tagRe   = /<span\s[^>]*>/gi;
  const typeRe  = /data-type="mention"/i;
  const emailRe = /data-email="([^"]+)"/i;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    if (!typeRe.test(m[0])) continue;
    const em = emailRe.exec(m[0]);
    if (em?.[1]?.trim()) result.add(em[1].trim().toLowerCase());
  }
  return result;
}

// ── @mention — extended node with email attribute ────────────────────────────

interface AgentOption { id: string; name: string; email: string }

/**
 * Mention extended with an `email` attribute so the rendered chip shows both
 * the agent's name and email address.
 */
const MentionWithEmail = Mention.extend({
  addAttributes() {
    return {
      // Inherit the built-in `id` and `label` attributes
      ...this.parent?.(),
      email: {
        default: null,
        parseHTML: (el: Element) => el.getAttribute("data-email"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.email ? { "data-email": attrs.email } : {},
      },
    };
  },
  renderHTML({ node }: { node: any }) {
    // Do NOT spread HTMLAttributes here — the parent addAttributes already
    // injects data-id early via its own renderHTML, which would push
    // data-type to the end of the attribute list and break the server-side
    // regex that extracts mention IDs. We define all attributes explicitly
    // so data-type always appears first (after class).
    const name  = String(node.attrs.label ?? "");
    const email = node.attrs.email as string | null;
    return [
      "span",
      {
        class:        "rte-mention",
        "data-type":  "mention",
        "data-id":    node.attrs.id,
        "data-email": email ?? "",
      },
      ["span", { class: "rte-mention-name" }, `@${name}`],
      ...(email
        ? [["span", { class: "rte-mention-email" }, email]]
        : []),
    ];
  },
});

// ── Main component ────────────────────────────────────────────────────────────

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  content = "",
  onChange,
  placeholder = "Write something…",
  minHeight = "120px",
  disabled = false,
  className = "",
  editorClassName = "",
  enableMentions = false,
  onMentionSelect,
}, ref) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Fetch agents for @mention suggestions (only when mentions are enabled)
  const { data: agentsData } = useQuery<AgentOption[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: AgentOption[] }>("/api/agents");
      return data.agents;
    },
    enabled: enableMentions,
    staleTime: 60_000,
  });
  const agents = agentsData ?? [];

  // Always-current ref — the suggestion closure reads this instead of the
  // stale `agents` value captured at extension-creation time. Without this,
  // ReplyForm (which renders before the agents query resolves) would always
  // see an empty list because the closure captured agents = [] at init.
  const agentsRef = useRef<AgentOption[]>([]);
  agentsRef.current = agents;

  // Stable ref so the editor onUpdate closure always sees the latest callback
  const mentionSelectRef = useRef<((email: string) => void) | undefined>(undefined);
  mentionSelectRef.current = onMentionSelect;

  // Track which mention emails are already in the editor so we only fire
  // onMentionSelect for *newly added* ones (not on every keystroke).
  const prevMentionEmailsRef = useRef<Set<string>>(new Set());

  // Build the Mention extension only when mentions are enabled.
  // Created once (useMemo deps: [enableMentions]) so the editor is stable,
  // but the items callback always reads agentsRef.current for the latest data.
  const mentionExtension = useMemo(() => {
    if (!enableMentions) return null;
    return MentionWithEmail.configure({
        HTMLAttributes: { class: "rte-mention" },
        suggestion: {
          items: ({ query }: { query: string }) => {
            if (!query) return [];          // show nothing until first letter
            const q = query.toLowerCase();
            return agentsRef.current
              .filter(
                (a) =>
                  a.name.toLowerCase().includes(q) ||
                  a.email.toLowerCase().includes(q)
              )
              .slice(0, 8);
          },
          render() {
            let component: ReactRenderer<MentionListHandle> | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart(props: any) {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                if (!props.clientRect) return;
                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate(props: any) {
                component?.updateProps(props);
                if (!props.clientRect) return;
                popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect });
              },
              onKeyDown(props: any) {
                if (props.event.key === "Escape") {
                  popup?.[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props.event) ?? false;
              },
              onExit() {
                popup?.[0]?.destroy();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        },
      });
  }, [enableMentions]); // agentsRef is a ref — no need to list agents here

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Heading levels 1-3
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      ...(mentionExtension ? [mentionExtension] : []),
    ],
    content,
    editable: !disabled,
    onUpdate({ editor }) {
      const html = editor.isEmpty ? "" : editor.getHTML();
      const text = editor.getText();
      onChange?.(html, text);

      // Detect newly inserted @mention emails and fire the callback once per addition.
      // Works by diffing the current set against the previous set — robust against
      // any insertion path (keyboard, click, paste) without relying on TipTap internals.
      if (mentionSelectRef.current) {
        const currentEmails = parseMentionEmails(html);
        for (const email of currentEmails) {
          if (!prevMentionEmailsRef.current.has(email)) {
            mentionSelectRef.current(email);
          }
        }
        prevMentionEmailsRef.current = currentEmails;
      }
    },
  });

  // Expose insertAtCursor for parent components (e.g. macro insertion)
  useImperativeHandle(ref, () => ({
    insertAtCursor(html: string) {
      if (!editor) return;
      editor.chain().focus().insertContent(html).run();
    },
  }), [editor]);

  // Sync content from outside (e.g. AI polish, draft injection)
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (content !== current) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync disabled state
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const existing = editor.getAttributes("link").href ?? "";
    setLinkUrl(existing);
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);

  return (
    <div
      className={[
        "rounded-md border bg-background ring-offset-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled ? "opacity-60 cursor-not-allowed" : "",
        className,
      ].join(" ")}
    >
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
        <ToolbarButton
          title="Bold (⌘B)"
          active={isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (⌘I)"
          active={isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (⌘U)"
          active={isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Heading 1"
          active={isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Bullet list"
          active={isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Blockquote"
          active={isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          active={isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Horizontal rule"
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Link"
          active={isActive("link")}
          onClick={openLinkDialog}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* ── Editor area ── */}
      <EditorContent
        editor={editor}
        className={[
          "rte-content px-3 py-2 text-sm",
          editorClassName,
        ].join(" ")}
        style={{ minHeight }}
      />

      {/* ── Link dialog ── */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert link</DialogTitle>
          </DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            onKeyDown={(e) => e.key === "Enter" && applyLink()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default RichTextEditor;
