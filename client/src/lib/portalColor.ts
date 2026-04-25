import type { CSSProperties } from "react";

/**
 * Converts a 6-digit hex color to its HSL components.
 * Returns { h: 0–360, s: 0–100, l: 0–100 }.
 */
export function hexToHslComponents(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace("#", "");
  const full = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw.padEnd(6, "0");

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Generates a set of CSS custom properties (--pa, --pa-dk, --pa-dkr, --pa-lt,
 * --pa-10, --pa-18) derived from a portal accent hex color.
 *
 * Inject the returned object as an inline `style` on a layout root element so
 * all descendants can reference `var(--pa)` etc. without prop-drilling.
 *
 * @param hex  A 6-digit hex color string, e.g. "#059669". Falls back to
 *             emerald-600 if the value is missing or invalid.
 */
/**
 * Generates CSS custom properties for the AGENT login page's dark left panel.
 *
 * Unlike portalAccentVars (which produces a bright colored panel), this always
 * produces a DARK panel — the chosen color is the hue/saturation tint, but
 * lightness is clamped low so the panel stays dark and professional regardless
 * of the raw input color.
 *
 * Variables:
 *   --al-dk1   Very dark background (gradient start)
 *   --al-dk2   Dark background (gradient mid)
 *   --al-dk3   Dark background (gradient end)
 *   --al-glow  Glow orb color
 *   --al-lt    Icon / feature tint color
 *   --al-ll    Lightest tint (highlight text gradient second stop)
 */
export function agentLoginVars(hex: string | undefined | null): CSSProperties {
  const safe = hex && /^#[0-9a-fA-F]{3,6}$/.test(hex) ? hex : "#6366f1";
  const { h, s, l } = hexToHslComponents(safe);
  // Cap input lightness so we always stay dark even if user picks a light color.
  const base = Math.min(l, 55);

  return {
    "--al-dk1":  `hsl(${h} ${s}% ${Math.max(5,  base - 38)}%)`,
    "--al-dk2":  `hsl(${h} ${Math.max(20, s - 10)}% ${Math.max(10, base - 24)}%)`,
    "--al-dk3":  `hsl(${h} ${s}% ${Math.max(7,  base - 32)}%)`,
    "--al-glow": `hsl(${h} ${s}% ${Math.min(70, base + 18)}%)`,
    "--al-lt":   `hsl(${h} ${s}% ${Math.min(82, base + 32)}%)`,
    "--al-ll":   `hsl(${h} ${Math.max(30, s - 20)}% ${Math.min(90, base + 44)}%)`,
  } as CSSProperties;
}

export function portalAccentVars(hex: string | undefined | null): CSSProperties {
  const safe = hex && /^#[0-9a-fA-F]{3,6}$/.test(hex) ? hex : "#059669";
  const { h, s, l } = hexToHslComponents(safe);

  return {
    "--pa":     `hsl(${h} ${s}% ${l}%)`,
    "--pa-dk":  `hsl(${h} ${s}% ${Math.max(0,  l - 18)}%)`,
    "--pa-dkr": `hsl(${h} ${s}% ${Math.max(0,  l - 30)}%)`,
    "--pa-lt":  `hsl(${h} ${s}% ${Math.min(95, l + 28)}%)`,
    "--pa-10":  `hsl(${h} ${s}% ${l}% / 0.10)`,
    "--pa-18":  `hsl(${h} ${s}% ${l}% / 0.18)`,
  } as CSSProperties;
}
