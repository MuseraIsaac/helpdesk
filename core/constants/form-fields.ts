export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "richtext"
  | "select"
  | "multiselect"
  | "datetime"
  | "switch"
  | "number";

export type FieldWidth = "full" | "half";

export type FormEntityType = "ticket" | "request" | "change" | "problem" | "article";

export const formEntityTypes: FormEntityType[] = [
  "ticket",
  "request",
  "change",
  "problem",
  "article",
];

export const formEntityTypeLabel: Record<FormEntityType, string> = {
  ticket:  "Ticket",
  request: "Service Request",
  change:  "Change Request",
  problem: "Problem",
  article: "Knowledge Article",
};

export interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: FieldType;
  required: boolean;
  width: FieldWidth;
  section: string;
  order: number;
  description?: string;
}

// ─── Ticket ────────────────────────────────────────────────────────────────────

const TICKET_FIELDS: FieldDef[] = [
  // Section: Ticket Details
  { key: "ticketType",      label: "Ticket Type",      placeholder: "Generic (untyped)",                         type: "select",   required: false, width: "half", section: "Ticket Details",         order: 10 },
  { key: "subject",         label: "Subject",           placeholder: "Brief summary of the issue",               type: "text",     required: true,  width: "full", section: "Ticket Details",         order: 20 },
  { key: "affectedSystem",  label: "Affected System",   placeholder: "e.g. Payment gateway, Login service",      type: "text",     required: false, width: "full", section: "Ticket Details",         order: 30, description: "Only shown when Ticket Type is Incident." },
  // Section: Requester
  { key: "senderName",      label: "Sender Name",       placeholder: "John Smith",                               type: "text",     required: true,  width: "half", section: "Requester",              order: 40 },
  { key: "senderEmail",     label: "Sender Email",      placeholder: "john@example.com",                         type: "email",    required: true,  width: "half", section: "Requester",              order: 50 },
  // Section: Triage
  { key: "priority",        label: "Priority",          placeholder: "Select priority",                          type: "select",   required: false, width: "half", section: "Triage",                 order: 60 },
  { key: "severity",        label: "Severity",          placeholder: "Select severity",                          type: "select",   required: false, width: "half", section: "Triage",                 order: 70 },
  { key: "impact",          label: "Impact",            placeholder: "Select impact",                            type: "select",   required: false, width: "half", section: "Triage",                 order: 80 },
  { key: "urgency",         label: "Urgency",           placeholder: "Select urgency",                           type: "select",   required: false, width: "half", section: "Triage",                 order: 90 },
  // Section: Assignment & Category
  { key: "category",        label: "Category",          placeholder: "Select category",                          type: "select",   required: false, width: "half", section: "Assignment & Category",  order: 100 },
  { key: "assignedToId",    label: "Assign To",         placeholder: "Unassigned",                               type: "select",   required: false, width: "half", section: "Assignment & Category",  order: 110 },
  { key: "teamId",          label: "Team",              placeholder: "No team",                                  type: "select",   required: false, width: "full", section: "Assignment & Category",  order: 120 },
  // Section: Description
  { key: "body",            label: "Ticket Body",       placeholder: "Describe the issue in detail…",            type: "richtext", required: true,  width: "full", section: "Description",            order: 130 },
];

// ─── Service Request ──────────────────────────────────────────────────────────

