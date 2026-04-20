import type { TicketPriority } from "./ticket-priority.ts";

// ── Change document type ──────────────────────────────────────────────────────

export const changeDocumentTypes = [
  "mop",
  "rollback_document",
  "test_evidence",
  "change_communication",
  "screenshot",
  "technical_document",
  "lessons_learned_doc",
  "other",
] as const;
export type ChangeDocumentType = (typeof changeDocumentTypes)[number];

export const changeDocumentTypeLabel: Record<ChangeDocumentType, string> = {
  mop:                  "Method of Procedure (MOP)",
  rollback_document:    "Rollback Document",
  test_evidence:        "Test Evidence",
  change_communication: "Change Communication",
  screenshot:           "Screenshot / Visual Evidence",
  technical_document:   "Technical Document",
  lessons_learned_doc:  "Lessons Learned Report",
  other:                "Other",
};

// ── Implementation outcome ────────────────────────────────────────────────────

export const implementationOutcomes = [
  "successful",
  "successful_issues",
  "partial",
  "rolled_back",
  "failed",
  "cancelled",
] as const;
export type ImplementationOutcome = (typeof implementationOutcomes)[number];

export const implementationOutcomeLabel: Record<ImplementationOutcome, string> = {
  successful:        "Successful",
  successful_issues: "Successful with Issues",
  partial:           "Partially Delivered",
  rolled_back:       "Rolled Back",
  failed:            "Failed",
  cancelled:         "Cancelled",
};

export const implementationOutcomeColor: Record<ImplementationOutcome, string> = {
  successful:        "text-green-700 dark:text-green-400",
  successful_issues: "text-amber-700 dark:text-amber-400",
  partial:           "text-blue-700 dark:text-blue-400",
  rolled_back:       "text-orange-700 dark:text-orange-400",
  failed:            "text-destructive",
  cancelled:         "text-muted-foreground",
};

// ── Enums ─────────────────────────────────────────────────────────────────────

export const changeTypes = ["standard", "normal", "emergency"] as const;
export type ChangeType = (typeof changeTypes)[number];

export const changeModels = [
  "standard_change",
  "normal_change",
  "emergency_change",
  "major_change",
] as const;
export type ChangeModel = (typeof changeModels)[number];

export const changeStates = [
  "draft",
  "submitted",
  "assess",
  "authorize",
  "scheduled",
  "implement",
  "review",
  "closed",
  "cancelled",
  "failed",
] as const;
export type ChangeState = (typeof changeStates)[number];

export const changeRisks = ["low", "medium", "high", "critical"] as const;
export type ChangeRisk = (typeof changeRisks)[number];

export const changePurposes = [
  "improvement",
  "optimization",
  "remediation",
  "compliance",
  "maintenance",
  "emergency_fix",
] as const;
export type ChangePurpose = (typeof changePurposes)[number];

// ── Label maps ────────────────────────────────────────────────────────────────

export const changeTypeLabel: Record<ChangeType, string> = {
  standard:  "Standard",
  normal:    "Normal",
  emergency: "Emergency",
};

export const changeModelLabel: Record<ChangeModel, string> = {
  standard_change:   "Standard Change",
  normal_change:     "Normal Change",
  emergency_change:  "Emergency Change",
  major_change:      "Major Change",
};

export const changeStateLabel: Record<ChangeState, string> = {
  draft:      "Draft",
  submitted:  "Submitted",
  assess:     "Assessment",
  authorize:  "Authorization",
  scheduled:  "Scheduled",
  implement:  "Implementation",
  review:     "Review",
  closed:     "Closed",
  cancelled:  "Cancelled",
  failed:     "Failed",
};

export const changeRiskLabel: Record<ChangeRisk, string> = {
  low:      "Low",
  medium:   "Medium",
  high:     "High",
  critical: "Critical",
};

export const changePurposeLabel: Record<ChangePurpose, string> = {
  improvement:   "Improvement",
  optimization:  "Optimization",
  remediation:   "Remediation",
  compliance:    "Compliance",
  maintenance:   "Maintenance",
  emergency_fix: "Emergency Fix",
};

// ── Domain type ───────────────────────────────────────────────────────────────

export interface ChangeEvent {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface ChangeTask {
  id: number;
  phase: string;
  position: number;
  title: string;
  description: string | null;
  status: string;
  assignedTo: { id: string; name: string } | null;
  completedAt: string | null;
  completionNote: string | null;
}

export interface Change {
  id: number;
  changeNumber: string;
  title: string;
  description: string | null;

  changeType: ChangeType;
  changeModel: ChangeModel;
  state: ChangeState;
  risk: ChangeRisk;
  changePurpose: ChangePurpose | null;

  priority: TicketPriority;

  categorizationTier1: string | null;
  categorizationTier2: string | null;
  categorizationTier3: string | null;

  serviceName: string | null;
  service: { id: number; name: string } | null;

  configurationItem: { id: number; name: string; ciNumber: string } | null;

  coordinatorGroup: { id: number; name: string; color: string } | null;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;

  linkedProblem: { id: number; problemNumber: string; title: string } | null;

  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;

  submittedAt: string | null;
  approvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Rich-text fields (detail only)
  justification?: string | null;
  workInstructions?: string | null;
  serviceImpactAssessment?: string | null;
  rollbackPlan?: string | null;
  riskAssessmentAndMitigation?: string | null;
  prechecks?: string | null;
  postchecks?: string | null;

  // Notification / Communication fields (detail only)
  notificationRequired?: boolean | null;
  impactedUsers?: string | null;
  communicationNotes?: string | null;

  // Closure & PIR fields (detail only)
  implementationOutcome?: ImplementationOutcome | null;
  rollbackUsed?: boolean | null;
  closureCode?: string | null;
  closureNotes?: string | null;
  reviewSummary?: string | null;
  lessonsLearned?: string | null;

  // Relations (detail only)
  tasks?: ChangeTask[];
  events?: ChangeEvent[];
  ciLinks?: ChangeCiLink[];
}

export interface ChangeCiLink {
  id: number;
  ciId: number;
  linkedAt: string;
  linkedBy: { id: string; name: string } | null;
  ci: {
    id: number;
    ciNumber: string;
    name: string;
    type: string;
    environment: string;
    criticality: string;
    status: string;
  };
}
