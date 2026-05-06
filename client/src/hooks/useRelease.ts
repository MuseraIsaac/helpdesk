/**
 * useRelease — fetches `/release.json` (the repo-root manifest, served by a
 * tiny Vite middleware in dev and emitted into dist/ at build time).
 *
 * The same file is the source of truth for the in-app updates feature, so
 * we accept its native field names (`name`, `version`, `publishedAt`,
 * `highlights`) plus a few About-dialog-specific optional fields
 * (`subtitle`, `tagline`, `copyright`).
 */

import { useQuery } from "@tanstack/react-query";

/** Raw shape of release.json (only the fields we use here). */
interface RawRelease {
  name?:        string;
  version?:     string;
  publishedAt?: string;
  channel?:     string;
  highlights?:  string[];
  // Optional About-dialog fields — author may add these to release.json.
  subtitle?:    string;
  tagline?:     string;
  copyright?:   string;
}

/** Normalized shape consumed by the AboutDialog. */
export interface ReleaseInfo {
  name:       string;
  version:    string;
  buildDate:  string;
  channel:    string | null;
  subtitle:   string;
  tagline:    string;
  copyright:  string;
  features:   string[];
}

const FALLBACK: ReleaseInfo = {
  name:      "Zentra",
  version:   "dev",
  buildDate: new Date().toISOString().slice(0, 10),
  channel:   null,
  subtitle:  "ITSM MANAGEMENT · AI-Powered ITSM",
  tagline:   "A modern, AI-augmented service desk for IT teams who want to move fast without breaking things — built around the ITIL-4 lifecycle with a customer portal, real-time analytics, and a workflow engine that adapts to your team's process.",
  copyright: "© 2026 Zentra. All rights reserved.",
  features:  [],
};

function normalize(raw: RawRelease): ReleaseInfo {
  return {
    name:      raw.name      || FALLBACK.name,
    version:   raw.version   || FALLBACK.version,
    buildDate: raw.publishedAt || FALLBACK.buildDate,
    channel:   raw.channel   ?? null,
    subtitle:  raw.subtitle  || FALLBACK.subtitle,
    tagline:   raw.tagline   || FALLBACK.tagline,
    copyright: raw.copyright || FALLBACK.copyright,
    features:  raw.highlights ?? [],
  };
}

export function useRelease() {
  return useQuery<ReleaseInfo>({
    queryKey: ["release-info"],
    queryFn: async () => {
      const res = await fetch("/release.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`release.json fetch failed: HTTP ${res.status}`);
      return normalize(await res.json() as RawRelease);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: FALLBACK,
    retry: false,
  });
}

export { FALLBACK as DEFAULT_RELEASE };
