import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface EmailChipsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  /** ARIA label for the underlying text input. */
  ariaLabel?: string;
  /** Extra class on the outer container (the focus ring host). */
  containerClassName?: string;
}

/**
 * EmailChipsInput — Gmail/Outlook-style recipient field.
 *
 * Type an address and press `,`, `;`, `Enter`, or `Tab` to lock it in as a
 * chip. Paste a comma- or semicolon-separated list to add many at once.
 * Backspace on an empty input removes the previous chip. The component
 * deliberately does not validate the address format — the server treats the
 * value as an opaque RFC2822 address line so display-name forms like
 * `"Asha Patel <asha@acme.io>"` are accepted as-is.
 */
export default function EmailChipsInput({
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
  containerClassName = "",
}: EmailChipsInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const pieces = raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pieces.length) return;
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of pieces) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  function removeAt(index: number) {
    const next = value.slice();
    next.splice(index, 1);
    onChange(next);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (draft.trim()) {
        // Don't preventDefault on Tab so the user can still tab away when
        // the field is empty — only intercept when there's a draft to commit.
        e.preventDefault();
        commit(draft);
      } else if (e.key === "," || e.key === ";") {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }

  function handleBlur() {
    if (draft.trim()) commit(draft);
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={`
        flex flex-wrap items-center gap-1.5 min-h-8 cursor-text
        focus-within:outline-none
        ${containerClassName}
      `}
    >
      {value.map((chip, i) => (
        <span
          key={`${chip}-${i}`}
          className="
            inline-flex items-center gap-1 max-w-full
            rounded-full bg-primary/10 text-primary
            border border-primary/20
            pl-2.5 pr-1 py-0.5 text-xs font-medium
            shadow-sm
            hover:bg-primary/15 hover:border-primary/30 transition-colors
          "
          title={chip}
        >
          <span className="truncate max-w-[18rem]">{chip}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(i);
            }}
            className="
              shrink-0 inline-flex h-4 w-4 items-center justify-center
              rounded-full text-primary/70 hover:text-primary
              hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/40
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            aria-label={`Remove ${chip}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (/[,;\n]/.test(text)) {
            e.preventDefault();
            commit(draft + text);
          }
        }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="
          flex-1 min-w-[8rem] bg-transparent outline-none border-0
          h-7 px-1 text-sm placeholder:text-muted-foreground/60
          disabled:cursor-not-allowed
        "
      />
    </div>
  );
}
