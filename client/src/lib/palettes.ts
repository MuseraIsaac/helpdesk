/**
 * Curated colour palettes the user can pick from to recolour the app.
 *
 * Each palette plugs into the existing `injectThemeColors` infrastructure
 * (theme-injector.ts) and overrides whatever admin-configured colours are
 * loaded from `/api/theme`. Selecting "default" clears the override and
 * restores the admin's choice.
 *
 * Design rules:
 *  - Every palette is *vibrant* — desaturated/grey hues are intentionally
 *    avoided. Users picking a palette want a noticeable change.
 *  - `primary` drives the most surfaces, so it's the most distinctive hue.
 *  - `success` / `warning` / `danger` stay in their conventional families
 *    (green-ish, amber-ish, red-ish) — palettes shouldn't break "is this
 *    a destructive button" instincts. Only the *shade* shifts.
 *  - `accent` and `secondary` colour large background surfaces, so they
 *    use lighter / more pastel tones of the primary family.
 *  - `sidebarLight` / `sidebarDark` carry the strongest "vibe" signal and
 *    are usually a deep saturated form of the primary family.
 *
 * The `swatch` array drives the picker preview chip — three colours
 * arranged left-to-right. Pick the most representative trio for visual ID.
 */

import type { ThemeColors } from "./theme-injector";

export interface ThemePalette {
  id:          string;
  name:        string;
  /** One-line tagline for tooltips. */
  description: string;
  /** Three hex colours rendered as a stripe in the picker. */
  swatch:      [string, string, string];
  /** Full colour set fed through theme-injector. */
  colors:      ThemeColors;
}

/**
 * The "default" palette is a sentinel meaning "use admin-configured colours".
 * Picking it clears the user override.
 */
export const DEFAULT_PALETTE_ID = "default";

