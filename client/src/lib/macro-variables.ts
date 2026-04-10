/** All supported placeholder variables for macro bodies */
export const MACRO_VARIABLES = [
  { key: "{{customer_name}}", description: "Customer's first name" },
  { key: "{{customer_email}}", description: "Customer's email address" },
  { key: "{{ticket_id}}", description: "Ticket ID number" },
  { key: "{{agent_name}}", description: "Your name (current agent)" },
] as const;

export interface MacroContext {
  customerName: string;
  customerEmail: string;
  ticketId: number;
  agentName: string;
}

/**
 * Replaces all known {{variable}} placeholders with their runtime values.
 * Unknown/misspelled placeholders are left as-is so the agent can see them.
 */
export function resolveMacroBody(body: string, ctx: MacroContext): string {
  const firstName = ctx.customerName.split(" ")[0] ?? ctx.customerName;
  return body
    .replace(/\{\{customer_name\}\}/gi, firstName)
    .replace(/\{\{customer_email\}\}/gi, ctx.customerEmail)
    .replace(/\{\{ticket_id\}\}/gi, String(ctx.ticketId))
    .replace(/\{\{agent_name\}\}/gi, ctx.agentName);
}
