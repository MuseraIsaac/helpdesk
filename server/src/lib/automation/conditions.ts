import type { Condition, TicketRuleSnapshot } from "./types";

function minutesSince(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000;
}

/**
 * Pure predicate — evaluates a condition tree against a ticket snapshot.
 * No database access; no side effects.
 */
export function evaluateCondition(
  condition: Condition,
  ticket: TicketRuleSnapshot
): boolean {
  switch (condition.type) {
    case "category_is":
      return ticket.category === condition.value;

    case "priority_is":
      return ticket.priority === condition.value;

    case "severity_is":
      return ticket.severity === condition.value;

    case "status_is":
      return ticket.status === condition.value;

    case "sender_domain_is": {
      // Accept "example.com" or "@example.com"
      const domain = condition.domain.toLowerCase().replace(/^@/, "");
      return ticket.senderEmail.toLowerCase().endsWith(`@${domain}`);
    }

    case "subject_contains": {
      const haystack = ticket.subject.toLowerCase();
      const test = (k: string) => haystack.includes(k.toLowerCase());
      return condition.matchAll
        ? condition.keywords.every(test)
        : condition.keywords.some(test);
    }

    case "body_contains": {
      const haystack = ticket.body.toLowerCase();
      const test = (k: string) => haystack.includes(k.toLowerCase());
      return condition.matchAll
        ? condition.keywords.every(test)
        : condition.keywords.some(test);
    }

    case "is_unassigned":
      return ticket.assignedToId === null;

    case "unassigned_for_minutes":
      return (
        ticket.assignedToId === null &&
        minutesSince(ticket.createdAt) >= condition.minutes
      );

    case "and":
      return condition.conditions.every((c) => evaluateCondition(c, ticket));

    case "or":
      return condition.conditions.some((c) => evaluateCondition(c, ticket));

    case "not":
      return !evaluateCondition(condition.condition, ticket);
  }
}
