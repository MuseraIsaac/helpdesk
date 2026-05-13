/**
 * Lazy-loading wrapper around RichTextEditor.
 *
 * RichTextEditor pulls in Tiptap + ~15 extensions (~500 KB minified). Most
 * pages that use it (TicketDetailPage, IncidentDetailPage, NewTicketPage…)
 * don't need the editor on the critical render path — the user has to
 * focus the reply composer or open a "new" form first. By gating it
 * behind React.lazy, every consuming page becomes interactive 1–2 s
 * faster on initial paint; the editor bundle is fetched in the
 * background and swapped in transparently when it mounts.
 *
 * Public API is identical to RichTextEditor — drop-in replacement.
 */
import { lazy, Suspense, forwardRef, type ComponentProps } from "react";
import type RichTextEditorImpl from "./RichTextEditor";
import { type RichTextEditorHandle } from "./RichTextEditor";

export { type RichTextEditorHandle } from "./RichTextEditor";

const LazyImpl = lazy(() => import("./RichTextEditor"));

type RichTextEditorProps = ComponentProps<typeof RichTextEditorImpl>;

/**
 * While the editor JS is in flight, render a height-matched skeleton so
 * the surrounding layout doesn't jump when the real editor mounts.
 */
function EditorFallback() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading editor"
      className="border rounded-md bg-muted/30 animate-pulse"
      style={{ minHeight: 160 }}
    />
  );
}

const RichTextEditorLazy = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditorLazy(props, ref) {
    return (
      <Suspense fallback={<EditorFallback />}>
        <LazyImpl {...props} ref={ref} />
      </Suspense>
    );
  },
);

export default RichTextEditorLazy;
