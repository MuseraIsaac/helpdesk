/**
 * color-utils.ts — Pure color conversion and contrast utilities.
 *
 * All functions operate on 6-digit hex strings (#rrggbb).
 * No runtime dependencies.
 */

// ── Validation ────────────────────────────────────────────────────────────────

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeHex(value: string): string {
  const cleaned = value.trim();
  // Expand 3-digit shorthand → 6-digit
  if (/^#[0-9a-fA-F]{3}$/.test(cleaned)) {
    return (
      "#" +
      cleaned[1] +
      cleaned[1] +
      cleaned[2] +
      cleaned[2] +
      cleaned[3] +
      cleaned[3]
    );
  }
  return cleaned;
}

// ── Conversion helpers ────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function hexToHsl(hex: string): [number, number, number] {
  const [rr, gg, bb] = hexToRgb(hex);
  const r = rr / 255,
    g = gg / 255,
    b = bb / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = h / 360,
    ss = s / 100,
    ll = l / 100;
  let r, g, b;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

// ── WCAG contrast ─────────────────────────────────────────────────────────────

/**
 * Returns the WCAG relative luminance (0–1) for a hex color.
 */
export function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns "#ffffff" or "#0d0d0d" — whichever gives better WCAG contrast
 * against the given background color.
 */
export function getContrastForeground(hex: string): "#ffffff" | "#0d0d0d" {
  return getLuminance(hex) > 0.179 ? "#0d0d0d" : "#ffffff";
}

// ── Dark-mode derivation ──────────────────────────────────────────────────────

/**
 * Lightens a brand color (primary, danger, success, warning) for use on
 * dark backgrounds: boosts HSL lightness by 15 percentage points, caps at 80.
 * Preserves hue and saturation (minimum 35 % to stay vivid).
 */
export function lightenForDarkMode(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(s, 35), Math.min(l + 15, 80));
}

/**
 * Darkens a background-type color (secondary, accent) for dark mode:
 * preserves hue, reduces saturation to ≤ 20 %, forces lightness to 18 %.
 */
export function darkenForBackground(hex: string): string {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, Math.min(s, 20), 18);
}
