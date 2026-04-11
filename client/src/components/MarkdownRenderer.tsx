import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface Props {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = "" }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-none text-foreground ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
