/**
 * check-report-schedules — pg-boss worker that runs active report schedules.
 *
 * Enqueued every 5 minutes by the `schedule-report-check` cron job.
 * For each active ReportSchedule whose cron pattern fires in this window,
 * it runs the report's first widget query, formats the result as CSV,
 * and emails it to the configured recipients.
 *
 * A basic cron check is used: we compare the current UTC minute to the
 * schedule's cron expression using a lightweight parser rather than a
 * full cron library to avoid adding a dependency.
 */
import type { PgBoss } from "pg-boss";
import Sentry from "./sentry";
import prisma from "../db";
import { runQuery } from "./analytics/engine";
import { sendEmailJob } from "./send-email";

export const QUEUE_NAME = "check-report-schedules";

// ── Minimal cron matcher ──────────────────────────────────────────────────────

/**
 * Returns true if the given Date matches the cron expression.
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week.
 * Does NOT support seconds, L, W, # or other extended syntax.
 */
function matchesCron(expr: string, now: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minPart, hourPart, domPart, monPart, dowPart] = parts;
  const minute = now.getUTCMinutes();
  const hour   = now.getUTCHours();
  const dom    = now.getUTCDate();
  const month  = now.getUTCMonth() + 1; // 1-based
  const dow    = now.getUTCDay();        // 0 = Sunday

  function matches(part: string, value: number): boolean {
    if (part === "*") return true;
    for (const chunk of part.split(",")) {
      if (chunk.includes("/")) {
        const [range, step] = chunk.split("/");
        const s = Number(step);
        const [start] = range === "*" ? [0] : range.split("-").map(Number);
        if ((value - start) % s === 0 && value >= start) return true;
      } else if (chunk.includes("-")) {
        const [lo, hi] = chunk.split("-").map(Number);
        if (value >= lo && value <= hi) return true;
      } else if (Number(chunk) === value) {
        return true;
      }
    }
    return false;
  }

  return (
    matches(minPart!,  minute) &&
    matches(hourPart!, hour)   &&
    matches(domPart!,  dom)    &&
    matches(monPart!,  month)  &&
    matches(dowPart!,  dow)
  );
}

// ── Result → CSV ──────────────────────────────────────────────────────────────

function resultToCsv(result: { type: string; [k: string]: unknown }): string {
  switch (result.type) {
    case "stat":
      return `label,value\n"${result["label"]}",${result["value"] ?? ""}`;

    case "time_series": {
      const r = result as { type: "time_series"; series: {key: string; label: string}[]; points: Record<string, unknown>[] };
      const keys = ["date", ...r.series.map(s => s.key)];
      const header = keys.map(k => `"${k}"`).join(",");
      const rows   = r.points.map(p => keys.map(k => p[k] ?? "").join(","));
      return [header, ...rows].join("\n");
    }

    case "grouped_count": {
      const r = result as { type: "grouped_count"; items: {key: string; label: string; value: number}[] };
      const header = '"key","label","value"';
      const rows   = r.items.map(i => `"${i.key}","${i.label}",${i.value}`);
      return [header, ...rows].join("\n");
    }

    case "leaderboard": {
      const r = result as { type: "leaderboard"; entries: {rank: number; label: string; columns: Record<string, unknown>}[]; columnDefs: {key: string; label: string}[] };
      const colKeys = r.columnDefs.map(c => c.key);
      const header  = ["rank", "name", ...r.columnDefs.map(c => c.label)].map(k => `"${k}"`).join(",");
      const rows    = r.entries.map(e =>
        [e.rank, `"${e.label}"`, ...colKeys.map(k => e.columns[k] ?? "")].join(","),
      );
      return [header, ...rows].join("\n");
    }

    default:
      return `"type"\n"${result.type}"`;
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

export async function registerCheckReportSchedulesWorker(boss: PgBoss): Promise<void> {
  await boss.work(QUEUE_NAME, async () => {
    const now = new Date();

    const schedules = await prisma.reportSchedule.findMany({
      where: { isActive: true },
      include: { report: { select: { id: true, name: true, config: true } } },
    });

    for (const schedule of schedules) {
      try {
        if (!matchesCron(schedule.cronExpr, now)) continue;

        const config = schedule.report.config as {
          widgets?: { metricId: string; visualization?: string; limit?: number }[];
          dateRange?: { preset?: string };
        };

        const widgets = config.widgets ?? [];
        if (widgets.length === 0) continue;

        // Run all widgets and build CSV sections
        const csvParts: string[] = [`Report: ${schedule.report.name}`, `Generated: ${now.toISOString()}`, ""];

        for (const w of widgets.slice(0, 10)) {
          try {
            const resp = await runQuery(prisma, {
              metricId:   w.metricId,
              dateRange:  config.dateRange ?? { preset: "last_30_days" },
              limit:      w.limit ?? 50,
              visualization: w.visualization,
              compareWithPrevious: false,
            });
            csvParts.push(`== ${resp.label} ==`);
            csvParts.push(resultToCsv(resp.result as { type: string; [k: string]: unknown }));
            csvParts.push("");
          } catch (err) {
            csvParts.push(`== ${w.metricId} (error) ==`);
            csvParts.push(`"Error: ${err instanceof Error ? err.message : String(err)}"`);
            csvParts.push("");
          }
        }

        const csvBody = csvParts.join("\n");
        const subject = schedule.name
          ? `Scheduled Report: ${schedule.name}`
          : `Scheduled Report: ${schedule.report.name}`;

        for (const recipient of schedule.recipients as string[]) {
          await sendEmailJob({
            to:      recipient,
            subject,
            body:    `Please find your scheduled report attached.\n\nReport: ${schedule.report.name}\nGenerated: ${now.toUTCString()}`,
            bodyHtml: `<p>Your scheduled report <strong>${schedule.report.name}</strong> is attached.</p>`
                    + `<p>Generated: ${now.toUTCString()}</p>`,
          });

          // Send CSV as a separate email with inline body (avoids attachment complexity)
          await sendEmailJob({
            to:      recipient,
            subject: `${subject} — CSV Data`,
            body:    csvBody,
          });
        }

        console.log(`[report-schedule] sent "${schedule.report.name}" to ${(schedule.recipients as string[]).join(", ")}`);
      } catch (err) {
        Sentry.captureException(err, { tags: { queue: QUEUE_NAME, scheduleId: schedule.id } });
        console.error(`[report-schedule] error for schedule ${schedule.id}:`, err);
      }
    }
  });
}
