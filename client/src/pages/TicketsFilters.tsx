import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { agentTicketStatuses, statusLabel } from "core/constants/ticket-status.ts";
import { ticketTypes, ticketTypeLabel } from "core/constants/ticket-type.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel } from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityShortLabel } from "core/constants/ticket-severity.ts";
import type { TicketFilters } from "./TicketsPage";

interface Team {
  id: number;
  name: string;
  color: string;
}

const ALL = "__all__";

// When a saved view (or the multi-select sidebar) sets a multi-value filter,
// the live filter bar can't display it as a single-select value — fall back
// to "All" so the select isn't broken.
function singleVal(v: string | string[] | undefined): string {
  if (v == null || Array.isArray(v)) return ALL;
  return v;
}

function singleId(v: number | number[] | undefined): number | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? undefined : v;
}

function singleTeam(v: number | "none" | (number | "none")[] | undefined): string {
  if (v == null || Array.isArray(v)) return ALL;
  return String(v);
}

interface CustomStatusConfig {
  id: number;
  label: string;
  color: string;
  isActive: boolean;
}

interface CustomTicketTypeConfig {
  id: number;
  name: string;
  isActive: boolean;
}

interface TicketsFiltersProps {
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}

export default function TicketsFilters({ filters, onChange }: TicketsFiltersProps) {
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
  });

  const { data: customStatusesData } = useQuery({
    queryKey: ["ticket-status-configs"],
    queryFn: async () => {
      const { data } = await axios.get<{ configs: CustomStatusConfig[] }>("/api/ticket-status-configs");
      return data.configs;
    },
  });

  const { data: customTicketTypesData } = useQuery({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get<{ ticketTypes: CustomTicketTypeConfig[] }>("/api/ticket-types");
      return data.ticketTypes;
    },
  });
  const activeCustomTypes = (customTicketTypesData ?? []).filter((t) => t.isActive);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tickets..."
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          className="pl-8"
        />
      </div>

      <Select
        value={
          singleId(filters.customTicketTypeId) != null
            ? `custom_${singleId(filters.customTicketTypeId)}`
            : singleVal(filters.ticketType as string | string[] | undefined)
        }
        onValueChange={(value) => {
          if (value === ALL) {
            onChange({ ...filters, ticketType: undefined, customTicketTypeId: undefined });
          } else if (value.startsWith("custom_")) {
            onChange({ ...filters, ticketType: undefined, customTicketTypeId: parseInt(value.replace("custom_", ""), 10) });
          } else {
            onChange({ ...filters, ticketType: value as TicketFilters["ticketType"], customTicketTypeId: undefined });
          }
        }}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {ticketTypes.map((t) => (
            <SelectItem key={t} value={t}>{ticketTypeLabel[t]}</SelectItem>
          ))}
          {activeCustomTypes.map((t) => (
            <SelectItem key={`custom_${t.id}`} value={`custom_${t.id}`}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={
          singleId(filters.customStatusId) != null
            ? `custom_${singleId(filters.customStatusId)}`
            : singleVal(filters.status as string | string[] | undefined)
        }
        onValueChange={(value) => {
          if (value === ALL) {
            onChange({ ...filters, status: undefined, customStatusId: undefined });
          } else if (value.startsWith("custom_")) {
            onChange({ ...filters, status: undefined, customStatusId: parseInt(value.replace("custom_", ""), 10) });
          } else {
            onChange({ ...filters, status: value as TicketFilters["status"], customStatusId: undefined });
          }
        }}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {agentTicketStatuses.map((s) => (
            <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
          ))}
          {(customStatusesData ?? [])
            .filter((cs) => cs.isActive)
            .map((cs) => (
              <SelectItem key={`custom_${cs.id}`} value={`custom_${cs.id}`}>
                {cs.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Select
        value={singleVal(filters.priority)}
        onValueChange={(value) =>
          onChange({ ...filters, priority: value === ALL ? undefined : (value as TicketFilters["priority"]) })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All priorities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All priorities</SelectItem>
          {ticketPriorities.map((p) => (
            <SelectItem key={p} value={p}>{priorityLabel[p]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={singleVal(filters.severity)}
        onValueChange={(value) =>
          onChange({ ...filters, severity: value === ALL ? undefined : (value as TicketFilters["severity"]) })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All severities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All severities</SelectItem>
          {ticketSeverities.map((s) => (
            <SelectItem key={s} value={s}>{severityShortLabel[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={singleVal(filters.category)}
        onValueChange={(value) =>
          onChange({ ...filters, category: value === ALL ? undefined : (value as TicketFilters["category"]) })
        }
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          <SelectItem value="general_question">{categoryLabel.general_question}</SelectItem>
          <SelectItem value="technical_question">{categoryLabel.technical_question}</SelectItem>
          <SelectItem value="refund_request">{categoryLabel.refund_request}</SelectItem>
        </SelectContent>
      </Select>

      {teamsData && teamsData.length > 0 && (
        <Select
          value={singleTeam(filters.teamId)}
          onValueChange={(value) =>
            onChange({
              ...filters,
              teamId:
                value === ALL
                  ? undefined
                  : value === "none"
                  ? "none"
                  : Number(value),
            })
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            <SelectItem value="none">No team</SelectItem>
            {teamsData.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
