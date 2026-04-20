import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type {
  SettingsSection,
  SectionData,
  AllSettings,
} from "core/schemas/settings.ts";

// ── Read ──────────────────────────────────────────────────────────────────────

/** Load a single section's settings. Returns server data merged with defaults. */
export function useSettings<S extends SettingsSection>(section: S) {
  return useQuery<SectionData<S>>({
    queryKey: ["settings", section],
    queryFn: async () => {
      const { data } = await axios.get<{ section: string; data: SectionData<S> }>(
        `/api/settings/${section}`
      );
      return data.data;
    },
    // Settings change infrequently. Disable all background refetches that
    // would trigger reset() while the user is editing, silently clearing
    // isDirty and disabling the Save button.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Load all sections at once (used for settings search index). */
export function useAllSettings() {
  return useQuery<AllSettings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await axios.get<{ settings: AllSettings }>("/api/settings");
      return data.settings;
    },
  });
}

// ── Write ─────────────────────────────────────────────────────────────────────

/** Save a section (partial or full). Invalidates both section and all-settings caches. */
export function useUpdateSettings<S extends SettingsSection>(section: S) {
  const queryClient = useQueryClient();
  return useMutation<SectionData<S>, Error, Partial<SectionData<S>>>({
    mutationFn: async (body) => {
      const { data } = await axios.put<{ data: SectionData<S> }>(
        `/api/settings/${section}`,
        body
      );
      return data.data;
    },
    onSuccess: (saved) => {
      // Update the section cache directly — no need to refetch.
      queryClient.setQueryData(["settings", section], saved);
      // Invalidate ONLY the aggregated all-settings query (used by the search
      // index). Avoid partial-key invalidation, which would also mark the
      // current section as stale, trigger a background refetch, call reset(),
      // and silently flip isDirty back to false while the user is still editing.
      queryClient.invalidateQueries({ queryKey: ["settings"], exact: true });
    },
  });
}
