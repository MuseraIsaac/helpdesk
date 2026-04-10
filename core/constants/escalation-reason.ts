export const escalationReasons = [
  "first_response_sla_breach",
  "resolution_sla_breach",
  "urgent_priority",
  "sev1_severity",
  "manual",
] as const;

export type EscalationReason = (typeof escalationReasons)[number];

export const escalationReasonLabel: Record<EscalationReason, string> = {
  first_response_sla_breach: "First Response SLA Breached",
  resolution_sla_breach: "Resolution SLA Breached",
  urgent_priority: "Urgent Priority",
  sev1_severity: "Sev 1 Severity",
  manual: "Manually Escalated",
};
