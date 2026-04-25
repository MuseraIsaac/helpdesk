/**
 * TypeScript interfaces for ServiceRequest domain objects.
 *
 * These mirror the Prisma SELECT projections returned by the API.
 * Import here rather than from generated Prisma client so the
 * client bundle stays free of server-only code.
 */

import type { RequestStatus, RequestApprovalStatus } from "./request-status.ts";
import type { FulfillmentTaskStatus } from "./fulfillment-task-status.ts";

export interface RequestSummary {
  id: string | number;
  name: string;
  email: string;
}

export interface RequestItemRecord {
  id: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  status: string;
  catalogItemId: number | null;
  formData: Record<string, unknown>;
  fulfilledAt: string | null;
  createdAt: string;
}

export interface FulfillmentTaskNote {
  id: number;
  content: string;
  author: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentTask {
  id: number;
  title: string;
  description: string | null;
  status: FulfillmentTaskStatus;
  position: number;
  dueAt: string | null;
  completedAt: string | null;
  assignedTo: { id: string; name: string } | null;
  team: { id: number; name: string; color: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  notes: FulfillmentTaskNote[];
}

export interface RequestEvent {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface ServiceRequest {
  id: number;
  requestNumber: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  priority: string;
  approvalStatus: RequestApprovalStatus;
  approvalRequestId: number | null;

  /** Agent/staff who opened the request (agent shell). */
  requester: { id: string; name: string; email: string } | null;
  /** Customer (portal) requester. Exactly one of requester / requesterCustomer is set. */
  requesterCustomer: { id: number; name: string; email: string } | null;
  /** Denormalized for display in list views. Always set. */
  requesterName: string;
  requesterEmail: string;

  assignedTo: { id: string; name: string } | null;
  team: { id: number; name: string; color: string } | null;

  /** Snapshot of the catalog item name at submission time. */
  catalogItemName: string | null;
  /** FK placeholder — wired to CatalogItem once that module is built. */
  catalogItemId: number | null;

  /** Submitted form variables as a JSON bag. */
  formData: Record<string, unknown>;

  // Dates
  dueDate: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
  resolvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Related records (detail view only)
  items?: RequestItemRecord[];
  tasks?: FulfillmentTask[];
  events?: RequestEvent[];
  /** Linked source ticket — present in detail response when SR was created from a ticket */
  sourceTicket?: {
    id: number;
    ticketNumber: string;
    subject: string;
    status: string;
    priority: string | null;
    senderName: string;
    senderEmail: string;
    createdAt: string;
  } | null;
}
