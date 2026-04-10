import type { TicketCategory } from "./ticket-category";

export interface Macro {
  id: number;
  title: string;
  body: string;
  category: TicketCategory | null;
  isActive: boolean;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}
