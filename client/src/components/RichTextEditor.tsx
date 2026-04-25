import {
  useEffect, useCallback, useState, useRef, useMemo,
  useImperativeHandle, forwardRef,
} from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEditor, EditorContent, ReactRenderer, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { Image } from "@tiptap/extension-image";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
// TipTap v3: all table classes are named exports from the single table package
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { CharacterCount } from "@tiptap/extension-character-count";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import MentionList, { type MentionListHandle } from "./MentionList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code, Code2, Minus,
  Link as LinkIcon, Image as ImageIcon, Table as TableIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  Undo, Redo, RemoveFormatting,
  Upload, Highlighter, Palette,
  ChevronDown,
} from "lucide-react";
import "./RichTextEditor.css";

// ── Public types ──────────────────────────────────────────────────────────────

export interface RichTextEditorHandle {
  insertAtCursor: (html: string) => void;
}

export interface RichTextEditorProps {
  content?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
  className?: string;
  editorClassName?: string;
  enableMentions?: boolean;
  onMentionSelect?: (email: string) => void;
  maxCharacters?: number;
}

// ── Color palettes ────────────────────────────────────────────────────────────

const TEXT_COLORS = [
  { label: "Default",     value: "" },
  { label: "Black",       value: "#000000" },
  { label: "Dark Gray",   value: "#374151" },
  { label: "Gray",        value: "#6b7280" },
  { label: "Light Gray",  value: "#9ca3af" },
  { label: "Red",         value: "#ef4444" },
  { label: "Orange",      value: "#f97316" },
  { label: "Amber",       value: "#f59e0b" },
  { label: "Green",       value: "#22c55e" },
  { label: "Teal",        value: "#14b8a6" },
  { label: "Blue",        value: "#3b82f6" },
  { label: "Indigo",      value: "#6366f1" },
  { label: "Violet",      value: "#8b5cf6" },
  { label: "Purple",      value: "#a855f7" },
  { label: "Pink",        value: "#ec4899" },
  { label: "Rose",        value: "#f43f5e" },
  { label: "Dark Red",    value: "#991b1b" },
  { label: "Dark Green",  value: "#166534" },
  { label: "Dark Blue",   value: "#1e40af" },
  { label: "Dark Indigo", value: "#3730a3" },
];

const HIGHLIGHT_COLORS = [
  { label: "None",        value: "" },
  { label: "Yellow",      value: "#fef08a" },
  { label: "Green",       value: "#bbf7d0" },
  { label: "Blue",        value: "#bfdbfe" },
  { label: "Red",         value: "#fecaca" },
  { label: "Purple",      value: "#e9d5ff" },
  { label: "Orange",      value: "#fed7aa" },
  { label: "Pink",        value: "#fbcfe8" },
  { label: "Cyan",        value: "#a5f3fc" },
  { label: "Lime",        value: "#d9f99d" },
  { label: "Amber",       value: "#fde68a" },
];

// ── ToolbarButton ─────────────────────────────────────────────────────────────

