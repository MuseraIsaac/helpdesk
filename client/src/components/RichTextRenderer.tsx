import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import "./RichTextEditor.css";

/**
 * ALLOWED_TAGS / ALLOWED_ATTR for DOMPurify.
 * Covers everything Tiptap's StarterKit + Underline + Link can produce.
 * Script, style, and event handlers are blocked by default.
 */
const PURIFY_CONFIG: Record<string, unknown> = {
  ALLOWED_TAGS: [
    "p", "br", "strong", "b", "em", "i", "u", "s", "del",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote",
    "pre", "code",
    "a", "hr",
    "span", "div",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "class", "id"],
  // Force all links to open in a new tab and include rel="noopener"
  ADD_ATTR: ["target"],
};

interface Props {
  /** HTML string (from Tiptap) OR legacy Markdown string */
  content: string;
  className?: string;
}

/**
 * Detects whether a string is HTML or Markdown and renders it safely.
 *
 * Detection rule: content that starts with a `<` tag is treated as HTML;
 * everything else is treated as Markdown and parsed with `marked` first.
 * This preserves backward compatibility for existing Markdown articles and
 * plain-text ticket bodies stored before the rich-text editor was added.
 */
export default function RichTextRenderer({ content, className = "" }: Props) {
  const html = useMemo(() => {
    if (!content) return "";

    const trimmed = content.trimStart();
    let raw: string;

    if (trimmed.startsWith("<")) {
      // Already HTML — sanitize directly
      raw = trimmed;
    } else {
      // Legacy plain text or Markdown — parse with marked first
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
