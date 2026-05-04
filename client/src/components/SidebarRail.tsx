/**
 * SidebarRail — a thin decorative column that sits between a sidebar and the
 * main content area. Picks up the active palette via the brand colour tokens
 * (`--sidebar-primary` / `--primary`) so it recolours with the user's chosen
 * theme palette.
 *
 * The rail is purely decorative — no interactivity, `aria-hidden` for AT.
 *
 * Visual recipe:
 *   - 6px wide column.
 *   - Vertical gradient that brightens at top and bottom and dims in the middle,
 *     producing a "spotlight" feel rather than a flat stripe.
 *   - Three faint accent nodes at 25 / 50 / 75 % anchor the rail visually.
 *   - In dark mode the gradient gets a touch of glow via box-shadow.
 *
 * Usage:
 *   <SidebarRail side="right" tone="sidebar" />  ← right edge of left sidebar
 *   <SidebarRail side="left"  tone="primary" />  ← left edge of right sidebar
 */

interface SidebarRailProps {
  side:  "left" | "right";
  /**
   * Which colour token family to use:
   *  - "sidebar"  pulls from `--sidebar-primary` (matches left sidebar)
   *  - "primary"  pulls from `--primary`        (matches right rail / main content)
   */
  tone:  "sidebar" | "primary";
  /** Optional className passthrough (positioning, hidden classes etc). */
  className?: string;
}

export default function SidebarRail({ side, tone, className = "" }: SidebarRailProps) {
  // Compose colour expressions from the appropriate token. CSS color-mix
  // lets us produce a tinted background without preprocessing — good
  // browser support (Chromium/Firefox/Safari modern). Falls back to the
  // raw token if color-mix isn't supported (still readable, just flat).
  const base    = tone === "sidebar" ? "var(--sidebar-primary)" : "var(--primary)";
  const subtle  = `color-mix(in oklab, ${base} 18%, transparent)`;
  const fainter = `color-mix(in oklab, ${base} 8%, transparent)`;
  const glow    = `color-mix(in oklab, ${base} 28%, transparent)`;

  return (
    <div
      aria-hidden
      className={[
        "relative w-[6px] shrink-0 select-none pointer-events-none",
        // Hide on small screens where every pixel of horizontal space matters
        "hidden lg:block",
        className,
      ].join(" ")}
      style={{
        // Vertical highlight gradient — bright at top & bottom, dim in the
        // middle — gives the rail a sense of being lit by ambient light
        // rather than a uniform painted stripe.
        background: `
          linear-gradient(
            to bottom,
            ${fainter} 0%,
            ${subtle} 12%,
            ${fainter} 50%,
            ${subtle} 88%,
            ${fainter} 100%
          )
        `,
        // Faint inset to give the strip a touch of depth
        boxShadow: side === "left"
          ? `inset 1px 0 0 ${fainter}, inset -1px 0 0 ${fainter}`
          : `inset 1px 0 0 ${fainter}, inset -1px 0 0 ${fainter}`,
      }}
    >
      {/* Three accent nodes — small soft-glow dots anchored at the
          quartile marks. Positioned absolutely so they don't disturb
          the parent flex sizing. */}
      {[25, 50, 75].map((pct) => (
        <span
          key={pct}
          className="absolute left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full"
          style={{
            top:        `${pct}%`,
            background: base,
            boxShadow:  `0 0 6px ${glow}, 0 0 2px ${glow}`,
            opacity:    pct === 50 ? 0.8 : 0.55,
          }}
        />
      ))}

      {/* Hairline accents at the very top and bottom — visually anchors the
          rail to the surrounding chrome (header / footer borders). */}
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: subtle }}
      />
      <span
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: subtle }}
      />
    </div>
  );
}
