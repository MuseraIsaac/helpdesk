import fs from "fs";
import path from "path";
import type { PgBoss } from "pg-boss";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import Sentry from "./sentry";
import prisma from "../db";
import { sendEmailJob } from "./send-email";
import { logAudit } from "./audit";

const QUEUE_NAME = "auto-resolve-ticket";

const knowledgeBase = fs.readFileSync(
  path.join(import.meta.dirname, "../../knowledge-base.md"),
  "utf-8"
);

interface AutoResolveJobData {
  ticketId: number;
  subject: string;
  body: string;
  senderName: string;
  senderEmail: string;
}

export async function registerAutoResolveWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME, {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  await boss.work<AutoResolveJobData>(QUEUE_NAME, async (jobs) => {
    const { ticketId, subject, body, senderName, senderEmail } = jobs[0]!.data;
    const firstName = senderName.split(" ")[0];

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "processing" },
    });

    let response: string;
    try {
      const { text } = await generateText({
        model: openai("gpt-5-nano"),
        system:
          "You are a friendly and professional support agent for Code with Mosh. " +
          "Use ONLY the following knowledge base to answer the customer's question.\n\n" +
          knowledgeBase +
          "\n\n" +
          "Guidelines for your response:\n" +
          `- Address the customer by their first name: ${firstName}\n` +
          "- Use a warm, professional, and customer-friendly tone\n" +
          "- Format the response clearly with line breaks between paragraphs\n" +
          "- Use bullet points or numbered lists when listing steps or multiple items\n" +
          "- End with an offer to help further, e.g. 'If you have any other questions, feel free to reach out.'\n" +
          "- Sign off with:\n\nBest regards,\nCode with Mosh Support\n\n" +
          "If the knowledge base does NOT contain enough information to fully resolve the question, " +
          'respond with exactly "ESCALATE" and nothing else.',
        prompt: `Subject: ${subject}\n\nBody: ${body}`,
      });
      response = text.trim();
    } catch (error) {
      Sentry.captureException(error, {
        tags: { queue: QUEUE_NAME, ticketId },
      });
      console.error(`Auto-resolve AI call failed for ticket ${ticketId}:`, error);
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "open", assignedToId: null },
      });
      return;
    }

    if (response === "ESCALATE") {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "open", assignedToId: null },
      });
    } else {
      try {
        const now = new Date();
        // Fetch current SLA state to check for breaches before stamping
        const currentTicket = await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { firstRespondedAt: true, firstResponseDueAt: true, resolutionDueAt: true },
        });
        const breachedFirstResponse =
          !currentTicket?.firstRespondedAt &&
          currentTicket?.firstResponseDueAt != null &&
          now > currentTicket.firstResponseDueAt;
        const breachedResolution =
          currentTicket?.resolutionDueAt != null && now > currentTicket.resolutionDueAt;

        const [aiReply] = await prisma.$transaction([
          prisma.reply.create({
            data: {
              body: response,
              senderType: "agent",
              ticketId,
              userId: null,
            },
          }),
          prisma.ticket.update({
            where: { id: ticketId },
            data: {
              status: "resolved",
              // Stamp both milestones — AI resolves in one shot
              ...(!currentTicket?.firstRespondedAt && { firstRespondedAt: now }),
              resolvedAt: now,
              ...((breachedFirstResponse || breachedResolution) && { slaBreached: true }),
            },
          }),
        ]);

        void logAudit(ticketId, null, "reply.created", {
          replyId: aiReply.id,
          senderType: "agent",
          automated: true,
        });
        void logAudit(ticketId, null, "ticket.status_changed", {
          from: "processing",
          to: "resolved",
          automated: true,
        });

        await sendEmailJob({
          to: senderEmail,
          subject: `Re: ${subject}`,
          body: response,
        });
      } catch (error) {
        Sentry.captureException(error, {
          tags: { queue: QUEUE_NAME, ticketId },
        });
        throw error;
      }
    }
  });
}

export async function sendAutoResolveJob(ticket: {
  id: number;
  subject: string;
  body: string;
  senderName: string;
  senderEmail: string;
}): Promise<void> {
  const { boss } = await import("./queue");
  await boss.send(QUEUE_NAME, {
    ticketId: ticket.id,
    subject: ticket.subject,
    body: ticket.body,
    senderName: ticket.senderName,
    senderEmail: ticket.senderEmail,
  });
}
