import type { TemplateType } from "core/constants/template.ts";

export interface TemplateVariable {
  key: string;
  description: string;
  group: string;
}

const TICKET_VARIABLES: TemplateVariable[] = [
  { key: "{{ticket.subject}}", description: "Subject line", group: "Ticket" },
  { key: "{{ticket.status}}", description: "Current status", group: "Ticket" },
  { key: "{{ticket.priority}}", description: "Priority level", group: "Ticket" },
  { key: "{{ticket.severity}}", description: "Severity level", group: "Ticket" },
  { key: "{{ticket.impact}}", description: "Impact level", group: "Ticket" },
  { key: "{{ticket.urgency}}", description: "Urgency level", group: "Ticket" },
  { key: "{{ticket.type}}", description: "Ticket type (incident, service request, etc.)", group: "Ticket" },
  { key: "{{ticket.category}}", description: "Category", group: "Ticket" },
  { key: "{{ticket.affected_system}}", description: "Affected system (incident only)", group: "Ticket" },
  { key: "{{ticket.created_at}}", description: "Date created", group: "Ticket" },
  { key: "{{ticket.resolved_at}}", description: "Date resolved", group: "Ticket" },
  { key: "{{ticket.first_response_due}}", description: "First response SLA due date", group: "Ticket" },
  { key: "{{ticket.resolution_due}}", description: "Resolution SLA due date", group: "Ticket" },
  { key: "{{customer.name}}", description: "Customer full name", group: "Customer" },
  { key: "{{customer.email}}", description: "Customer email address", group: "Customer" },
  { key: "{{agent.name}}", description: "Assigned agent name", group: "Assignment" },
  { key: "{{team.name}}", description: "Assigned team name", group: "Assignment" },
];

const REQUEST_VARIABLES: TemplateVariable[] = [
  { key: "{{request.number}}", description: "Request number", group: "Request" },
  { key: "{{request.title}}", description: "Request title", group: "Request" },
  { key: "{{request.status}}", description: "Current status", group: "Request" },
  { key: "{{request.priority}}", description: "Priority level", group: "Request" },
  { key: "{{request.catalog_item}}", description: "Catalog item name", group: "Request" },
  { key: "{{request.due_date}}", description: "Due date", group: "Request" },
  { key: "{{request.created_at}}", description: "Date created", group: "Request" },
  { key: "{{request.approval_status}}", description: "Approval status", group: "Request" },
  { key: "{{requester.name}}", description: "Requester full name", group: "Requester" },
  { key: "{{requester.email}}", description: "Requester email address", group: "Requester" },
  { key: "{{agent.name}}", description: "Assigned agent name", group: "Assignment" },
  { key: "{{team.name}}", description: "Assigned team name", group: "Assignment" },
];

const CHANGE_VARIABLES: TemplateVariable[] = [
  { key: "{{change.number}}", description: "Change number", group: "Change" },
  { key: "{{change.title}}", description: "Change title", group: "Change" },
  { key: "{{change.state}}", description: "Current state", group: "Change" },
  { key: "{{change.type}}", description: "Change type (normal, standard, emergency)", group: "Change" },
  { key: "{{change.model}}", description: "Change model", group: "Change" },
  { key: "{{change.risk}}", description: "Risk level", group: "Change" },
  { key: "{{change.priority}}", description: "Priority level", group: "Change" },
  { key: "{{change.impact}}", description: "Impact level", group: "Change" },
  { key: "{{change.urgency}}", description: "Urgency level", group: "Change" },
  { key: "{{change.planned_start}}", description: "Planned start date/time", group: "Change" },
  { key: "{{change.planned_end}}", description: "Planned end date/time", group: "Change" },
  { key: "{{change.actual_start}}", description: "Actual start date/time", group: "Change" },
  { key: "{{change.actual_end}}", description: "Actual end date/time", group: "Change" },
  { key: "{{change.description}}", description: "Change description", group: "Change" },
  { key: "{{change.justification}}", description: "Business justification", group: "Change" },
  { key: "{{change.rollback_plan}}", description: "Rollback plan", group: "Change" },
  { key: "{{change.service_impact}}", description: "Service impact assessment", group: "Change" },
  { key: "{{change.work_instructions}}", description: "Work instructions", group: "Change" },
  { key: "{{change.impacted_users}}", description: "Impacted users description", group: "Change" },
  { key: "{{change.service}}", description: "Service name", group: "Change" },
  { key: "{{agent.name}}", description: "Assigned implementor name", group: "Assignment" },
  { key: "{{coordinator.name}}", description: "Coordinator group name", group: "Assignment" },
];

