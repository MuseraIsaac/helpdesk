import type { TicketCategory } from "./ticket-category";

export type MacroVisibility = "global" | "personal";

export interface Macro {
  id: number;
  title: string;
  body: string;
  category: TicketCategory | null;
  isActive: boolean;
  isSystem: boolean;
  visibility: MacroVisibility;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}
