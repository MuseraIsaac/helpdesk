/**
 * MarkdownRenderer — thin wrapper around RichTextRenderer.
 *
 * Kept for backward compatibility with any existing callers.
 * RichTextRenderer auto-detects HTML vs Markdown, so both old articles
 * (stored as Markdown) and new articles (stored as HTML) render correctly.
 */
import RichTextRenderer from "@/components/RichTextRenderer";

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: Props) {
  return <RichTextRenderer content={content} className={className} />;
}