const REQUEST_FIELDS: FieldDef[] = [
  // Section: Request Details
  { key: "title",           label: "Title",                       placeholder: "Brief description of what is needed",                              type: "text",     required: true,  width: "full", section: "Request Details",  order: 10 },
  { key: "description",     label: "Description",                 placeholder: "Provide details about the request, justification, and context",    type: "textarea", required: false, width: "full", section: "Request Details",  order: 20 },
  // Section: Classification
  { key: "catalogItemName", label: "Service / Catalog Item",      placeholder: "e.g. Laptop provisioning, VPN access",                            type: "text",     required: false, width: "half", section: "Classification",   order: 30 },
  { key: "priority",        label: "Priority",                    placeholder: "Select priority",                                                  type: "select",   required: false, width: "half", section: "Classification",   order: 40 },
  // Section: Assignment
  { key: "assignedToId",    label: "Assigned To",                 placeholder: "Unassigned",                                                       type: "select",   required: false, width: "half", section: "Assignment",       order: 50 },
  { key: "teamId",          label: "Team",                        placeholder: "No team",                                                          type: "select",   required: false, width: "half", section: "Assignment",       order: 60 },
  { key: "dueDate",         label: "Due Date",                    placeholder: "",                                                                  type: "datetime", required: false, width: "half", section: "Assignment",       order: 70 },
  // Section: Request Items
  { key: "items",           label: "Request Items",               placeholder: "",                                                                  type: "multiselect", required: false, width: "full", section: "Request Items", order: 80, description: "Dynamic list of line items (name, quantity, unit)." },
  // Section: Approval
  { key: "requiresApproval", label: "Requires Approval",          placeholder: "",                                                                 type: "switch",   required: false, width: "full", section: "Approval",         order: 90 },
  { key: "approverIds",     label: "Approvers",                   placeholder: "Select approvers",                                                 type: "multiselect", required: false, width: "full", section: "Approval",     order: 100, description: "Visible only when Requires Approval is enabled." },
];

// ─── Change Request ───────────────────────────────────────────────────────────

