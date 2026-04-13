import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  type ColumnDef,
  type SortingState,
  type PaginationState,
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { type Ticket } from "core/constants/ticket.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { escalationReasonLabel } from "core/constants/escalation-reason.ts";
import {
  COLUMN_META,
  type ColumnId,
  type SavedViewConfig,
} from "core/schemas/ticket-view.ts";
import ErrorAlert from "@/components/ErrorAlert";
import StatusBadge from "@/components/StatusBadge";
import TicketTypeBadge from "@/components/TicketTypeBadge";
import { PriorityBadge, SeverityBadge } from "@/components/TriageBadge";
import { SlaCountdown } from "@/components/SlaBadge";
import { EscalationIcon } from "@/components/EscalationBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { TicketFilters } from "./TicketsPage";

interface TicketsResponse {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

// ── All column definitions ────────────────────────────────────────────────────

const ALL_COLUMN_DEFS: Record<ColumnId, ColumnDef<Ticket>> = {
  ticketNumber: {
    id: "ticketNumber",
    header: "#",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        to={`/tickets/${row.original.id}`}
        className="font-mono text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
      >
        {row.original.ticketNumber}
      </Link>
    ),
  },
  subject: {
    accessorKey: "subject",
    header: "Subject",
    enableSorting: true,
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <Link to={`/tickets/${row.original.id}`} className="link font-medium">
          {row.original.subject}
        </Link>
        {row.original.isEscalated && (
          <EscalationIcon
            title={
              row.original.escalationReason
                ? escalationReasonLabel[row.original.escalationReason]
                : "Escalated"
            }
          />
        )}
      </div>
    ),
  },
  requester: {
    id: "requester",
    accessorKey: "senderName",
    header: "Requester",
    enableSorting: true,
    cell: ({ row }) => (
      <div>
        <div>{row.original.senderName}</div>
        <div className="text-sm text-muted-foreground">{row.original.senderEmail}</div>
      </div>
    ),
  },
  ticketType: {
    accessorKey: "ticketType",
    header: "Type",
    enableSorting: false,
    cell: ({ row }) => <TicketTypeBadge type={row.original.ticketType} />,
  },
  status: {
    accessorKey: "status",
    header: "Status",
    enableSorting: true,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  priority: {
    accessorKey: "priority",
    header: "Priority",
    enableSorting: true,
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  severity: {
    accessorKey: "severity",
    header: "Severity",
    enableSorting: true,
    cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
  },
  category: {
    accessorKey: "category",
    header: "Category",
    enableSorting: true,
    cell: ({ row }) =>
      row.original.category ? (
        <Badge variant="secondary">{categoryLabel[row.original.category]}</Badge>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  team: {
    id: "team",
    header: "Team",
    enableSorting: false,
    cell: ({ row }) => {
      const team = row.original.team;
      if (!team) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium border">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: team.color }}
          />
          {team.name}
        </span>
      );
    },
  },
  assignee: {
    id: "assignee",
    header: "Assignee",
    enableSorting: false,
    cell: ({ row }) => {
      const a = row.original.assignedTo;
      if (!a) return <span className="text-muted-foreground text-xs">Unassigned</span>;
      return <span className="text-sm">{a.name}</span>;
    },
  },
  slaStatus: {
    id: "slaStatus",
    header: "SLA",
    enableSorting: false,
    cell: ({ row }) => {
      const { slaStatus, minutesUntilBreach, firstResponseDueAt, resolutionDueAt } =
        row.original;
      if (!firstResponseDueAt && !resolutionDueAt)
        return <span className="text-muted-foreground text-xs">—</span>;
      if (!slaStatus) return null;
      return <SlaCountdown status={slaStatus} minutesUntilBreach={minutesUntilBreach} />;
    },
  },
  createdAt: {
    accessorKey: "createdAt",
    header: "Created",
    enableSorting: true,
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  updatedAt: {
    accessorKey: "updatedAt",
    header: "Updated",
    enableSorting: true,
    cell: ({ row }) => new Date(row.original.updatedAt).toLocaleDateString(),
  },
  source: {
    id: "source",
    header: "Source",
    enableSorting: false,
    cell: ({ row }) => {
      const src = row.original.source;
      if (!src) return <span className="text-muted-foreground text-xs">—</span>;
      const labels: Record<string, string> = {
        email: "Email",
        portal: "Portal",
        agent: "Agent",
      };
      return (
        <Badge variant="outline" className="text-xs capitalize">
          {labels[src] ?? src}
        </Badge>
      );
    },
  },
  organization: {
    id: "organization",
    header: "Organization",
    enableSorting: false,
    cell: ({ row }) => {
      const org = row.original.organization;
      if (!org) return <span className="text-muted-foreground text-xs">—</span>;
      return <span className="text-sm">{org}</span>;
    },
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

interface TicketsTableProps {
  filters: TicketFilters;
  viewConfig?: SavedViewConfig;
}

export default function TicketsTable({ filters, viewConfig }: TicketsTableProps) {
  const defaultSort = viewConfig?.sort;

  const [sorting, setSorting] = useState<SortingState>([
    { id: defaultSort?.by ?? "createdAt", desc: (defaultSort?.order ?? "desc") === "desc" },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [filters]);

  // Build the active column list from viewConfig
  const columns = useMemo<ColumnDef<Ticket>[]>(() => {
    if (!viewConfig) {
      // No view config — show default visible columns in default order
      return Object.entries(COLUMN_META)
        .filter(([, meta]) => meta.defaultVisible)
        .map(([id]) => ALL_COLUMN_DEFS[id as ColumnId]);
    }
    return viewConfig.columns
      .filter(c => c.visible)
      .map(c => ALL_COLUMN_DEFS[c.id]);
  }, [viewConfig]);

  const sortBy = sorting[0]?.id ?? "createdAt";
  // Map column id to API sort key (e.g. "requester" → "senderName")
  const apiSortKey = COLUMN_META[sortBy as ColumnId]?.sortKey ?? sortBy;
  const sortOrder = sorting[0]?.desc ?? true ? "desc" : "asc";

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", apiSortKey, sortOrder, filters, pagination.pageIndex],
    queryFn: async () => {
      const { data } = await axios.get<TicketsResponse>("/api/tickets", {
        params: {
          sortBy: apiSortKey,
          sortOrder,
          ...filters,
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize,
        },
      });
      return data;
    },
  });

  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize);

  const table = useReactTable({
    data: data?.tickets ?? [],
    columns,
    state: { sorting, pagination },
    onSortingChange: updater => {
      setSorting(updater);
      setPagination(prev => ({ ...prev, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    pageCount,
    getCoreRowModel: getCoreRowModel(),
  });

  if (error) {
    return <ErrorAlert message="Failed to fetch tickets" />;
  }

  const visibleColCount = columns.length;

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const canSort = header.column.getCanSort();
                return (
                  <TableHead key={header.id}>
                    {canSort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="ml-2 h-4 w-4" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="ml-2 h-4 w-4" />
                        ) : (
                          <ArrowUpDown className="ml-2 h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <span className="px-2 py-1 text-sm font-medium">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: visibleColCount }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>

      {!isLoading && !error && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "No tickets"
              : `Showing ${pagination.pageIndex * pagination.pageSize + 1}–${Math.min(
                  (pagination.pageIndex + 1) * pagination.pageSize,
                  total,
                )} of ${total} tickets`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm px-2">
              Page {pagination.pageIndex + 1} of {pageCount || 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
