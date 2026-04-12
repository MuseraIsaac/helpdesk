/**
 * theme-injector.ts — Builds and injects custom CSS variable overrides from
 * admin-configured hex colors, producing a `<style id="__theme_overrides">`
 * element that overrides the OKLCH defaults in index.css.
 *
 * Brand colors (primary, danger, success, warning):
 *   light = stored hex, dark = lightenForDarkMode(hex)
 * Background colors (secondary, accent):
 *   light = stored hex, dark = darkenForBackground(hex)
 * Sidebar:
 *   separate light/dark values
 *
 * Foreground colors are derived automatically via WCAG luminance contrast.
 */

import {
  isValidHex,
  getContrastForeground,
  lightenForDarkMode,
  darkenForBackground,
} from "./color-utils";

export interface ThemeColors {
  customPrimaryColor?:      string;
  customSuccessColor?:      string;
  customWarningColor?:      string;
  customDangerColor?:       string;
  customSecondaryColor?:    string;
  customAccentColor?:       string;
  customSidebarLightColor?: string;
  customSidebarDarkColor?:  string;
}

/**
 * Builds the raw CSS string for `:root` and `.dark` overrides.
 * Returns an empty string if no valid colors are provided.
 */
export function buildThemeCss(colors: ThemeColors): string {
  const light: string[] = [];
  const dark: string[] = [];

  // ── Brand color helper ────────────────────────────────────────────────────
  // Sets varName and varName-foreground in both `:root` and `.dark`.
  function brand(hex: string, varName: string) {
    const lightFg  = getContrastForeground(hex);
    const darkHex  = lightenForDarkMode(hex);
    const darkFg   = getContrastForeground(darkHex);
    light.push(`  ${varName}: ${hex};`, `  ${varName}-foreground: ${lightFg};`);
    dark.push(`  ${varName}: ${darkHex};`, `  ${varName}-foreground: ${darkFg};`);
  }

  // ── Background color helper ───────────────────────────────────────────────
  // Uses darkenForBackground for the dark variant.
  function bg(hex: string, varName: string) {
    const lightFg  = getContrastForeground(hex);
    const darkHex  = darkenForBackground(hex);
    const darkFg   = getContrastForeground(darkHex);
    light.push(`  ${varName}: ${hex};`, `  ${varName}-foreground: ${lightFg};`);
    dark.push(`  ${varName}: ${darkHex};`, `  ${varName}-foreground: ${darkFg};`);
  }

  // ── Primary ───────────────────────────────────────────────────────────────
  // Also propagates to ring, chart-1, sidebar-primary, sidebar-ring.
  if (isValidHex(colors.customPrimaryColor ?? "")) {
    const hex    = colors.customPrimaryColor!;
    const lightFg = getContrastForeground(hex);
    const darkHex = lightenForDarkMode(hex);
    const darkFg  = getContrastForeground(darkHex);

    light.push(
      `  --primary: ${hex};`,
      `  --primary-foreground: ${lightFg};`,
      `  --ring: ${hex};`,
      `  --chart-1: ${hex};`,
      `  --sidebar-primary: ${hex};`,
      `  --sidebar-primary-foreground: ${lightFg};`,
      `  --sidebar-ring: ${hex};`,
    );
    dark.push(
      `  --primary: ${darkHex};`,
      `  --primary-foreground: ${darkFg};`,
      `  --ring: ${darkHex};`,
      `  --chart-1: ${darkHex};`,
      `  --sidebar-primary: ${darkHex};`,
      `  --sidebar-primary-foreground: ${darkFg};`,
      `  --sidebar-ring: ${darkHex};`,
    );
  }

  // ── Danger ────────────────────────────────────────────────────────────────
  if (isValidHex(colors.customDangerColor ?? "")) {
    brand(colors.customDangerColor!, "--destructive");
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (isValidHex(colors.customSuccessColor ?? "")) {
    brand(colors.customSuccessColor!, "--success");
  }

  // ── Warning ───────────────────────────────────────────────────────────────
  if (isValidHex(colors.customWarningColor ?? "")) {
    brand(colors.customWarningColor!, "--warning");
  }

  // ── Secondary ─────────────────────────────────────────────────────────────
  if (isValidHex(colors.customSecondaryColor ?? "")) {
    bg(colors.customSecondaryColor!, "--secondary");
  }

  // ── Accent ────────────────────────────────────────────────────────────────
  if (isValidHex(colors.customAccentColor ?? "")) {
    bg(colors.customAccentColor!, "--accent");
  }

  // ── Sidebar (separate light / dark) ──────────────────────────────────────
  if (isValidHex(colors.customSidebarLightColor ?? "")) {
    const hex = colors.customSidebarLightColor!;
    const fg  = getContrastForeground(hex);
    light.push(`  --sidebar: ${hex};`, `  --sidebar-foreground: ${fg};`);
  }

  if (isValidHex(colors.customSidebarDarkColor ?? "")) {
    const hex = colors.customSidebarDarkColor!;
    const fg  = getContrastForeground(hex);
    dark.push(`  --sidebar: ${hex};`, `  --sidebar-foreground: ${fg};`);
  }

  if (light.length === 0 && dark.length === 0) return "";

  const parts: string[] = [];
  if (light.length > 0) parts.push(`:root {\n${light.join("\n")}\n}`);
  if (dark.length > 0) parts.push(`.dark {\n${dark.join("\n")}\n}`);
  return parts.join("\n");
}

/**
 * Injects (or updates) the `<style id="__theme_overrides">` element in
 * `<head>`. Removes the element if no valid colors are present.
 */
export function injectThemeColors(colors: ThemeColors): void {
  const css      = buildThemeCss(colors);
  const existing = document.getElementById("__theme_overrides");

  if (!css) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.textContent = css;
  } else {
    const style = document.createElement("style");
    style.id    = "__theme_overrides";
    style.textContent = css;
    document.head.appendChild(style);
  }
}

/** Removes all custom color overrides (reverts to CSS defaults). */
export function clearThemeColors(): void {
  document.getElementById("__theme_overrides")?.remove();
}
