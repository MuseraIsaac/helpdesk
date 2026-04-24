/**
 * MentionList — floating suggestion list rendered by TipTap's Mention extension.
 *
 * Appears right where the user types @<letter>. Shows agent name + email.
 * Keyboard: ↑/↓ to navigate, Enter to select, Escape to dismiss.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

interface MentionItem {
  id: string;
  name: string;
  email: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string; email: string }) => void;
  query?: string;
}

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(
  ({ items, command, query }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    function selectItem(index: number) {
      const item = items[index];
      if (!item) return;
      command({ id: item.id, label: item.name, email: item.email });
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ key }: KeyboardEvent): boolean {
        if (key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    // Waiting for first character
    if (!query) return null;

    if (items.length === 0) {
      return (
        <div className="mention-list-container z-50 overflow-hidden rounded-lg border bg-popover shadow-lg p-2 min-w-[220px]">
          <p className="text-xs text-muted-foreground px-2 py-1.5">
            No agents matching "{query}"
          </p>
        </div>
      );
    }

    return (
      <div className="mention-list-container z-50 overflow-hidden rounded-lg border bg-popover shadow-lg py-1 min-w-[240px] max-h-64 overflow-y-auto">
        <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          Mention someone
        </p>
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const q = (query ?? "").toLowerCase();
          const nameIdx = item.name.toLowerCase().indexOf(q);
          const emailIdx = item.email.toLowerCase().indexOf(q);

          return (
            <button
              key={item.id}
              type="button"
              className={[
                "flex items-center gap-3 w-full px-3 py-2 text-left transition-all duration-100",
                isSelected
                  ? "mention-item-selected bg-primary/10 text-primary"
                  : "hover:bg-muted/60 text-foreground",
              ].join(" ")}
              onClick={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {/* Avatar letter */}
              <span
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-100",
                  isSelected
                    ? "mention-avatar-selected bg-primary text-primary-foreground"
                    : "mention-avatar-default bg-primary/15 text-primary",
                ].join(" ")}
              >
                {item.name.charAt(0).toUpperCase()}
              </span>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight truncate">
                  {nameIdx >= 0 && q ? (
                    <>
                      {item.name.slice(0, nameIdx)}
                      <mark className="bg-primary/20 text-primary rounded px-0.5 font-semibold" style={{ backgroundColor: undefined }}>
                        {item.name.slice(nameIdx, nameIdx + q.length)}
                      </mark>
                      {item.name.slice(nameIdx + q.length)}
                    </>
                  ) : (
                    item.name
                  )}
                </p>
                <p className={[
                  "text-[11px] leading-tight truncate mt-0.5",
                  isSelected ? "text-primary/70" : "text-muted-foreground",
                ].join(" ")}>
                  {emailIdx >= 0 && q ? (
                    <>
                      {item.email.slice(0, emailIdx)}
                      <mark className="bg-primary/20 text-primary rounded px-0.5 font-semibold" style={{ backgroundColor: undefined }}>
                        {item.email.slice(emailIdx, emailIdx + q.length)}
                      </mark>
                      {item.email.slice(emailIdx + q.length)}
                    </>
                  ) : (
                    item.email
                  )}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    );
  }
);

MentionList.displayName = "MentionList";
export default MentionList;
