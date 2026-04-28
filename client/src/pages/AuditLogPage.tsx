import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { auditActions } from "core/constants/audit-event.ts";
import type { AuditSettings } from "core/schemas/settings.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ShieldCheck,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Calendar,
  User,
  Ticket,
  Filter,
  RefreshCw,
  ChevronLeft,
  ExternalLink,
  Clock,
  Activity,
  AlertTriangle,
  Zap,
  MessageSquare,
  StickyNote,
  GitMerge,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  Bot,
  FileWarning,
  BadgeCheck,
  Shield,
  AlertCircle,
  Settings2,
  Archive,
  LogIn,
  LogOut,
  ShieldX,
  UserPlus,
  UserCog,
  UserMinus,
  BookOpen,
  BookCheck,
  BookMarked,
  ClipboardCheck,
  Flame,
  Wrench,
  CalendarClock,
  GitBranch,
  Box,
  Server,
  PackageOpen,
  PackageX,
  ThumbsUp,
  ThumbsDown,
  Hourglass,
  Users,
  UserX,
  Send,
  PlayCircle,
  StopCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEventRow {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  createdAt: string;
  ticketId: number;
  actor: { id: string; name: string; email: string } | null;
  ticket: { ticketNumber: string; subject: string } | null;
}

interface AuditLogResponse {
  events: AuditEventRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Action config ─────────────────────────────────────────────────────────────

type ActionCategory =
  | "lifecycle" | "assignment" | "sla" | "communication" | "automation" | "merge"
  | "incident" | "problem" | "change" | "request"
  | "asset" | "approval" | "customer" | "team"
  | "auth" | "settings" | "user" | "kb" | "other";

interface ActionConfig {
  label: string;
  category: ActionCategory;
  icon: React.ElementType;
  color: string;          // Tailwind ring/text classes
  bg: string;             // Badge background
}

const ACTION_CONFIG: Record<string, ActionConfig> = {
  // ── Ticket lifecycle ─────────────────────────────────────────────────────────
  "ticket.created":          { label: "Ticket Created",        category: "lifecycle",    icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "ticket.status_changed":   { label: "Status Changed",        category: "lifecycle",    icon: ArrowUpDown,    color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"           },
  "ticket.priority_changed": { label: "Priority Changed",      category: "lifecycle",    icon: Activity,       color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "ticket.severity_changed": { label: "Severity Changed",      category: "lifecycle",    icon: Activity,       color: "text-orange-600",   bg: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"   },
  "ticket.category_changed": { label: "Category Changed",      category: "lifecycle",    icon: Activity,       color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"               },
  "ticket.assigned":         { label: "Ticket Assigned",       category: "assignment",   icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "ticket.sla_breached":     { label: "SLA Breached",          category: "sla",          icon: AlertTriangle,  color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "ticket.escalated":        { label: "Escalated",             category: "sla",          icon: FileWarning,    color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "ticket.deescalated":      { label: "De-escalated",          category: "sla",          icon: CheckCircle2,   color: "text-green-600",    bg: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"       },
  "ticket.merged":           { label: "Merged",                category: "merge",        icon: GitMerge,       color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "ticket.received_merge":   { label: "Received Merge",        category: "merge",        icon: GitMerge,       color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "ticket.unmerged":         { label: "Unmerged",              category: "merge",        icon: GitMerge,       color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "ticket.child_unmerged":   { label: "Child Unmerged",        category: "merge",        icon: GitMerge,       color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "ticket.intake_suppressed":{ label: "Intake Suppressed",     category: "automation",   icon: XCircle,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "ticket.deleted":          { label: "Ticket Deleted",        category: "lifecycle",    icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "ticket.restored":         { label: "Ticket Restored",       category: "lifecycle",    icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "reply.created":           { label: "Reply Sent",            category: "communication",icon: MessageSquare,  color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "note.created":            { label: "Internal Note",         category: "communication",icon: StickyNote,     color: "text-slate-600",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  // ── Incident lifecycle ───────────────────────────────────────────────────────
  "incident.created":        { label: "Incident Created",      category: "incident",     icon: Flame,          color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "incident.status_changed": { label: "Incident Status",       category: "incident",     icon: ArrowUpDown,    color: "text-orange-600",   bg: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"   },
  "incident.assigned":       { label: "Incident Assigned",     category: "incident",     icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "incident.priority_changed":{ label: "Incident Priority",   category: "incident",     icon: Activity,       color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "incident.major_declared": { label: "Major Incident",        category: "incident",     icon: AlertTriangle,  color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "incident.major_cleared":  { label: "Major Cleared",         category: "incident",     icon: CheckCircle2,   color: "text-green-600",    bg: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"       },
  "incident.update_posted":  { label: "Update Posted",         category: "incident",     icon: MessageSquare,  color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "incident.resolved":       { label: "Incident Resolved",     category: "incident",     icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "incident.closed":         { label: "Incident Closed",       category: "incident",     icon: XCircle,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "incident.sla_breached":   { label: "Incident SLA Breached", category: "incident",     icon: AlertTriangle,  color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "incident.linked_problem": { label: "Linked to Problem",     category: "incident",     icon: GitBranch,      color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "incident.deleted":        { label: "Incident Deleted",      category: "incident",     icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  // ── Problem lifecycle ────────────────────────────────────────────────────────
  "problem.created":         { label: "Problem Created",       category: "problem",      icon: AlertCircle,    color: "text-rose-600",     bg: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"           },
  "problem.status_changed":  { label: "Problem Status",        category: "problem",      icon: ArrowUpDown,    color: "text-orange-600",   bg: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"   },
  "problem.assigned":        { label: "Problem Assigned",      category: "problem",      icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "problem.priority_changed":{ label: "Problem Priority",      category: "problem",      icon: Activity,       color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "problem.known_error_flagged":{ label: "Known Error",        category: "problem",      icon: FileWarning,    color: "text-orange-600",   bg: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"   },
  "problem.root_cause_updated":{ label: "Root Cause Updated",  category: "problem",      icon: Wrench,         color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"               },
  "problem.workaround_updated":{ label: "Workaround Updated",  category: "problem",      icon: Wrench,         color: "text-cyan-600",     bg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20"           },
  "problem.linked_incident": { label: "Linked Incident",       category: "problem",      icon: GitBranch,      color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "problem.linked_ticket":   { label: "Linked Ticket",         category: "problem",      icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "problem.pir_completed":   { label: "PIR Completed",         category: "problem",      icon: BookCheck,      color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "problem.resolved":        { label: "Problem Resolved",      category: "problem",      icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "problem.closed":          { label: "Problem Closed",        category: "problem",      icon: XCircle,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "problem.deleted":         { label: "Problem Deleted",       category: "problem",      icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  // ── Change lifecycle ─────────────────────────────────────────────────────────
  "change.created":          { label: "Change Created",        category: "change",       icon: GitBranch,      color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"           },
  "change.status_changed":   { label: "Change Status",         category: "change",       icon: ArrowUpDown,    color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"               },
  "change.assigned":         { label: "Change Assigned",       category: "change",       icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "change.submitted":        { label: "Submitted for Approval",category: "change",       icon: Send,           color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "change.approved":         { label: "Change Approved",       category: "change",       icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "change.rejected":         { label: "Change Rejected",       category: "change",       icon: ThumbsDown,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "change.scheduled":        { label: "Change Scheduled",      category: "change",       icon: CalendarClock,  color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"           },
  "change.started":          { label: "Implementation Started",category: "change",       icon: PlayCircle,     color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "change.completed":        { label: "Change Completed",      category: "change",       icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "change.cancelled":        { label: "Change Cancelled",      category: "change",       icon: XCircle,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "change.rolled_back":      { label: "Rollback Executed",     category: "change",       icon: StopCircle,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "change.task_created":     { label: "Task Created",          category: "change",       icon: CheckCircle2,   color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"               },
  "change.task_completed":   { label: "Task Completed",        category: "change",       icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "change.task_deleted":     { label: "Task Deleted",          category: "change",       icon: XCircle,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "change.deleted":          { label: "Change Deleted",        category: "change",       icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  // ── Service Request lifecycle ────────────────────────────────────────────────
  "request.created":         { label: "Request Created",       category: "request",      icon: PackageOpen,    color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "request.status_changed":  { label: "Request Status",        category: "request",      icon: ArrowUpDown,    color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"               },
  "request.assigned":        { label: "Request Assigned",      category: "request",      icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "request.approved":        { label: "Request Approved",      category: "request",      icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "request.rejected":        { label: "Request Rejected",      category: "request",      icon: ThumbsDown,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "request.cancelled":       { label: "Request Cancelled",     category: "request",      icon: XCircle,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "request.completed":       { label: "Request Completed",     category: "request",      icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "request.fulfilled":       { label: "Request Fulfilled",     category: "request",      icon: CheckCircle2,   color: "text-green-600",    bg: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"       },
  "request.deleted":         { label: "Request Deleted",       category: "request",      icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  // ── Asset lifecycle ──────────────────────────────────────────────────────────
  "asset.created":           { label: "Asset Created",         category: "asset",        icon: Box,            color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "asset.updated":           { label: "Asset Updated",         category: "asset",        icon: Wrench,         color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"               },
  "asset.status_changed":    { label: "Asset Status",          category: "asset",        icon: ArrowUpDown,    color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "asset.assigned":          { label: "Asset Assigned",        category: "asset",        icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "asset.unassigned":        { label: "Asset Unassigned",      category: "asset",        icon: UserX,          color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "asset.deployed":          { label: "Asset Deployed",        category: "asset",        icon: Server,         color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "asset.retired":           { label: "Asset Retired",         category: "asset",        icon: Archive,        color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "asset.scrapped":          { label: "Asset Scrapped",        category: "asset",        icon: PackageX,       color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "asset.linked_ci":         { label: "Linked to CMDB CI",     category: "asset",        icon: GitBranch,      color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "asset.linked_contract":   { label: "Linked to Contract",    category: "asset",        icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "asset.deleted":           { label: "Asset Deleted",         category: "asset",        icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  // ── Approval lifecycle ───────────────────────────────────────────────────────
  "approval.requested":      { label: "Approval Requested",    category: "approval",     icon: Hourglass,      color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "approval.approved":       { label: "Approved",              category: "approval",     icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "approval.rejected":       { label: "Rejected",              category: "approval",     icon: ThumbsDown,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "approval.expired":        { label: "Approval Expired",      category: "approval",     icon: Hourglass,      color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  // ── Customer / portal ────────────────────────────────────────────────────────
  "customer.registered":     { label: "Customer Registered",   category: "customer",     icon: UserPlus,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "customer.portal_login":   { label: "Portal Login",          category: "customer",     icon: LogIn,          color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "customer.portal_login_failed":{ label: "Portal Login Failed",category: "customer",   icon: ShieldX,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "customer.updated":        { label: "Customer Updated",      category: "customer",     icon: UserCog,        color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"           },
  "customer.deleted":        { label: "Customer Deleted",      category: "customer",     icon: UserMinus,      color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  // ── Team management ──────────────────────────────────────────────────────────
  "team.created":            { label: "Team Created",          category: "team",         icon: Users,          color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "team.updated":            { label: "Team Updated",          category: "team",         icon: Users,          color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"           },
  "team.deleted":            { label: "Team Deleted",          category: "team",         icon: Users,          color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "team.member_added":       { label: "Member Added",          category: "team",         icon: UserPlus,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"},
  "team.member_removed":     { label: "Member Removed",        category: "team",         icon: UserMinus,      color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"       },
  "rule.applied":            { label: "Rule Applied",          category: "automation",   icon: Zap,            color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "workflow.executed":       { label: "Workflow Executed",     category: "automation",   icon: Bot,            color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "workflow.failed":         { label: "Workflow Failed",       category: "automation",   icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"               },
  "scenario.run":            { label: "Scenario Executed",     category: "automation",   icon: Bot,            color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  // Auth
  "auth.login":              { label: "Login",                  category: "auth",     icon: LogIn,          color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "auth.logout":             { label: "Logout",                 category: "auth",     icon: LogOut,         color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "auth.login_failed":       { label: "Login Failed",           category: "auth",     icon: ShieldX,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  // Settings
  "settings.updated":        { label: "Settings Changed",       category: "settings", icon: Settings2,      color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"         },
  // User management
  "user.created":            { label: "User Created",           category: "user",     icon: UserPlus,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "user.updated":            { label: "User Updated",           category: "user",     icon: UserCog,        color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "user.deleted":            { label: "User Deleted",           category: "user",     icon: UserMinus,      color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  // Roles
  "role.created":               { label: "Role Created",            category: "user", icon: ShieldCheck,    color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "role.updated":               { label: "Role Updated",            category: "user", icon: Shield,         color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "role.permissions_changed":   { label: "Role Permissions Changed",category: "user", icon: ShieldCheck,    color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"     },
  "role.deleted":               { label: "Role Deleted",            category: "user", icon: ShieldX,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  // KB
  "kb.article_created":         { label: "Article Created",    category: "kb",       icon: BookOpen,       color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"                 },
  "kb.article_published":       { label: "Article Published",  category: "kb",       icon: BookCheck,      color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "kb.article_archived":        { label: "Article Archived",   category: "kb",       icon: Archive,        color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "kb.article_submitted_review":{ label: "Submitted for Review",category: "kb",      icon: BookMarked,     color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"         },
  "kb.article_approved":        { label: "Article Approved",   category: "kb",       icon: BookCheck,      color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"     },

  // Tickets — extra
  "ticket.deleted":             { label: "Ticket Deleted",     category: "lifecycle", icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "ticket.restored":            { label: "Ticket Restored",    category: "lifecycle", icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },

  // Incidents
  "incident.created":           { label: "Incident Created",   category: "incident", icon: AlertTriangle,  color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "incident.status_changed":    { label: "Incident Status",    category: "incident", icon: ArrowUpDown,    color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "incident.assigned":          { label: "Incident Assigned",  category: "incident", icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "incident.priority_changed":  { label: "Incident Priority",  category: "incident", icon: Activity,       color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "incident.major_declared":    { label: "Major Declared",     category: "incident", icon: Flame,          color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "incident.major_cleared":     { label: "Major Cleared",      category: "incident", icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "incident.update_posted":     { label: "Update Posted",      category: "incident", icon: MessageSquare,  color: "text-teal-600",     bg: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"           },
  "incident.resolved":          { label: "Incident Resolved",  category: "incident", icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "incident.closed":            { label: "Incident Closed",    category: "incident", icon: CheckCircle2,   color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "incident.sla_breached":      { label: "Incident SLA Breach",category: "incident", icon: AlertTriangle,  color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "incident.linked_problem":    { label: "Linked to Problem",  category: "incident", icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "incident.deleted":           { label: "Incident Deleted",   category: "incident", icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },

  // Problems
  "problem.created":            { label: "Problem Created",    category: "problem",  icon: AlertCircle,    color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "problem.status_changed":     { label: "Problem Status",     category: "problem",  icon: ArrowUpDown,    color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "problem.assigned":           { label: "Problem Assigned",   category: "problem",  icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "problem.priority_changed":   { label: "Problem Priority",   category: "problem",  icon: Activity,       color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "problem.known_error_flagged":{ label: "Known Error Flagged",category: "problem",  icon: FileWarning,    color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "problem.root_cause_updated": { label: "Root Cause Updated", category: "problem",  icon: Wrench,         color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "problem.workaround_updated": { label: "Workaround Updated", category: "problem",  icon: Wrench,         color: "text-cyan-600",     bg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20"             },
  "problem.linked_incident":    { label: "Linked Incident",    category: "problem",  icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "problem.linked_ticket":      { label: "Linked Ticket",      category: "problem",  icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "problem.pir_completed":      { label: "PIR Completed",      category: "problem",  icon: ClipboardCheck, color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "problem.resolved":           { label: "Problem Resolved",   category: "problem",  icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "problem.closed":             { label: "Problem Closed",     category: "problem",  icon: CheckCircle2,   color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "problem.deleted":            { label: "Problem Deleted",    category: "problem",  icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },

  // Changes
  "change.created":             { label: "Change Created",     category: "change",   icon: GitMerge,       color: "text-violet-600",   bg: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20"   },
  "change.status_changed":      { label: "Change Status",      category: "change",   icon: ArrowUpDown,    color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "change.assigned":            { label: "Change Assigned",    category: "change",   icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "change.submitted":           { label: "Change Submitted",   category: "change",   icon: Send,           color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "change.approved":            { label: "Change Approved",    category: "change",   icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "change.rejected":            { label: "Change Rejected",    category: "change",   icon: ThumbsDown,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "change.scheduled":           { label: "Change Scheduled",   category: "change",   icon: CalendarClock,  color: "text-cyan-600",     bg: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20"             },
  "change.started":             { label: "Implementation Started", category: "change", icon: PlayCircle,   color: "text-orange-600",   bg: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20"   },
  "change.completed":           { label: "Change Completed",   category: "change",   icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "change.cancelled":           { label: "Change Cancelled",   category: "change",   icon: StopCircle,     color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "change.rolled_back":         { label: "Rolled Back",        category: "change",   icon: AlertTriangle,  color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "change.task_created":        { label: "Task Created",       category: "change",   icon: ClipboardCheck, color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "change.task_completed":      { label: "Task Completed",     category: "change",   icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "change.task_deleted":        { label: "Task Deleted",       category: "change",   icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "change.deleted":             { label: "Change Deleted",     category: "change",   icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },

  // Service Requests
  "request.created":            { label: "Request Created",    category: "request",  icon: ClipboardCheck, color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "request.status_changed":     { label: "Request Status",     category: "request",  icon: ArrowUpDown,    color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "request.assigned":           { label: "Request Assigned",   category: "request",  icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "request.approved":           { label: "Request Approved",   category: "request",  icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "request.rejected":           { label: "Request Rejected",   category: "request",  icon: ThumbsDown,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "request.cancelled":          { label: "Request Cancelled",  category: "request",  icon: StopCircle,     color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "request.completed":          { label: "Request Completed",  category: "request",  icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "request.fulfilled":          { label: "Request Fulfilled",  category: "request",  icon: CheckCircle2,   color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "request.deleted":            { label: "Request Deleted",    category: "request",  icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },

  // Assets
  "asset.created":              { label: "Asset Created",      category: "asset",    icon: Box,            color: "text-sky-600",      bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"                 },
  "asset.updated":              { label: "Asset Updated",      category: "asset",    icon: Server,         color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "asset.status_changed":       { label: "Asset Status",       category: "asset",    icon: ArrowUpDown,    color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "asset.assigned":             { label: "Asset Assigned",     category: "asset",    icon: User,           color: "text-indigo-600",   bg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20"   },
  "asset.unassigned":           { label: "Asset Unassigned",   category: "asset",    icon: UserX,          color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },
  "asset.deployed":             { label: "Asset Deployed",     category: "asset",    icon: PackageOpen,    color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "asset.retired":              { label: "Asset Retired",      category: "asset",    icon: PackageX,       color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "asset.scrapped":             { label: "Asset Scrapped",     category: "asset",    icon: PackageX,       color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "asset.linked_ci":            { label: "Linked to CI",       category: "asset",    icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "asset.linked_contract":      { label: "Linked to Contract", category: "asset",    icon: GitBranch,      color: "text-purple-600",   bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"   },
  "asset.deleted":              { label: "Asset Deleted",      category: "asset",    icon: XCircle,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },

  // Approvals
  "approval.requested":         { label: "Approval Requested", category: "approval", icon: Hourglass,      color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
  "approval.approved":          { label: "Approval Granted",   category: "approval", icon: ThumbsUp,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "approval.rejected":          { label: "Approval Rejected",  category: "approval", icon: ThumbsDown,     color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "approval.expired":           { label: "Approval Expired",   category: "approval", icon: Clock,          color: "text-slate-500",    bg: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"         },

  // Customers
  "customer.registered":        { label: "Customer Registered",category: "customer", icon: UserPlus,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "customer.portal_login":      { label: "Portal Login",       category: "customer", icon: LogIn,          color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "customer.portal_login_failed":{ label: "Portal Login Failed",category: "customer",icon: ShieldX,        color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "customer.updated":           { label: "Customer Updated",   category: "customer", icon: UserCog,        color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "customer.deleted":           { label: "Customer Deleted",   category: "customer", icon: UserMinus,      color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },

  // Teams
  "team.created":               { label: "Team Created",       category: "team",     icon: Users,          color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "team.updated":               { label: "Team Updated",       category: "team",     icon: Users,          color: "text-blue-600",     bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"             },
  "team.deleted":               { label: "Team Deleted",       category: "team",     icon: Users,          color: "text-red-600",      bg: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"                 },
  "team.member_added":          { label: "Member Added",       category: "team",     icon: UserPlus,       color: "text-emerald-600",  bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  "team.member_removed":        { label: "Member Removed",     category: "team",     icon: UserMinus,      color: "text-amber-600",    bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"       },
};

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  lifecycle:    "Ticket Lifecycle",
  assignment:   "Assignment",
  sla:          "SLA & Escalation",
  communication:"Communication",
  automation:   "Automation",
  merge:        "Merge Operations",
  incident:     "Incidents",
  problem:      "Problems",
  change:       "Changes",
  request:      "Service Requests",
  asset:        "Assets",
  approval:     "Approvals",
  customer:     "Customers",
  team:         "Teams",
  auth:         "Authentication",
  settings:     "Settings Changes",
  user:         "User Management",
  kb:           "Knowledge Base",
  other:        "Other",
};

function getActionConfig(action: string): ActionConfig {
  return ACTION_CONFIG[action] ?? {
    label: action,
    category: "other",
    icon: Activity,
    color: "text-muted-foreground",
    bg: "bg-muted text-muted-foreground border-border",
  };
}

// ── Meta rendering ────────────────────────────────────────────────────────────

function renderMetaSummary(action: string, meta: Record<string, unknown>): string {
  const m = meta as Record<string, string | number | boolean | { id?: string; name?: string } | null | undefined>;
  switch (action) {
    case "ticket.created":
      return m.via ? `Via ${String(m.via)}` : "";
    case "ticket.status_changed":
      return m.from && m.to ? `${m.from} → ${m.to}${m.automated ? " (automated)" : ""}` : "";
    case "ticket.priority_changed":
    case "ticket.severity_changed":
    case "ticket.category_changed":
      return m.from !== undefined ? `${m.from ?? "—"} → ${m.to ?? "—"}` : "";
    case "ticket.assigned": {
      const from = (m.from as { name?: string } | null)?.name ?? null;
      const to   = (m.to   as { name?: string } | null)?.name ?? null;
      if (!from && to)  return `Assigned to ${to}`;
      if (from && !to)  return `Unassigned from ${from}`;
      if (from && to)   return `${from} → ${to}`;
      return "";
    }
    case "ticket.sla_breached":
      return m.type ? `${String(m.type).replace(/_/g, " ")} SLA` : "";
    case "ticket.escalated":
      return m.reason ? String(m.reason).replace(/_/g, " ") : "";
    case "ticket.merged":
      return m.targetNumber ? `→ ${m.targetNumber}` : "";
    case "ticket.received_merge":
      return m.fromNumber ? `← ${m.fromNumber}` : "";
    case "ticket.unmerged":
      return m.parentNumber ? `Removed from ${m.parentNumber}` : "";
    case "ticket.child_unmerged":
      return m.childNumber ? `Child ${m.childNumber} separated` : "";
    case "reply.created":
      return m.automated ? "Automated reply" : (m.senderType ? `By ${m.senderType}` : "");
    case "rule.applied":
      return m.ruleName ? String(m.ruleName) : `Rule #${m.ruleId ?? ""}`;
    case "workflow.executed":
    case "workflow.failed":
      return m.workflowId ? `Workflow #${m.workflowId}` : "";
    case "scenario.run":
      return m.scenarioId ? `Scenario #${m.scenarioId}` : "";
    // Auth
    case "auth.login":
      return m.ip ? `from ${String(m.ip)}` : "";
    case "auth.logout":
      return m.ip ? `from ${String(m.ip)}` : "";
    case "auth.login_failed":
      return m.ip ? `from ${String(m.ip)}` : "";
    // Settings
    case "settings.updated":
      return m.section ? `Section: ${String(m.section)}` : "";
    // User management
    case "user.created":
      return m.name ? `${String(m.name)} (${String(m.email ?? "")})` : "";
    case "user.updated": {
      const changes = m.changes as string[] | undefined;
      return m.name ? `${String(m.name)}${changes?.length ? ` — ${changes.join(", ")}` : ""}` : "";
    }
    case "user.deleted":
      return m.name ? `${String(m.name)} (${String(m.email ?? "")})` : "";
    // Roles
    case "role.created":
      return m.roleName ? `${String(m.roleName)} (key: ${String(m.roleKey ?? "")})` : "";
    case "role.updated": {
      const changes = m.changes as string[] | undefined;
      return m.roleName ? `${String(m.roleName)}${changes?.length ? ` — ${changes.join(", ")}` : ""}` : "";
    }
    case "role.permissions_changed": {
      if (m.reset) return `${String(m.roleName ?? m.roleKey ?? "")} — reset to defaults`;
      const added   = (m.added   as string[] | undefined) ?? [];
      const removed = (m.removed as string[] | undefined) ?? [];
      const parts: string[] = [];
      if (added.length)   parts.push(`+${added.length} added`);
      if (removed.length) parts.push(`-${removed.length} removed`);
      return `${String(m.roleName ?? m.roleKey ?? "")}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
    }
    case "role.deleted":
      return m.roleName ? `${String(m.roleName)} (key: ${String(m.roleKey ?? "")})` : "";
    // KB
    case "kb.article_created":
    case "kb.article_published":
    case "kb.article_archived":
    case "kb.article_submitted_review":
    case "kb.article_approved":
      return m.title ? String(m.title) : "";
    // Incidents
    case "incident.created":
      return m.entityTitle ? `${m.entityTitle}${m.isMajor ? " (MAJOR)" : ""}` : "";
    case "incident.status_changed":
    case "problem.status_changed":
    case "change.status_changed":
    case "request.status_changed":
    case "asset.status_changed":
      return m.from && m.to ? `${m.from} → ${m.to}` : (m.entityTitle ? String(m.entityTitle) : "");
    case "incident.assigned":
    case "problem.assigned":
    case "change.assigned":
    case "request.assigned":
    case "asset.assigned": {
      const fromVal = m.from as string | { name?: string } | null | undefined;
      const toVal   = m.to   as string | { name?: string } | null | undefined;
      const fromName = typeof fromVal === "object" && fromVal ? fromVal.name ?? null : (fromVal ?? null);
      const toName   = typeof toVal   === "object" && toVal   ? toVal.name   ?? null : (toVal   ?? null);
      if (!fromName && toName)  return `→ ${toName}`;
      if (fromName && !toName)  return `Unassigned from ${fromName}`;
      if (fromName && toName)   return `${fromName} → ${toName}`;
      return m.entityTitle ? String(m.entityTitle) : "";
    }
    case "incident.major_declared":
    case "incident.major_cleared":
    case "incident.resolved":
    case "incident.closed":
    case "problem.resolved":
    case "problem.closed":
    case "change.completed":
    case "change.cancelled":
    case "request.fulfilled":
    case "request.completed":
    case "request.cancelled":
      return m.entityTitle ? String(m.entityTitle) : "";
    case "incident.update_posted":
      return m.updateType ? `Type: ${String(m.updateType).replace(/_/g, " ")}` : "";
    case "incident.linked_problem":
      return m.linkedProblemNumber ? `→ Problem ${m.linkedProblemNumber}` : "";
    case "problem.linked_incident":
      return m.linkedIncidentNumber ? `→ Incident ${m.linkedIncidentNumber}` : "";
    case "problem.linked_ticket":
      return m.linkedTicketNumber ? `→ Ticket ${m.linkedTicketNumber}` : "";
    case "problem.root_cause_updated":
    case "problem.workaround_updated":
    case "problem.pir_completed":
    case "problem.known_error_flagged":
      return m.entityTitle ? String(m.entityTitle) : "";
    case "change.created":
      return m.entityTitle ? `${m.entityTitle} (${m.changeType ?? ""})` : "";
    case "change.submitted":
    case "change.approved":
    case "change.rejected":
    case "change.scheduled":
    case "change.started":
    case "change.rolled_back":
      return m.entityTitle ? String(m.entityTitle) : "";
    case "change.task_created":
    case "change.task_completed":
    case "change.task_deleted":
      return m.taskTitle ? String(m.taskTitle) : "";
    case "request.created":
      return m.entityTitle ? `${m.entityTitle}${m.via ? ` (${m.via})` : ""}` : "";
    case "request.approved":
    case "request.rejected":
      return m.entityTitle ? String(m.entityTitle) : "";
    // Assets
    case "asset.created":
      return m.entityTitle ? `${m.entityTitle}${m.assetTag ? ` [${m.assetTag}]` : ""}` : "";
    case "asset.updated":
      return m.changes ? `Fields: ${(m.changes as string[]).join(", ")}` : (m.entityTitle ? String(m.entityTitle) : "");
    case "asset.unassigned":
      return m.entityTitle ? String(m.entityTitle) : "";
    case "asset.deployed":
    case "asset.retired":
    case "asset.scrapped":
      return m.entityTitle ? `${m.entityTitle}${m.assetTag ? ` [${m.assetTag}]` : ""}` : "";
    case "asset.linked_ci":
      return m.ciName ? `→ CI: ${m.ciName}` : "";
    case "asset.linked_contract":
      return m.contractName ? `→ Contract: ${m.contractName}` : "";
    // Approvals
    case "approval.requested":
      return m.subjectType ? `For ${String(m.subjectType).replace(/_/g, " ")} #${m.subjectId ?? ""}` : "";
    case "approval.approved":
    case "approval.rejected":
      return m.subjectType ? `${String(m.subjectType).replace(/_/g, " ")} #${m.subjectId ?? ""}` : "";
    case "approval.expired":
      return m.subjectType ? `Expired for ${String(m.subjectType).replace(/_/g, " ")}` : "";
    // Customer / portal
    case "customer.registered":
      return m.email ? `${m.entityTitle ? String(m.entityTitle) : ""} (${m.email})` : "";
    case "customer.portal_login":
    case "customer.portal_login_failed":
      return m.email ? String(m.email) : "";
    case "customer.updated":
    case "customer.deleted":
      return m.entityTitle ? String(m.entityTitle) : "";
    // Teams
    case "team.created":
    case "team.updated":
    case "team.deleted":
      return m.entityTitle ? String(m.entityTitle) : "";
    case "team.member_added":
    case "team.member_removed":
      return m.entityTitle && m.memberId ? `${m.entityTitle} — member ${m.memberId}` : (m.entityTitle ? String(m.entityTitle) : "");
    default:
      // Fallback: show entity title/number from meta if available
      if (m.entityNumber) return String(m.entityNumber);
      return "";
  }
}

// ── EventBadge ────────────────────────────────────────────────────────────────

function EventBadge({ action }: { action: string }) {
  const cfg = getActionConfig(action);
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${cfg.bg}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {cfg.label}
    </span>
  );
}

// ── ActorCell ─────────────────────────────────────────────────────────────────

function ActorCell({ actor }: { actor: AuditEventRow["actor"] }) {
  if (!actor) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-5 w-5 rounded-full bg-muted border border-border/60 flex items-center justify-center shrink-0">
          <Bot className="h-3 w-3 text-muted-foreground/60" />
        </span>
        System
      </span>
    );
  }
  const initials = actor.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-5 w-5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 font-semibold text-[9px]">
        {initials}
      </span>
      <span className="truncate max-w-[120px] text-foreground/80" title={actor.email}>
        {actor.name}
      </span>
    </span>
  );
}

// ── MetaPanel ─────────────────────────────────────────────────────────────────

// ── EntityCell — shows ticket link OR generic ITSM entity link from meta ──────

const ENTITY_ROUTES: Record<string, string> = {
  incident: "/incidents",
  problem:  "/problems",
  change:   "/changes",
  request:  "/requests",
  asset:    "/assets",
  team:     "/settings/teams",
};

function EntityCell({ event }: { event: AuditEventRow }) {
  // Ticket-scoped events — direct DB relation
  if (event.ticket) {
    return (
      <Link
        to={`/tickets/${event.ticketId}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-mono font-medium">{event.ticket.ticketNumber}</span>
        <ExternalLink className="h-3 w-3 opacity-50" />
      </Link>
    );
  }

  // ITSM module events — entity ref stored in meta
  const entityType   = event.meta.entityType   as string | undefined;
  const entityId     = event.meta.entityId     as number | undefined;
  const entityNumber = event.meta.entityNumber as string | undefined;

  if (entityType && entityId && entityNumber && ENTITY_ROUTES[entityType]) {
    return (
      <Link
        to={`${ENTITY_ROUTES[entityType]}/${entityId}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-mono font-medium">{entityNumber}</span>
        <ExternalLink className="h-3 w-3 opacity-50" />
      </Link>
    );
  }

  // System-level events (auth, settings, user, kb) — no entity
  return <span className="text-[11px] text-muted-foreground/40">—</span>;
}

function MetaPanel({ meta }: { meta: Record<string, unknown> }) {
  const json = JSON.stringify(meta, null, 2);
  if (json === "{}") return <span className="text-xs text-muted-foreground italic">No additional data</span>;

  return (
    <pre className="text-[11px] font-mono bg-muted/50 border border-border/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed text-foreground/80">
      {json}
    </pre>
  );
}

// ── EventRow ──────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: AuditEventRow }) {
  const [expanded, setExpanded] = useState(false);
  const summary = renderMetaSummary(event.action, event.meta);

  const dt = new Date(event.createdAt);
  const dateFmt = dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeFmt = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <>
      <tr
        className={`border-b border-border/40 transition-colors hover:bg-muted/30 cursor-pointer ${expanded ? "bg-muted/20" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Expand indicator */}
        <td className="pl-4 pr-2 py-3 w-8">
          {expanded
            ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          }
        </td>

        {/* Timestamp */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="text-xs font-medium text-foreground/80">{dateFmt}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums">{timeFmt}</div>
        </td>

        {/* Event */}
        <td className="px-3 py-3">
          <div className="flex flex-col gap-1">
            <EventBadge action={event.action} />
            {summary && (
              <span className="text-[11px] text-muted-foreground pl-0.5">{summary}</span>
            )}
          </div>
        </td>

        {/* Actor */}
        <td className="px-3 py-3">
          <ActorCell actor={event.actor} />
        </td>

        {/* Entity */}
        <td className="px-3 py-3">
          <EntityCell event={event} />
        </td>

        {/* Event ID */}
        <td className="px-3 py-3 text-right">
          <span className="text-[10px] font-mono text-muted-foreground/40">#{event.id}</span>
        </td>
      </tr>

      {/* Expanded meta row */}
      {expanded && (
        <tr className="bg-muted/10 border-b border-border/40">
          <td />
          <td colSpan={5} className="px-4 pb-4 pt-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                <Activity className="h-3 w-3" />
                Event payload
              </div>
              <MetaPanel meta={event.meta} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Filter state ──────────────────────────────────────────────────────────────

interface Filters {
  startDate: string;
  endDate: string;
  actions: string[];
  actorSearch: string;
  ticketSearch: string;
}

const EMPTY_FILTERS: Filters = {
  startDate: "",
  endDate: "",
  actions: [],
  actorSearch: "",
  ticketSearch: "",
};

function filtersAreEmpty(f: Filters) {
  return !f.startDate && !f.endDate && f.actions.length === 0 && !f.actorSearch && !f.ticketSearch;
}

// ── Action multi-select ───────────────────────────────────────────────────────

function ActionPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const byCategory = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const action of auditActions) {
      const cat = ACTION_CONFIG[action]?.category ?? "other";
      (groups[cat] ??= []).push(action);
    }
    return groups;
  }, []);

  function toggle(action: string) {
    onChange(
      selected.includes(action)
        ? selected.filter((a) => a !== action)
        : [...selected, action]
    );
  }

  function toggleCategory(cat: string) {
    const catActions = byCategory[cat] ?? [];
    const allSelected = catActions.every((a) => selected.includes(a));
    if (allSelected) {
      onChange(selected.filter((a) => !catActions.includes(a)));
    } else {
      const toAdd = catActions.filter((a) => !selected.includes(a));
      onChange([...selected, ...toAdd]);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex h-8 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
          "bg-background hover:border-ring/50 focus:outline-none",
          selected.length > 0 ? "border-primary/40 text-foreground" : "border-input text-muted-foreground",
        ].join(" ")}
      >
        <Filter className="h-3.5 w-3.5 shrink-0" />
        {selected.length === 0 ? "Event types" : `${selected.length} selected`}
        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 left-0 z-30 w-72 rounded-lg border bg-popover shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-xs font-medium text-muted-foreground">Filter by event type</span>
              {selected.length > 0 && (
                <button
                  onClick={() => onChange([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              {Object.entries(byCategory).map(([cat, actions]) => (
                <div key={cat}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 hover:bg-muted/50 transition-colors"
                  >
                    {CATEGORY_LABELS[cat as ActionCategory] ?? cat}
                    <span className="text-[10px] normal-case font-normal text-muted-foreground/50">
                      {(byCategory[cat] ?? []).filter((a) => selected.includes(a)).length}/{(byCategory[cat] ?? []).length}
                    </span>
                  </button>
                  {actions.map((action) => {
                    const cfg = getActionConfig(action);
                    const Icon = cfg.icon;
                    const checked = selected.includes(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => toggle(action)}
                        className={`flex w-full items-center gap-2.5 px-4 py-1.5 text-xs transition-colors hover:bg-muted/50 ${checked ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        <span className={`h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-primary border-primary" : "border-border"}`}>
                          {checked && <span className="text-primary-foreground text-[9px] font-bold">✓</span>}
                        </span>
                        <Icon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── AuditLogPage ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [committed, setCommitted] = useState<Filters>(EMPTY_FILTERS);

  // Fetch audit settings so the UI can reflect the current configuration
  const { data: auditSettings } = useQuery<{ data: AuditSettings }>({
    queryKey: ["settings", "audit"],
    queryFn: async () => {
      const { data } = await axios.get("/api/settings/audit");
      return data;
    },
    staleTime: 30_000,
  });
  const settings = auditSettings?.data;

  function applyFilters() {
    setPage(1);
    setCommitted(filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setCommitted(EMPTY_FILTERS);
    setPage(1);
  }

  // Build query params from committed filters
  const queryParams = useMemo(() => {
    const p: Record<string, string | string[]> = {
      page:     String(page),
      pageSize: String(PAGE_SIZE),
    };
    if (committed.startDate)         p.startDate    = new Date(committed.startDate).toISOString();
    if (committed.endDate)           p.endDate      = new Date(committed.endDate + "T23:59:59").toISOString();
    if (committed.actions.length)    p.actions      = committed.actions;
    if (committed.actorSearch.trim()) p.actorSearch = committed.actorSearch.trim();
    if (committed.ticketSearch.trim()) p.ticketSearch = committed.ticketSearch.trim();
    return p;
  }, [committed, page]);

  const { data, isLoading, error, isFetching, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log", queryParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) {
        if (Array.isArray(v)) v.forEach((vi) => params.append(k, vi));
        else params.set(k, v);
      }
      const { data } = await axios.get<AuditLogResponse>(`/api/audit-log?${params}`);
      return data;
    },
    staleTime: 30_000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasFilters = !filtersAreEmpty(committed);

  // Export URL with current date filters
  function buildExportUrl(format: "json" | "csv") {
    const p = new URLSearchParams({ format });
    if (committed.startDate) p.set("startDate", new Date(committed.startDate).toISOString());
    if (committed.endDate)   p.set("endDate",   new Date(committed.endDate + "T23:59:59").toISOString());
    return `/api/audit-log/export?${p}`;
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ── Disabled banner ─────────────────────────────────────────────────── */}
      {settings && !settings.enabled && (
        <div className="border-b border-amber-500/30 bg-amber-500/8 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <strong>Audit logging is disabled.</strong>{" "}
              No new events are being recorded. Existing events are still visible here.{" "}
              <Link to="/settings/audit" className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">
                Enable in Settings → Audit Log
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* ── Category toggles banner ─────────────────────────────────────────── */}
      {settings?.enabled && (
        (() => {
          const off: string[] = [];
          if (!settings.captureTicketEvents)   off.push("Ticket events");
          if (!settings.captureIncidentEvents) off.push("Incident events");
          if (!settings.captureProblemEvents)  off.push("Problem events");
          if (!settings.captureChangeEvents)   off.push("Change events");
          if (!settings.captureRequestEvents)  off.push("Request events");
          if (!settings.captureAssetEvents)    off.push("Asset events");
          if (!settings.captureApprovalEvents) off.push("Approval events");
          if (!settings.captureTeamEvents)     off.push("Team events");
          if (!settings.captureCustomerEvents) off.push("Customer events");
          if (!settings.captureAuthEvents)     off.push("Auth events");
          if (!settings.captureSettingsChanges) off.push("Settings changes");
          if (!settings.captureUserManagement) off.push("User management");
          if (!settings.captureKbEvents)       off.push("KB events");
          if (off.length === 0) return null;
          return (
            <div className="border-b border-blue-500/20 bg-blue-500/5 px-6 py-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Some event categories are not being captured:{" "}
                  <strong>{off.join(", ")}</strong>.{" "}
                  <Link to="/settings/audit" className="underline underline-offset-2 hover:opacity-80">
                    Adjust in Settings → Audit Log
                  </Link>
                </p>
              </div>
            </div>
          );
        })()
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="border-b bg-gradient-to-b from-muted/40 to-background">
        <div className="px-6 py-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="h-3 w-3" />
                    SOC 2
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    <Shield className="h-3 w-3" />
                    ISO 27001
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Immutable, append-only record of all system events. Use filters to investigate access, changes, and automation activity.
                </p>
              </div>
            </div>

            {/* Export */}
            <div className="flex items-center gap-2 shrink-0">
              {settings && !settings.exportEnabled ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border/60 rounded-md px-3 h-8">
                  <Archive className="h-3.5 w-3.5" />
                  Export disabled
                  <Link to="/settings/audit" className="ml-1 text-primary hover:underline flex items-center gap-0.5">
                    <Settings2 className="h-3 w-3" />
                  </Link>
                </span>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => window.open(buildExportUrl("csv"), "_blank")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => window.open(buildExportUrl("json"), "_blank")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => refetch()}
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Stats strip */}
          {data && (
            <div className="mt-4 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold tabular-nums">{data.total.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">{hasFilters ? "matching events" : "total events"}</span>
              </div>
              <div className="h-3.5 w-px bg-border/60" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Page {data.page} of {totalPages.toLocaleString()}
                </span>
              </div>
              {settings?.retentionDays && (
                <>
                  <div className="h-3.5 w-px bg-border/60" />
                  <div className="flex items-center gap-1.5">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Retained for <strong>{settings.retentionDays}</strong> days
                    </span>
                  </div>
                </>
              )}
              {hasFilters && (
                <>
                  <div className="h-3.5 w-px bg-border/60" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                      Filters active
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div className="border-b bg-muted/20 px-6 py-3">
        <div className="flex items-end gap-3 flex-wrap">

          {/* Date range */}
          <div className="flex items-center gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> From
              </label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                className="h-8 text-xs w-36"
              />
            </div>
            <div className="pt-4 text-muted-foreground text-xs">—</div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">To</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                className="h-8 text-xs w-36"
              />
            </div>
          </div>

          <Separator orientation="vertical" className="h-8" />

          {/* Action picker */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
              <Zap className="h-3 w-3" /> Event type
            </label>
            <ActionPicker
              selected={filters.actions}
              onChange={(a) => setFilters((f) => ({ ...f, actions: a }))}
            />
          </div>

          <Separator orientation="vertical" className="h-8" />

          {/* Actor search */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
              <User className="h-3 w-3" /> Actor
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Name or email"
                value={filters.actorSearch}
                onChange={(e) => setFilters((f) => ({ ...f, actorSearch: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="h-8 text-xs pl-8 w-40"
              />
            </div>
          </div>

          {/* Ticket search */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
              <Ticket className="h-3 w-3" /> Ticket
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Number or subject"
                value={filters.ticketSearch}
                onChange={(e) => setFilters((f) => ({ ...f, ticketSearch: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                className="h-8 text-xs pl-8 w-40"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-4">
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={applyFilters}>
              <Search className="h-3.5 w-3.5" />
              Search
            </Button>
            {(!filtersAreEmpty(filters) || hasFilters) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {hasFilters && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">Active:</span>
            {committed.startDate && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                <Calendar className="h-2.5 w-2.5" />
                From {committed.startDate}
              </Badge>
            )}
            {committed.endDate && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                <Calendar className="h-2.5 w-2.5" />
                To {committed.endDate}
              </Badge>
            )}
            {committed.actions.map((a) => (
              <Badge key={a} variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                {getActionConfig(a).label}
              </Badge>
            ))}
            {committed.actorSearch && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                <User className="h-2.5 w-2.5" /> {committed.actorSearch}
              </Badge>
            )}
            {committed.ticketSearch && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal">
                <Ticket className="h-2.5 w-2.5" /> {committed.ticketSearch}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4">
        {error && <ErrorAlert error={error} fallback="Failed to load audit log" />}

        {isLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : data?.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="font-medium text-foreground">No events found</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              {hasFilters
                ? "No audit events match the current filters. Try broadening your search."
                : "No audit events have been recorded yet."}
            </p>
            {hasFilters && (
              <Button size="sm" variant="outline" onClick={clearFilters} className="mt-1">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="w-8 pl-4 pr-2 py-2.5" />
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Timestamp
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                      <Activity className="h-3 w-3" /> Event
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                      <User className="h-3 w-3" /> Actor
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
                      <Ticket className="h-3 w-3" /> Entity
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">ID</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-muted-foreground">
              Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, data.total).toLocaleString()} of {data.total.toLocaleString()} events
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              {/* Page number pills */}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === page ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
