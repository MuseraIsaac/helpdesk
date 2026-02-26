import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Ticket } from "../generated/prisma/client";
import { ticketCategories, type TicketCategory } from "core/constants/ticket-category.ts";
import prisma from "../db";

export function classifyTicket(ticket: Ticket): void {
  doClassify(ticket).catch((error) =>
    console.error(`Failed to classify ticket ${ticket.id}:`, error)
  );
}

async function doClassify(ticket: Ticket): Promise<void> {
  const { text } = await generateText({
    model: openai("gpt-5-nano"),
    system:
      "You are a support ticket classifier. " +
      "Classify the ticket into exactly one of these categories: " +
      `${ticketCategories.join(", ")}. ` +
      "Return only the category value with no extra text.",
    prompt: `Subject: ${ticket.subject}\n\nBody: ${ticket.body}`,
  });

  const category = text.trim() as TicketCategory;

  if (!ticketCategories.includes(category)) {
    console.warn(
      `Invalid category "${text.trim()}" returned for ticket ${ticket.id}`
    );
    return;
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { category },
  });
}