const CHANGE_FIELDS: FieldDef[] = [
  // Section: Basic Information
  { key: "title",                       label: "Change Summary",                 placeholder: "Brief one-line summary of what this change does…",                                                               type: "text",     required: true,  width: "full", section: "Basic Information",             order: 10 },
  { key: "description",                 label: "Description",                    placeholder: "High-level description of the change…",                                                                          type: "textarea", required: false, width: "full", section: "Basic Information",             order: 20 },
  // Section: Classification
  { key: "changeType",                  label: "Change Type",                    placeholder: "",                                                                                                               type: "select",   required: false, width: "half", section: "Classification",                order: 30 },
  { key: "changeModel",                 label: "Change Model",                   placeholder: "",                                                                                                               type: "select",   required: false, width: "half", section: "Classification",                order: 40 },
  { key: "changePurpose",               label: "Change Purpose",                 placeholder: "Select purpose…",                                                                                                type: "select",   required: false, width: "half", section: "Classification",                order: 50 },
  { key: "risk",                        label: "Risk",                           placeholder: "",                                                                                                               type: "select",   required: false, width: "half", section: "Classification",                order: 60 },
  // Section: Priority & Impact
  { key: "priority",                    label: "Priority",                       placeholder: "",                                                                                                               type: "select",   required: false, width: "half", section: "Priority & Impact",             order: 70 },
  { key: "impact",                      label: "Impact",                         placeholder: "",                                                                                                               type: "select",   required: false, width: "half", section: "Priority & Impact",             order: 80 },
  { key: "urgency",                     label: "Urgency",                        placeholder: "",                                                                                                               type: "select",   required: false, width: "half", section: "Priority & Impact",             order: 90 },
  // Section: Assignment
  { key: "coordinatorGroupId",          label: "Coordinator Group",              placeholder: "No group",                                                                                                       type: "select",   required: false, width: "half", section: "Assignment",                    order: 100 },
  { key: "assignedToId",                label: "Assigned To",                    placeholder: "Unassigned",                                                                                                     type: "select",   required: false, width: "half", section: "Assignment",                    order: 110 },
  { key: "linkedProblemId",             label: "Linked Problem Record",          placeholder: "Not linked",                                                                                                     type: "select",   required: false, width: "full", section: "Assignment",                    order: 120 },
  // Section: Affected Service & CI
  { key: "serviceId",                   label: "Service (from catalog)",         placeholder: "Select service…",                                                                                                type: "select",   required: false, width: "half", section: "Affected Service & CI",         order: 130 },
  { key: "serviceName",                 label: "Service Name (manual)",          placeholder: "e.g. Payment Gateway, Core Banking",                                                                             type: "text",     required: false, width: "half", section: "Affected Service & CI",         order: 140 },
  { key: "configurationItemId",         label: "Configuration Item",             placeholder: "Select CI…",                                                                                                     type: "select",   required: false, width: "half", section: "Affected Service & CI",         order: 150 },
  // Section: Change Window
  { key: "plannedStart",                label: "Planned Start",                  placeholder: "",                                                                                                               type: "datetime", required: false, width: "half", section: "Change Window",                 order: 160 },
  { key: "plannedEnd",                  label: "Planned End",                    placeholder: "",                                                                                                               type: "datetime", required: false, width: "half", section: "Change Window",                 order: 170 },
  // Section: Planning Documents
  { key: "justification",               label: "Change Justification",           placeholder: "Why is this change needed?",                                                                                     type: "textarea", required: false, width: "full", section: "Planning Documents",            order: 180 },
  { key: "workInstructions",            label: "Work Instructions",              placeholder: "Step-by-step implementation instructions…",                                                                      type: "textarea", required: false, width: "full", section: "Planning Documents",            order: 190 },
  { key: "serviceImpactAssessment",     label: "Service Impact Assessment",      placeholder: "Which services, users, or systems will be affected?",                                                            type: "textarea", required: false, width: "full", section: "Planning Documents",            order: 200 },
  { key: "rollbackPlan",                label: "Rollback Plan",                  placeholder: "Step-by-step instructions to revert the change if it fails…",                                                   type: "textarea", required: false, width: "full", section: "Planning Documents",            order: 210 },
  { key: "riskAssessmentAndMitigation", label: "Risk Assessment & Mitigation",   placeholder: "Identify specific risks this change introduces…",                                                               type: "textarea", required: false, width: "full", section: "Planning Documents",            order: 220 },
  // Section: Pre & Post Checks
  { key: "prechecks",                   label: "Pre-checks",                     placeholder: "Validation steps before starting the change window…",                                                            type: "textarea", required: false, width: "half", section: "Pre & Post Checks",             order: 230 },
  { key: "postchecks",                  label: "Post-checks",                    placeholder: "Validation steps to confirm the change was applied successfully…",                                               type: "textarea", required: false, width: "half", section: "Pre & Post Checks",             order: 240 },
  // Section: Categorization
  { key: "categorizationTier1",         label: "Category Tier 1",                placeholder: "e.g. Infrastructure",                                                                                           type: "text",     required: false, width: "half", section: "Categorization",                order: 250 },
  { key: "categorizationTier2",         label: "Category Tier 2",                placeholder: "e.g. Network",                                                                                                   type: "text",     required: false, width: "half", section: "Categorization",                order: 260 },
  { key: "categorizationTier3",         label: "Category Tier 3",                placeholder: "e.g. Firewall",                                                                                                  type: "text",     required: false, width: "half", section: "Categorization",                order: 270 },
  // Section: Notification & Communication
  { key: "notificationRequired",        label: "Stakeholder Notification Required", placeholder: "",                                                                                                            type: "switch",   required: false, width: "full", section: "Notification & Communication",  order: 280 },
  { key: "impactedUsers",               label: "Impacted Users / Stakeholders",  placeholder: "List the teams, users, or customer groups affected…",                                                           type: "textarea", required: false, width: "full", section: "Notification & Communication",  order: 290 },
  { key: "communicationNotes",          label: "Communication Notes",            placeholder: "Planned communications, announcement drafts, notification timelines…",                                          type: "textarea", required: false, width: "full", section: "Notification & Communication",  order: 300 },
];

// ─── Problem ──────────────────────────────────────────────────────────────────