export const PALETTES: ThemePalette[] = [
  // ── Default — clears overrides, returns to admin colors ────────────────
  {
    id:          DEFAULT_PALETTE_ID,
    name:        "Default",
    description: "Use the colours configured by your admin.",
    swatch:      ["#6366f1", "#10b981", "#f59e0b"],
    colors:      {},
  },

  // ── Indigo Twilight ─────────────────────────────────────────────────────
  // The "shipped" feel — deep indigo brand, classic for ITSM.
  {
    id:          "indigo-twilight",
    name:        "Indigo Twilight",
    description: "Deep indigo & violet — the classic enterprise look.",
    swatch:      ["#6366f1", "#8b5cf6", "#a78bfa"],
    colors: {
      customPrimaryColor:      "#6366f1",
      customSuccessColor:      "#10b981",
      customWarningColor:      "#f59e0b",
      customDangerColor:       "#ef4444",
      customSecondaryColor:    "#ede9fe",
      customAccentColor:       "#e0e7ff",
      customSidebarLightColor: "#f5f3ff",
      customSidebarDarkColor:  "#1e1b4b",
    },
  },

  // ── Sunset ──────────────────────────────────────────────────────────────
  // Warm, energetic — orange / amber / coral.
  {
    id:          "sunset",
    name:        "Sunset",
    description: "Warm orange and coral — energetic and inviting.",
    swatch:      ["#f97316", "#ef4444", "#f59e0b"],
    colors: {
      customPrimaryColor:      "#f97316",
      customSuccessColor:      "#22c55e",
      customWarningColor:      "#fbbf24",
      customDangerColor:       "#dc2626",
      customSecondaryColor:    "#ffedd5",
      customAccentColor:       "#fed7aa",
      customSidebarLightColor: "#fff7ed",
      customSidebarDarkColor:  "#431407",
    },
  },

  // ── Ocean ───────────────────────────────────────────────────────────────
  // Cool, calm — teal/cyan/sky.
  {
    id:          "ocean",
    name:        "Ocean",
    description: "Cool teal and cyan — calm and focused.",
    swatch:      ["#0891b2", "#06b6d4", "#14b8a6"],
    colors: {
      customPrimaryColor:      "#0891b2",
      customSuccessColor:      "#10b981",
      customWarningColor:      "#f59e0b",
      customDangerColor:       "#ef4444",
      customSecondaryColor:    "#cffafe",
      customAccentColor:       "#a5f3fc",
      customSidebarLightColor: "#ecfeff",
      customSidebarDarkColor:  "#083344",
    },
  },

  // ── Forest ──────────────────────────────────────────────────────────────
  // Verdant green — eco / fintech feel.
  {
    id:          "forest",
    name:        "Forest",
    description: "Lush emerald — natural and grounded.",
    swatch:      ["#059669", "#10b981", "#84cc16"],
    colors: {
      customPrimaryColor:      "#059669",
      customSuccessColor:      "#16a34a",
      customWarningColor:      "#eab308",
      customDangerColor:       "#dc2626",
      customSecondaryColor:    "#d1fae5",
      customAccentColor:       "#a7f3d0",
      customSidebarLightColor: "#ecfdf5",
      customSidebarDarkColor:  "#022c22",
    },
  },

  // ── Berry ───────────────────────────────────────────────────────────────
  // Rich pinks and fuchsia — playful but premium.
  {
    id:          "berry",
    name:        "Berry",
    description: "Rich rose and fuchsia — bold and modern.",
    swatch:      ["#ec4899", "#d946ef", "#f43f5e"],
    colors: {
      customPrimaryColor:      "#ec4899",
      customSuccessColor:      "#10b981",
      customWarningColor:      "#f59e0b",
      customDangerColor:       "#dc2626",
      customSecondaryColor:    "#fce7f3",
      customAccentColor:       "#fbcfe8",
      customSidebarLightColor: "#fdf2f8",
      customSidebarDarkColor:  "#500724",
    },
  },

  // ── Cyber ───────────────────────────────────────────────────────────────
  // Neon synth-wave — electric blue + magenta + lime accents.
  {
    id:          "cyber",
    name:        "Cyber",
    description: "Electric blue with neon accents — synthwave energy.",
    swatch:      ["#2563eb", "#a855f7", "#22d3ee"],
    colors: {
      customPrimaryColor:      "#2563eb",
      customSuccessColor:      "#22d3ee",
      customWarningColor:      "#facc15",
      customDangerColor:       "#f43f5e",
      customSecondaryColor:    "#dbeafe",
      customAccentColor:       "#bfdbfe",
      customSidebarLightColor: "#eff6ff",
      customSidebarDarkColor:  "#0c1023",
    },
  },

  // ── Monarch ─────────────────────────────────────────────────────────────
  // Royal purple + gold — premium / executive.
  {
    id:          "monarch",
    name:        "Monarch",
    description: "Royal purple with golden accents — luxurious.",
    swatch:      ["#7c3aed", "#a855f7", "#f59e0b"],
    colors: {
      customPrimaryColor:      "#7c3aed",
      customSuccessColor:      "#10b981",
      customWarningColor:      "#f59e0b",
      customDangerColor:       "#dc2626",
      customSecondaryColor:    "#ede9fe",
      customAccentColor:       "#ddd6fe",
      customSidebarLightColor: "#faf5ff",
      customSidebarDarkColor:  "#2e1065",
    },
  },

  // ── Crimson ─────────────────────────────────────────────────────────────
  // Bold red — law-enforcement / emergency feel.
  {
    id:          "crimson",
    name:        "Crimson",
    description: "Deep red — bold and decisive.",
    swatch:      ["#dc2626", "#b91c1c", "#fb923c"],
    colors: {
      customPrimaryColor:      "#dc2626",
      customSuccessColor:      "#16a34a",
      customWarningColor:      "#f59e0b",
      customDangerColor:       "#991b1b",
      customSecondaryColor:    "#fee2e2",
      customAccentColor:       "#fecaca",
      customSidebarLightColor: "#fef2f2",
      customSidebarDarkColor:  "#450a0a",
    },
  },

  // ── Aurora ──────────────────────────────────────────────────────────────
  // Northern-lights inspired: teal primary with magenta+green accents.
  {
    id:          "aurora",
    name:        "Aurora",
    description: "Iridescent teal & magenta — dreamy gradient.",
    swatch:      ["#14b8a6", "#a855f7", "#f472b6"],
    colors: {
      customPrimaryColor:      "#14b8a6",
      customSuccessColor:      "#22c55e",
      customWarningColor:      "#facc15",
      customDangerColor:       "#f43f5e",
      customSecondaryColor:    "#ccfbf1",
      customAccentColor:       "#a5f3fc",
      customSidebarLightColor: "#f0fdfa",
      customSidebarDarkColor:  "#042f2e",
    },
  },

  // ── Mango ───────────────────────────────────────────────────────────────
  // Tropical — sunny yellow / lime / pink.
  {
    id:          "mango",
    name:        "Mango",
    description: "Tropical yellow with citrus accents.",
    swatch:      ["#eab308", "#84cc16", "#f97316"],
    colors: {
      customPrimaryColor:      "#eab308",
      customSuccessColor:      "#65a30d",
      customWarningColor:      "#f97316",
      customDangerColor:       "#dc2626",
      customSecondaryColor:    "#fef9c3",
      customAccentColor:       "#fef08a",
      customSidebarLightColor: "#fefce8",
      customSidebarDarkColor:  "#422006",
    },
  },

  // ── Slate Mono ──────────────────────────────────────────────────────────
  // Vibrant exception: mostly mono with a single accent for users who
  // want quiet UI — kept in the colorful list so the trade-off is clear.
  {
    id:          "slate-mono",
    name:        "Slate Mono",
    description: "Calm monochrome with a single sky-blue accent.",
    swatch:      ["#0ea5e9", "#475569", "#64748b"],
    colors: {
      customPrimaryColor:      "#0ea5e9",
      customSuccessColor:      "#10b981",
      customWarningColor:      "#f59e0b",
      customDangerColor:       "#ef4444",
      customSecondaryColor:    "#e2e8f0",
      customAccentColor:       "#cbd5e1",
      customSidebarLightColor: "#f8fafc",
      customSidebarDarkColor:  "#0f172a",
    },
  },
];

export function findPalette(id: string | null | undefined): ThemePalette | null {
  if (!id) return null;
  return PALETTES.find((p) => p.id === id) ?? null;
}
