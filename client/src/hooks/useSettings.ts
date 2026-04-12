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
      queryClient.setQueryData(["settings", section], saved);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