function ToolbarButton({
  onClick, active, disabled, title, children, className = "",
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded p-1 transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-4 w-px bg-border/70 shrink-0" />;
}

// ── Color Picker ──────────────────────────────────────────────────────────────

function ColorPickerPopover({
  colors,
  currentColor,
  onSelect,
  trigger,
  title,
}: {
  colors: { label: string; value: string }[];
  currentColor: string;
  onSelect: (color: string) => void;
  trigger: React.ReactNode;
  title: string;
}) {
  const [customColor, setCustomColor] = useState(currentColor || "#000000");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          onMouseDown={(e) => e.preventDefault()}
          className="inline-flex items-center justify-center rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2.5" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
        <div className="grid grid-cols-5 gap-1 mb-2">
          {colors.map((c) => (
            <button
              key={c.value || "none"}
              type="button"
              title={c.label}
              onClick={() => { onSelect(c.value); setOpen(false); }}
              className={[
                "h-6 w-6 rounded border transition-transform hover:scale-110",
                c.value === currentColor ? "ring-2 ring-primary ring-offset-1" : "",
                !c.value ? "border-border bg-background flex items-center justify-center text-[8px] text-muted-foreground font-bold" : "border-border/50",
              ].join(" ")}
              style={c.value ? { backgroundColor: c.value } : {}}
            >
              {!c.value ? "✕" : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-t pt-2 mt-1">
          <input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="h-6 w-6 rounded cursor-pointer border border-border bg-transparent p-0"
          />
          <span className="text-[11px] text-muted-foreground font-mono">{customColor}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] ml-auto px-2"
            onClick={() => { onSelect(customColor); setOpen(false); }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Table Grid Picker ─────────────────────────────────────────────────────────

function TableGridPicker({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hovered, setHovered] = useState<[number, number]>([0, 0]);
  const [open, setOpen] = useState(false);
  const MAX = 6;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Insert table"
          onMouseDown={(e) => e.preventDefault()}
          className="inline-flex items-center justify-center rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground text-muted-foreground"
        >
          <TableIcon className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {hovered[0] > 0 && hovered[1] > 0
            ? `${hovered[0]} × ${hovered[1]} table`
            : "Insert table"}
        </p>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MAX}, 1fr)` }}>
          {Array.from({ length: MAX }, (_, r) =>
            Array.from({ length: MAX }, (_, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                onMouseEnter={() => setHovered([r + 1, c + 1])}
                onMouseLeave={() => setHovered([0, 0])}
                onClick={() => { onInsert(r + 1, c + 1); setOpen(false); }}
                className={[
                  "h-5 w-5 rounded-sm border transition-colors",
                  r < hovered[0] && c < hovered[1]
                    ? "bg-primary/20 border-primary/50"
                    : "bg-muted/40 border-border/50 hover:bg-muted",
                ].join(" ")}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Image Dialog ──────────────────────────────────────────────────────────────

function ImageDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (src: string, alt: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState("");
  const [uploadSrc, setUploadSrc] = useState("");
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setUrl(""); setAlt(""); setPreview(""); setUploadSrc(""); setUploadError("");
  }

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be under 5 MB.");
      return;
    }
    setUploadError("");
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setUploadSrc(src);
      setPreview(src);
      if (!alt) setAlt(file.name.replace(/\.[^.]+$/, ""));
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            Insert Image
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="url" className="mt-1">
          <TabsList className="w-full">
            <TabsTrigger value="url" className="flex-1">From URL</TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
          </TabsList>

          {/* URL tab */}
          <TabsContent value="url" className="space-y-3 mt-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Image URL</label>
              <Input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setPreview(e.target.value); }}
                placeholder="https://example.com/image.png"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Alt text</label>
              <Input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image…" />
            </div>
            {preview && (
              <div className="rounded-lg border overflow-hidden bg-muted/30 max-h-40 flex items-center justify-center">
                <img
                  src={preview}
                  alt="preview"
                  className="max-h-40 max-w-full object-contain"
                  onError={() => setPreview("")}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
              <Button size="sm" disabled={!url.trim()} onClick={() => { onInsert(url.trim(), alt); reset(); onClose(); }}>
                Insert
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Upload tab */}
          <TabsContent value="upload" className="space-y-3 mt-3">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className={[
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
                "cursor-pointer transition-colors py-8 px-4",
                "hover:border-primary/50 hover:bg-primary/5",
                preview ? "border-primary/30 bg-primary/5" : "border-border",
              ].join(" ")}
            >
              {preview ? (
                <img src={preview} alt="preview" className="max-h-32 max-w-full object-contain rounded" />
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Click or drag & drop</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF, WebP up to 5 MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
            {uploading && <p className="text-xs text-muted-foreground text-center">Processing…</p>}
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Alt text</label>
              <Input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image…" />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { reset(); onClose(); }}>Cancel</Button>
              <Button size="sm" disabled={!uploadSrc || uploading} onClick={() => { onInsert(uploadSrc, alt); reset(); onClose(); }}>
                Insert
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Resizable image node view ─────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragDataRef  = useRef<{ startX: number; startWidth: number; side: "left" | "right" } | null>(null);

  const width = node.attrs.width as number | null;

  function startResize(e: React.MouseEvent, side: "left" | "right") {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = containerRef.current?.getBoundingClientRect().width ?? 300;
    dragDataRef.current = { startX: e.clientX, startWidth, side };

    function onMove(mv: MouseEvent) {
      const d = dragDataRef.current;
      if (!d) return;
      const delta = d.side === "right" ? mv.clientX - d.startX : d.startX - mv.clientX;
      updateAttributes({ width: Math.round(Math.max(80, Math.min(d.startWidth + delta, 1600))) });
    }
    function onUp() {
      dragDataRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <NodeViewWrapper className="rte-image-wrapper">
      <div
        ref={containerRef}
        className={`rte-image-container${selected ? " rte-image-selected" : ""}`}
        style={{ width: width ? `${width}px` : undefined }}
      >
        <img
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string) ?? ""}
          title={(node.attrs.title as string) ?? undefined}
          draggable={false}
        />
        {selected && (
          <>
            <div className="rte-resize-handle rte-resize-left"  onMouseDown={(e) => startResize(e, "left")} />
            <div className="rte-resize-handle rte-resize-right" onMouseDown={(e) => startResize(e, "right")} />
            <span className="rte-image-size-label">
              {width ? `${width}px` : "auto"}
            </span>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("width") || el.style.width;
          return w ? parseInt(w, 10) || null : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { width: attrs.width, style: `width:${attrs.width}px` } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

// ── Mention email extraction ──────────────────────────────────────────────────

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

// ── @mention extension ────────────────────────────────────────────────────────

interface AgentOption { id: string; name: string; email: string }

const MentionWithEmail = Mention.extend({
  addAttributes() {
    return {
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
    const name  = String(node.attrs.label ?? "");
    const email = node.attrs.email as string | null;
    return [
      "span",
      { class: "rte-mention", "data-type": "mention", "data-id": node.attrs.id, "data-email": email ?? "" },
      ["span", { class: "rte-mention-name" }, `@${name}`],
      ...(email ? [["span", { class: "rte-mention-email" }, email]] : []),
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
  maxCharacters,
}, ref) {
  const [linkDialogOpen, setLinkDialogOpen]   = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl]                 = useState("");

  // Agents for @mention
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
  const agentsRef = useRef<AgentOption[]>([]);
  agentsRef.current = agents;

  const mentionSelectRef = useRef<((email: string) => void) | undefined>(undefined);
  mentionSelectRef.current = onMentionSelect;
  const prevMentionEmailsRef = useRef<Set<string>>(new Set());

  const mentionExtension = useMemo(() => {
    if (!enableMentions) return null;
    return MentionWithEmail.configure({
      HTMLAttributes: { class: "rte-mention" },
      suggestion: {
        items: ({ query }: { query: string }) => {
          if (!query) return [];
          const q = query.toLowerCase();
          return agentsRef.current
            .filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
            .slice(0, 8);
        },
        render() {
          let component: ReactRenderer<MentionListHandle> | null = null;
          let popup: TippyInstance[] | null = null;
          return {
            onStart(props: any) {
              component = new ReactRenderer(MentionList, { props, editor: props.editor });
              if (!props.clientRect) return;
              popup = tippy("body", {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                // "mention" theme strips Tippy's default dark box so only the
                // MentionList container (which uses design tokens) is visible.
                theme: "mention",
                arrow: false,
              });
            },
            onUpdate(props: any) {
              component?.updateProps(props);
              if (!props.clientRect) return;
              popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect });
            },
            onKeyDown(props: any) {
              if (props.event.key === "Escape") { popup?.[0]?.hide(); return true; }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
              popup?.[0]?.destroy(); component?.destroy(); popup = null; component = null;
            },
          };
        },
      },
    });
  }, [enableMentions]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
      ResizableImage.configure({ allowBase64: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ...(maxCharacters ? [CharacterCount.configure({ limit: maxCharacters })] : [CharacterCount]),
      ...(mentionExtension ? [mentionExtension] : []),
    ],
    content,
    editable: !disabled,
    editorProps: {
      // Drag-and-drop image files into the editor
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const file = event.dataTransfer?.files?.[0];
        if (!file?.type.startsWith("image/")) return false;
        if (file.size > 5 * 1024 * 1024) return false;
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (src) {
            const { schema } = view.state;
            const node = schema.nodes.image?.create({ src, alt: file.name });
            if (node) {
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const pos = coords?.pos ?? view.state.selection.anchor;
              view.dispatch(view.state.tr.insert(pos, node));
            }
          }
        };
        reader.readAsDataURL(file);
        return true;
      },
      // Paste images from clipboard
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imgItem = items.find((i) => i.type.startsWith("image/"));
        if (!imgItem) return false;
        const file = imgItem.getAsFile();
        if (!file) return false;
        const reader = new FileReader();
        reader.onload = (e) => {
          const src = e.target?.result as string;
          if (src) {
            const { schema } = view.state;
            const node = schema.nodes.image?.create({ src });
            if (node) view.dispatch(view.state.tr.replaceSelectionWith(node));
          }
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onUpdate({ editor }) {
      const html = editor.isEmpty ? "" : editor.getHTML();
      const text = editor.getText();
      onChange?.(html, text);

      if (mentionSelectRef.current) {
        const currentEmails = parseMentionEmails(html);
        for (const email of currentEmails) {
          if (!prevMentionEmailsRef.current.has(email)) mentionSelectRef.current(email);
        }
        prevMentionEmailsRef.current = currentEmails;
      }
    },
  });

  useImperativeHandle(ref, () => ({
    insertAtCursor(html: string) {
      if (!editor) return;
      editor.chain().focus().insertContent(html).run();
    },
  }), [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (content !== current) editor.commands.setContent(content, { emitUpdate: false });
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: trimmed.startsWith("http") ? trimmed : `https://${trimmed}` }).run();
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!editor) return null;

  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  const currentTextColor  = editor.getAttributes("textStyle").color ?? "";
  const currentHighlight  = editor.getAttributes("highlight").color ?? "";

  // Character count
  const charCount = (editor.storage.characterCount as any)?.characters?.() ?? 0;
  const charLimit = maxCharacters;
  const nearLimit = charLimit && charCount >= charLimit * 0.9;

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
      <div className="border-b px-1.5 py-1 space-y-0.5">

        {/* Row 1: Text formatting */}
        <div className="flex flex-wrap items-center gap-0.5">
          {/* History */}
          <ToolbarButton title="Undo (⌘Z)" onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}>
            <Undo className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Redo (⌘⇧Z)" onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}>
            <Redo className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Basic marks */}
          <ToolbarButton title="Bold (⌘B)" active={is("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Italic (⌘I)" active={is("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Underline (⌘U)" active={is("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Strikethrough" active={is("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Inline code" active={is("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Subscript / Superscript */}
          <ToolbarButton title="Subscript" active={is("subscript")} onClick={() => editor.chain().focus().toggleSubscript().run()}>
            <SubscriptIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Superscript" active={is("superscript")} onClick={() => editor.chain().focus().toggleSuperscript().run()}>
            <SuperscriptIcon className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Text color */}
          <ColorPickerPopover
            colors={TEXT_COLORS}
            currentColor={currentTextColor}
            onSelect={(color) => {
              if (color) editor.chain().focus().setColor(color).run();
              else editor.chain().focus().unsetColor().run();
            }}
            title="Text color"
            trigger={
              <span className="relative flex flex-col items-center">
                <Palette className="h-3.5 w-3.5" />
                <span
                  className="absolute -bottom-0.5 left-0.5 right-0.5 h-0.5 rounded-full"
                  style={{ backgroundColor: currentTextColor || "currentColor" }}
                />
              </span>
            }
          />

          {/* Highlight */}
          <ColorPickerPopover
            colors={HIGHLIGHT_COLORS}
            currentColor={currentHighlight}
            onSelect={(color) => {
              if (color) editor.chain().focus().setHighlight({ color }).run();
              else editor.chain().focus().unsetHighlight().run();
            }}
            title="Highlight"
            trigger={
              <span className="relative flex flex-col items-center">
                <Highlighter className="h-3.5 w-3.5" />
                <span
                  className="absolute -bottom-0.5 left-0.5 right-0.5 h-0.5 rounded-full"
                  style={{ backgroundColor: currentHighlight || "transparent", border: currentHighlight ? "none" : "1px dashed currentColor" }}
                />
              </span>
            }
          />

          <Divider />

          {/* Clear formatting */}
          <ToolbarButton title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
            <RemoveFormatting className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {/* Row 2: Block formatting + media */}
        <div className="flex flex-wrap items-center gap-0.5">
          {/* Headings */}
          <ToolbarButton title="Heading 1" active={is("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Heading 2" active={is("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Heading 3" active={is("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Lists */}
          <ToolbarButton title="Bullet list" active={is("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Numbered list" active={is("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Task list" active={is("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <ListChecks className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Blocks */}
          <ToolbarButton title="Blockquote" active={is("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Code block" active={is("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <Code2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Horizontal rule" active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Alignment */}
          <ToolbarButton title="Align left" active={is({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Align center" active={is({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Align right" active={is({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Justify" active={is({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Divider />

          {/* Insert */}
          <ToolbarButton title="Link (⌘K)" active={is("link")} onClick={openLinkDialog}>
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton title="Insert image" active={false} onClick={() => setImageDialogOpen(true)}>
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <TableGridPicker
            onInsert={(rows, cols) =>
              editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
            }
          />
        </div>
      </div>

      {/* ── Editor area ── */}
      <EditorContent
        editor={editor}
        className={["rte-content px-3 py-2 text-sm", editorClassName].join(" ")}
        style={{ minHeight }}
      />

      {/* ── Footer: character count + table controls ── */}
      {(charLimit || is("table")) && (
        <div className="flex items-center justify-between border-t px-3 py-1.5 bg-muted/20">
          {is("table") ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-medium mr-1">Table:</span>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent transition-colors text-muted-foreground">
                + Row
              </button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent transition-colors text-muted-foreground">
                + Col
              </button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent hover:text-destructive transition-colors text-muted-foreground">
                − Row
              </button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-accent hover:text-destructive transition-colors text-muted-foreground">
                − Col
              </button>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-destructive/30 hover:bg-destructive/10 text-destructive transition-colors">
                Delete table
              </button>
            </div>
          ) : <span />}

          {charLimit && (
            <span className={["text-[11px] tabular-nums ml-auto", nearLimit ? "text-destructive font-medium" : "text-muted-foreground"].join(" ")}>
              {charCount} / {charLimit}
            </span>
          )}
        </div>
      )}

      {/* ── Link dialog ── */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-primary" />
              Insert link
            </DialogTitle>
          </DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            onKeyDown={(e) => e.key === "Enter" && applyLink()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={applyLink}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Image dialog ── */}
      <ImageDialog
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        onInsert={(src, alt) => editor.chain().focus().setImage({ src, alt }).run()}
      />
    </div>
  );
});

export default RichTextEditor;