const PROBLEM_FIELDS: FieldDef[] = [
  // Section: Problem Details
  { key: "title",              label: "Title",                       placeholder: "Brief description of the underlying issue",              type: "text",        required: true,  width: "full", section: "Problem Details",        order: 10 },
  { key: "description",        label: "Description",                 placeholder: "What is the recurring issue? What symptoms observed?",  type: "textarea",    required: false, width: "full", section: "Problem Details",        order: 20 },
  // Section: Classification
  { key: "priority",           label: "Priority",                    placeholder: "Select priority",                                       type: "select",      required: false, width: "half", section: "Classification",         order: 30 },
  { key: "affectedService",    label: "Affected Service / CI",       placeholder: "e.g. Payment gateway, Auth service",                    type: "text",        required: false, width: "half", section: "Classification",         order: 40 },
  // Section: Assignment
  { key: "ownerId",            label: "Problem Manager (Owner)",     placeholder: "Unowned",                                               type: "select",      required: false, width: "half", section: "Assignment",             order: 50 },
  { key: "assignedToId",       label: "Assigned Analyst",            placeholder: "Unassigned",                                            type: "select",      required: false, width: "half", section: "Assignment",             order: 60 },
  { key: "teamId",             label: "Team",                        placeholder: "No team",                                               type: "select",      required: false, width: "full", section: "Assignment",             order: 70 },
  // Section: Initial Investigation
  { key: "rootCause",          label: "Root Cause (initial hypothesis)", placeholder: "Describe the suspected root cause…",               type: "textarea",    required: false, width: "full", section: "Initial Investigation",  order: 80 },
  { key: "workaround",         label: "Workaround",                  placeholder: "Document any known workaround for affected users.",     type: "textarea",    required: false, width: "full", section: "Initial Investigation",  order: 90 },
  { key: "linkedChangeRef",    label: "Linked Change Reference",     placeholder: "e.g. CHG-0042",                                         type: "text",        required: false, width: "half", section: "Initial Investigation",  order: 100 },
  // Section: Linked Incidents
  { key: "linkedIncidentIds",  label: "Linked Incidents",            placeholder: "",                                                      type: "multiselect", required: false, width: "full", section: "Linked Incidents",       order: 110, description: "Select related incidents to link to this problem at creation." },
];

// ─── Article ──────────────────────────────────────────────────────────────────

const ARTICLE_FIELDS: FieldDef[] = [
  // Section: Content
  { key: "title",        label: "Title",              placeholder: "Article title",                                               type: "text",     required: true,  width: "full", section: "Content",    order: 10 },
  { key: "summary",      label: "Summary",            placeholder: "Brief description of what this article covers…",             type: "textarea", required: false, width: "full", section: "Content",    order: 20, description: "Shown as excerpt in search results." },
  { key: "body",         label: "Body",               placeholder: "Write your article here…",                                   type: "richtext", required: true,  width: "full", section: "Content",    order: 30 },
  // Section: Metadata
  { key: "categoryId",   label: "Category",           placeholder: "No category",                                                type: "select",   required: false, width: "half", section: "Metadata",   order: 40 },
  { key: "status",       label: "Status",             placeholder: "",                                                           type: "select",   required: false, width: "half", section: "Metadata",   order: 50 },
  { key: "reviewStatus", label: "Review Status",      placeholder: "",                                                           type: "select",   required: false, width: "half", section: "Metadata",   order: 60 },
  { key: "visibility",   label: "Visibility",         placeholder: "",                                                           type: "select",   required: false, width: "half", section: "Metadata",   order: 70 },
  // Section: Ownership
  { key: "ownerId",      label: "Owner / Assignee",   placeholder: "Unowned",                                                    type: "select",   required: false, width: "half", section: "Ownership",  order: 80 },
  // Section: Tags
  { key: "tags",         label: "Tags",               placeholder: "Type a tag and press Enter…",                                type: "multiselect", required: false, width: "full", section: "Tags",  order: 90 },
];

// ─── Registry ─────────────────────────────────────────────────────────────────

export const FORM_FIELD_REGISTRY: Record<FormEntityType, FieldDef[]> = {
  ticket:  TICKET_FIELDS,
  request: REQUEST_FIELDS,
  change:  CHANGE_FIELDS,
  problem: PROBLEM_FIELDS,
  article: ARTICLE_FIELDS,
};

/** Returns the ordered list of unique section names for an entity type. */
export function getFormSections(entityType: FormEntityType): string[] {
  const seen = new Set<string>();
  const sections: string[] = [];
  for (const f of FORM_FIELD_REGISTRY[entityType]) {
    if (!seen.has(f.section)) {
      seen.add(f.section);
      sections.push(f.section);
    }
  }
  return sections;
}
