/**
 * Event Bus — Central dispatcher for event-driven automation workflows.
 *
 * All entity lifecycle routes call `fireEvent()` after a state change.
 * The EventBus routes each event through the `event_workflow` category of the
 * AutomationEngine, passing the previous field values so conditions can
 * compare old vs new state ("status changed FROM open TO escalated").
 *
 * Design:
 *  - Always fire-and-forget safe: failures are logged, never thrown to the caller.
 *  - Category-scoped: only evaluates `event_workflow` rules; intake_routing and
 *    time_supervisor rules are never triggered from here.
 *  - Previous values are injected into the snapshot for "changed from/to" conditions.
 *  - The actorId is stored in the execution meta for full audit traceability.
 *
 * Usage:
 *   void fireEvent({ trigger: "ticket.status_changed", entityType: "ticket",
 *     entityId: 42, actorId: req.user.id,
 *     previousValues: { status: "open" }, currentValues: { status: "escalated" } });
 */

import { runAutomationEngine } from "./automation-engine";
import type { AutomationTriggerType } from "core/constants/automation";

export interface EventPayload {
  /** The trigger type that fired this event */
  trigger: AutomationTriggerType;
  /** Entity type — determines which snapshot loader to use */
  entityType: "ticket" | "incident" | "change" | "request" | "problem";
  /** Primary key of the entity */
  entityId: number;
  /** Field values BEFORE the change — enables previous.* condition evaluation */
  previousValues?: Record<string, unknown>;
  /** ID of the user who triggered the event — stored in execution meta */
  actorId?: string | null;
  /** Additional context metadata */
  meta?: Record<string, unknown>;
}

/**
 * Fire an event through the event_workflow automation engine.
 * Always call with `void` — this never throws or blocks the caller.
 */
export async function fireEvent(payload: EventPayload): Promise<void> {
  try {
    // Map "problem" and other extended entity types to a supported engine entity type.
    // The engine loads ticket snapshots; for non-ticket entities the snapshot loader
    // currently skips (returns empty results) — a future phase will add their loaders.
    const engineEntityType: "ticket" | "incident" | "change" | "request" =
      payload.entityType === "problem" || payload.entityType === "ticket"
        ? "ticket"
        : (payload.entityType as "incident" | "change" | "request");

    await runAutomationEngine({
      trigger: payload.trigger,
      entityType: engineEntityType,
      entityId: payload.entityId,
      category: "event_workflow",
      meta: {
        ...payload.meta,
        ...(payload.previousValues && { previousValues: payload.previousValues }),
        ...(payload.actorId && { actorId: payload.actorId }),
      },
    });
  } catch (e) {
    // EventBus failures must never propagate — automation must not break primary flows
    console.error("[event-bus] Unhandled error firing event", payload.trigger, "on", payload.entityType, payload.entityId, e);
  }
}

/**
 * Convenience: fire a ticket event from within a route handler.
 * Previous values must be captured BEFORE the DB update is applied.
 */
export function fireTicketEvent(
  trigger: AutomationTriggerType,
  ticketId: number,
  actorId: string | null,
  previousValues?: Record<string, unknown>,
  meta?: Record<string, unknown>,
): void {
  void fireEvent({ trigger, entityType: "ticket", entityId: ticketId, actorId, previousValues, meta });
}

/**
 * Convenience: fire an incident event.
 */
export function fireIncidentEvent(
  trigger: AutomationTriggerType,
  incidentId: number,
  actorId: string | null,
  previousValues?: Record<string, unknown>,
): void {
  void fireEvent({ trigger, entityType: "incident", entityId: incidentId, actorId, previousValues });
}

/**
 * Convenience: fire a change management event.
 */
export function fireChangeEvent(
  trigger: AutomationTriggerType,
  changeId: number,
  actorId: string | null,
  previousValues?: Record<string, unknown>,
): void {
  void fireEvent({ trigger, entityType: "change", entityId: changeId, actorId, previousValues });
}

/**
 * Convenience: fire a service request event.
 */
export function fireRequestEvent(
  trigger: AutomationTriggerType,
  requestId: number,
  actorId: string | null,
  previousValues?: Record<string, unknown>,
): void {
  void fireEvent({ trigger, entityType: "request", entityId: requestId, actorId, previousValues });
}
