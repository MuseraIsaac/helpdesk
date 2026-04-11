export const Role = {
  admin: "admin",
  supervisor: "supervisor",
  agent: "agent",
  readonly: "readonly",
  customer: "customer",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
