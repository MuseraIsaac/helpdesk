/**
 * KeyboardShortcutsOverlay
 *
 * A modal cheat-sheet rendered from anywhere in the tree. Opens when:
 *   - The user presses `?` (handled by `useGlobalShortcuts`).
 *   - Any code dispatches a `zentra:shortcut-help` custom event.
 *
 * Lives at the Layout level so the bindings keep working on every route.
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShortcutBoard } from "@/components/ShortcutBoard";
import { Keyboard } from "lucide-react";
import { SHORTCUT_HELP_EVENT } from "@/hooks/useGlobalShortcuts";

export default function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener(SHORTCUT_HELP_EVENT, onOpen);
    return () => document.removeEventListener(SHORTCUT_HELP_EVENT, onOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Speed-run the app from your keyboard. Press <KbdInline>?</KbdInline> any time to bring this back up.
          </DialogDescription>
        </DialogHeader>
        <ShortcutBoard compact />
      </DialogContent>
    </Dialog>
  );
}

function KbdInline({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[11px] rounded-sm border border-border bg-muted px-1.5 py-0.5 align-middle">
      {children}
    </kbd>
  );
}
