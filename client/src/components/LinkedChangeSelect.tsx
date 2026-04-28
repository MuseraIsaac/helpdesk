import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import SearchableSelect from "./SearchableSelect";

interface ChangeSummary {
  id: number;
  changeNumber: string;
  title: string;
  state: string;
}

interface Props {
  value: string | null | undefined;
  onChange: (changeNumber: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

const NONE = "";

export default function LinkedChangeSelect({
  value,
  onChange,
  disabled,
  placeholder = "Search for a change…",
}: Props) {
  const { data, isLoading } = useQuery<{ changes: ChangeSummary[] }>({
    queryKey: ["changes-for-link-select"],
    queryFn: async () => {
      const { data } = await axios.get("/api/changes", {
        params: { pageSize: 100, sortBy: "updatedAt", sortOrder: "desc" },
      });
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const options = [
    { value: NONE, label: "None" },
    ...(data?.changes ?? []).map((c) => ({
      value: c.changeNumber,
      label: `${c.changeNumber} — ${c.title}`,
    })),
  ];

  return (
    <SearchableSelect
      value={value ?? NONE}
      options={options}
      placeholder={isLoading ? "Loading changes…" : placeholder}
      searchPlaceholder="Search by number or title…"
      onChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled || isLoading}
    />
  );
}
