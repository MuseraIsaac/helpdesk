export type TemplateType = "ticket" | "request" | "change" | "problem" | "article" | "email" | "macro";

export const templateTypes: TemplateType[] = [
  "ticket",
  "request",
  "change",
  "problem",
  "article",
  "email",
  "macro",
];

export const templateTypeLabel: Record<TemplateType, string> = {
  ticket: "Ticket",
  request: "Request",
  change: "Change",
  problem: "Problem",
  article: "Article",
  email: "Email",
  macro: "Macro",
};