const PROBLEM_VARIABLES: TemplateVariable[] = [
  { key: "{{problem.number}}", description: "Problem number", group: "Problem" },
  { key: "{{problem.title}}", description: "Problem title", group: "Problem" },
  { key: "{{problem.status}}", description: "Current status", group: "Problem" },
  { key: "{{problem.priority}}", description: "Priority level", group: "Problem" },
  { key: "{{problem.affected_service}}", description: "Affected service", group: "Problem" },
  { key: "{{problem.root_cause}}", description: "Root cause analysis", group: "Problem" },
  { key: "{{problem.workaround}}", description: "Known workaround", group: "Problem" },
  { key: "{{problem.description}}", description: "Problem description", group: "Problem" },
  { key: "{{problem.created_at}}", description: "Date created", group: "Problem" },
  { key: "{{problem.resolved_at}}", description: "Date resolved", group: "Problem" },
  { key: "{{owner.name}}", description: "Problem owner name", group: "Assignment" },
  { key: "{{agent.name}}", description: "Assigned agent name", group: "Assignment" },
  { key: "{{team.name}}", description: "Assigned team name", group: "Assignment" },
];

const ARTICLE_VARIABLES: TemplateVariable[] = [
  { key: "{{article.title}}", description: "Article title", group: "Article" },
  { key: "{{article.status}}", description: "Publication status (draft / published)", group: "Article" },
  { key: "{{article.visibility}}", description: "Visibility (public / internal)", group: "Article" },
  { key: "{{article.review_status}}", description: "Review status", group: "Article" },
  { key: "{{article.slug}}", description: "URL slug", group: "Article" },
  { key: "{{article.created_at}}", description: "Date created", group: "Article" },
  { key: "{{article.updated_at}}", description: "Last updated date", group: "Article" },
  { key: "{{article.published_at}}", description: "Date published", group: "Article" },
  { key: "{{article.view_count}}", description: "Total view count", group: "Article" },
  { key: "{{author.name}}", description: "Article author name", group: "People" },
  { key: "{{owner.name}}", description: "Article owner name", group: "People" },
  { key: "{{reviewer.name}}", description: "Reviewer name", group: "People" },
  { key: "{{category.name}}", description: "Category name", group: "Category" },
];

const EMAIL_VARIABLES: TemplateVariable[] = [
  { key: "{{customer.name}}", description: "Customer full name", group: "Customer" },
  { key: "{{customer.first_name}}", description: "Customer first name", group: "Customer" },
  { key: "{{customer.email}}", description: "Customer email address", group: "Customer" },
  { key: "{{ticket.number}}", description: "Ticket number", group: "Ticket" },
  { key: "{{ticket.subject}}", description: "Ticket subject", group: "Ticket" },
  { key: "{{ticket.status}}", description: "Ticket status", group: "Ticket" },
  { key: "{{ticket.priority}}", description: "Ticket priority", group: "Ticket" },
  { key: "{{ticket.created_at}}", description: "Ticket creation date", group: "Ticket" },
  { key: "{{agent.name}}", description: "Assigned agent name", group: "Agent" },
  { key: "{{agent.email}}", description: "Assigned agent email", group: "Agent" },
  { key: "{{company.name}}", description: "Company / helpdesk name", group: "Company" },
  { key: "{{portal.url}}", description: "Customer portal URL", group: "Company" },
  { key: "{{unsubscribe.url}}", description: "Email unsubscribe link", group: "Company" },
];

const MACRO_VARIABLES: TemplateVariable[] = [
  { key: "{{customer_name}}", description: "Customer's first name", group: "Customer" },
  { key: "{{customer_email}}", description: "Customer's email address", group: "Customer" },
  { key: "{{ticket_id}}", description: "Ticket ID number", group: "Ticket" },
  { key: "{{ticket_subject}}", description: "Ticket subject line", group: "Ticket" },
  { key: "{{ticket_status}}", description: "Current ticket status", group: "Ticket" },
  { key: "{{ticket_priority}}", description: "Ticket priority level", group: "Ticket" },
  { key: "{{agent_name}}", description: "Current agent's name", group: "Agent" },
  { key: "{{agent_email}}", description: "Current agent's email", group: "Agent" },
  { key: "{{team_name}}", description: "Assigned team name", group: "Agent" },
];

export const TEMPLATE_VARIABLES: Record<TemplateType, TemplateVariable[]> = {
  ticket: TICKET_VARIABLES,
  request: REQUEST_VARIABLES,
  change: CHANGE_VARIABLES,
  problem: PROBLEM_VARIABLES,
  article: ARTICLE_VARIABLES,
  email: EMAIL_VARIABLES,
  macro: MACRO_VARIABLES,
};
