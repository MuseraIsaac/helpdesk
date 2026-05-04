import { createContext, useContext, useEffect, useRef, useState } from "react";
import { injectThemeColors, type ThemeColors } from "./theme-injector";
import { DEFAULT_PALETTE_ID, findPalette } from "./palettes";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY         = "helpdesk-theme";
const PALETTE_STORAGE_KEY = "helpdesk-palette";

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** Currently active palette id ("default" or a key from PALETTES). */
  paletteId: string;
  /** Switch palettes — passing "default" reverts to admin colours. */
  setPalette: (id: string) => void;
}>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  paletteId: DEFAULT_PALETTE_ID,
  setPalette: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme) ?? "dark";
    } catch {
      return "dark";
    }
  });

  const resolvedTheme = resolveTheme(theme);

  useEffect(() => {
    const root = document.documentElement;
    if (resolveTheme(theme) === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  // Re-apply when OS preference changes while theme === "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const root = document.documentElement;
      if (mq.matches) root.classList.add("dark");
      else root.classList.remove("dark");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // ── Palette state ────────────────────────────────────────────────────────
  // Layered on top of the admin /api/theme colours. When the user picks a
  // named palette, its hex values override the admin set; "default" reverts.
  const [paletteId, setPaletteIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(PALETTE_STORAGE_KEY) ?? DEFAULT_PALETTE_ID;
    } catch {
      return DEFAULT_PALETTE_ID;
    }
  });

  // Cache the admin-fetched colours so we can re-apply them when the user
  // picks "default" (palette = none) without another network round-trip.
  const adminColorsRef = useRef<ThemeColors | null>(null);

  // Apply admin colours + active palette together. Palette wins on overlap.
  function applyColors(adminColors: ThemeColors | null, paletteIdArg: string) {
    const palette = findPalette(paletteIdArg);
    const merged: ThemeColors = {
      ...(adminColors ?? {}),
      // Only spread palette's set keys; "default" has an empty .colors so
      // this is a no-op for it.
      ...(palette ? palette.colors : {}),
    };
    injectThemeColors(merged);
  }

  // Fetch admin-configured colours once on mount, then layer on the palette.
  useEffect(() => {
    fetch("/api/theme")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ThemeColors | null) => {
        adminColorsRef.current = data ?? {};
        applyColors(adminColorsRef.current, paletteId);
      })
      .catch(() => {
        adminColorsRef.current = {};
        applyColors({}, paletteId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply whenever the user switches palettes.
  useEffect(() => {
    if (adminColorsRef.current === null) return; // wait for initial fetch
    applyColors(adminColorsRef.current, paletteId);
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, paletteId);
    } catch { /* private mode — no-op */ }
  }, [paletteId]);

  const setTheme = (t: Theme) => setThemeState(t);

  const toggleTheme = () => {
    setThemeState((prev) => (resolveTheme(prev) === "dark" ? "light" : "dark"));
  };

  const setPalette = (id: string) => setPaletteIdState(id);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, paletteId, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
