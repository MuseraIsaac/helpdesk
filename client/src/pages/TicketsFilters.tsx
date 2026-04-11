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
        value={filters.ticketType ?? ALL}
        onValueChange={(value) =>
          onChange({ ...filters, ticketType: value === ALL ? undefined : (value as TicketFilters["ticketType"]) })
        }
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {ticketTypes.map((t) => (
            <SelectItem key={t} value={t}>{ticketTypeLabel[t]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status ?? ALL}
        onValueChange={(value) =>
          onChange({ ...filters, status: value === ALL ? undefined : (value as TicketFilters["status"]) })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {agentTicketStatuses.map((s) => (
            <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority ?? ALL}
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
        value={filters.severity ?? ALL}
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
        value={filters.category ?? ALL}
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
          value={filters.teamId !== undefined ? String(filters.teamId) : ALL}
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
