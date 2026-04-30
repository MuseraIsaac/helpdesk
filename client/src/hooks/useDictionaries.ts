/**
 * Shared dictionary hooks.
 *
 * Many dialogs and pages independently call `/api/teams`, `/api/agents`,
 * `/api/ticket-types`, etc. Each one used to be a separate `useQuery`
 * with its own queryKey, which meant:
 *  - duplicate network calls when several dialogs mount on the same page
 *  - no shared staleness window (stale-while-fetching never kicked in)
 *  - inconsistent typings spread across files
 *
 * These hooks unify those calls onto one queryKey per endpoint so TanStack
 * dedupes them, and apply a 5-minute `staleTime` since this data changes
 * at most a few times an hour. Mutations elsewhere (TeamForm, RolesPage,
 * UserForm…) invalidate the relevant key.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const FIVE_MIN  = 5 * 60_000;
const TEN_MIN   = 10 * 60_000;
const HALF_HOUR = 30 * 60_000;

// ── Teams ─────────────────────────────────────────────────────────────────────

export interface Team {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  email: string | null;
  ticketCount?: number;
  memberCount?: number;
  members?: { id: string; name: string }[];
}

export function useTeams() {
  return useQuery({
    queryKey: ["dict", "teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: Team[] }>("/api/teams");
      return data.teams;
    },
    staleTime: FIVE_MIN,
    gcTime:    HALF_HOUR,
  });
}

// ── Agents ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export function useAgents() {
  return useQuery({
    queryKey: ["dict", "agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data.agents;
    },
    staleTime: FIVE_MIN,
    gcTime:    HALF_HOUR,
  });
}

// ── Ticket type configs ──────────────────────────────────────────────────────

export interface TicketTypeConfig {
  id: number;
  slug: string;
  name: string;
  color: string | null;
  enabled: boolean;
}

export function useTicketTypes() {
  return useQuery({
    queryKey: ["dict", "ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get<{ ticketTypes: TicketTypeConfig[] }>("/api/ticket-types");
      return data.ticketTypes;
    },
    staleTime: TEN_MIN,
    gcTime:    HALF_HOUR,
  });
}

// ── Ticket status configs ────────────────────────────────────────────────────

export interface TicketStatusConfig {
  id: number;
  slug: string;
  label: string;
  color: string | null;
  category: string;
  position: number;
}

export function useTicketStatusConfigs() {
  return useQuery({
    queryKey: ["dict", "ticket-status-configs"],
    queryFn: async () => {
      const { data } = await axios.get<{ configs: TicketStatusConfig[] }>("/api/ticket-status-configs");
      return data.configs;
    },
    staleTime: TEN_MIN,
    gcTime:    HALF_HOUR,
  });
}

// ── Roles (assignable subset — excludes system roles like `customer`) ────────

export interface AssignableRoleOption {
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  isBuiltin: boolean;
  isSystem: boolean;
}

export function useAssignableRoles() {
  return useQuery({
    queryKey: ["dict", "roles", "assignable"],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: AssignableRoleOption[] }>("/api/roles");
      return data.roles.filter((r) => !r.isSystem);
    },
    staleTime: FIVE_MIN,
    gcTime:    HALF_HOUR,
  });
}
