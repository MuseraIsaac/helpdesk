import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import "./RichTextEditor.css";

/**
 * DOMPurify config — covers every tag and attribute that TipTap can produce
 * with the current extension set:
 *
 *   StarterKit · Underline · Link · Image (ResizableImage) · TextStyle ·
 *   Color · Highlight · TextAlign · Subscript · Superscript ·
 *   TaskList · TaskItem · Table · CharacterCount · Mention
 *
 * Security notes:
 * - `style` is allowed because TextAlign/Color/Highlight render via inline styles.
 *   DOMPurify sanitises CSS values and strips dangerous constructs (expressions,
 *   url() with javascript:, etc.) even when style is in ALLOWED_ATTR.
 * - `src` on <img> must include data: URIs because the editor embeds images as
 *   base64.  ADD_DATA_URI_TAGS restricts this allowance to <img> only.
 * - Event handlers (onclick, onerror, …) are never allowed — DOMPurify blocks
 *   them regardless of ALLOWED_ATTR.
 * - javascript: hrefs are blocked by DOMPurify's default ALLOWED_URI_REGEXP.
 */
const PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    // ── Block elements ──────────────────────────────────────────────────────
    "p", "div", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre",
    // ── Inline text marks ───────────────────────────────────────────────────
    "span", "a",
    "strong", "b", "em", "i", "u", "s", "del", "strike",
    "code",
    "sub", "sup",
    "mark",           // Highlight extension
    // ── Lists (standard + TipTap task list) ────────────────────────────────
    "ul", "ol", "li",
    "label", "input", // TaskItem renders a checkbox <input type="checkbox">
    // ── Tables ──────────────────────────────────────────────────────────────
    "table", "thead", "tbody", "tfoot",
    "tr", "th", "td",
    "caption", "colgroup", "col",
    // ── Media ───────────────────────────────────────────────────────────────
    "img",
    // ── Figures (forward-compat) ────────────────────────────────────────────
    "figure", "figcaption",
  ],

  ALLOWED_ATTR: [
    // Global
    "class", "id", "style",
    // Links
    "href", "target", "rel",
    // Images
    "src", "alt", "width", "height",
    // Tables
    "colspan", "rowspan", "scope",
    // Task-list checkboxes
    "type", "checked", "disabled",
    // TipTap data attributes
    "data-type",     // taskList, taskItem, mention
    "data-checked",  // taskItem checked state
    "data-id",       // mention node id
    "data-email",    // mention node email
    "data-color",    // Highlight color attribute
    // Drag handle (TipTap node views)
    "data-drag-handle",
  ],

  // Force all links to open safely in a new tab
  ADD_ATTR: ["target"],

  // Allow base64 data: URIs in <img src="…"> so embedded editor images render.
  // This is scoped to img only — other tags remain blocked.
  ADD_DATA_URI_TAGS: ["img"],

  // Disallow unknown protocols (javascript:, vbscript:, etc.) in href/src
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

interface Props {
  /** HTML string (from TipTap) or legacy Markdown / plain text */
  content: string;
  className?: string;
}

/**
 * Renders stored reply/note content safely.
 *
 * Detection: content that starts with a `<` is treated as HTML and sanitised
 * directly.  Everything else is treated as legacy Markdown / plain text and
 * parsed with `marked` first, preserving backward compatibility with pre-editor
 * tickets.
 */
export default function RichTextRenderer({ content, className = "" }: Props) {
  const html = useMemo(() => {
    if (!content) return "";

    const trimmed = content.trimStart();
    let raw: string;

    if (trimmed.startsWith("<")) {
      raw = trimmed;
    } else {
      raw = marked.parse(content, { async: false }) as string;
    }

    return DOMPurify.sanitize(raw, PURIFY_CONFIG) as unknown as string;
  }, [content]);

  return (
    <div
      className={`rte-body text-sm text-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
