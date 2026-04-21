/**
 * usePrintReport
 *
 * Builds an isolated print portal at document.body level so that window.print()
 * renders ONLY the report content — no sidebar, no top-bar, no breadcrumbs.
 *
 * Post-processes the cloned DOM to fix issues that arise when a screen-rendered
 * React component tree is translated to a print document:
 *   - SVG charts get a viewBox so they reflow to the printed column width
 *   - Loading skeletons, toggles, and tooltip layers are stripped
 *   - grid-cols-1 chart rows are promoted to 2-column print layout
 *   - [data-slot="chart"] containers get explicit print heights
 *   - overflow:hidden on card wrappers is cleared so SVG paths don't clip
 *
 * Usage:
 *   const printReport = usePrintReport();
 *   printReport({ title: "Overview Report", periodLabel: "Last 30 days" });
 */

import { useCallback } from "react";

export interface PrintReportConfig {
  title:       string;   // e.g. "Overview Report"
  periodLabel: string;   // e.g. "Last 30 days"  or  "1 Mar – 31 Mar 2026"
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── DOM post-processing ───────────────────────────────────────────────────────

function processClone(clone: HTMLElement): void {

  // 1. SVG normalisation — add viewBox from pixel dimensions, then set width=100%
  //    so that Recharts charts reflow to the printed column width.
  clone.querySelectorAll<SVGSVGElement>("svg").forEach((svg) => {
    const w = parseFloat(svg.getAttribute("width")  || "0");
    const h = parseFloat(svg.getAttribute("height") || "0");
    if (w > 0 && h > 0 && !svg.getAttribute("viewBox")) {
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width   = "100%";
    svg.style.height  = "auto";
    svg.style.display = "block";
    svg.style.overflow = "visible";
  });

  // 2. Recharts ResponsiveContainer wrappers — reset pixel inline dimensions
  clone.querySelectorAll<HTMLElement>(".recharts-responsive-container").forEach((rc) => {
    rc.style.width  = "100%";
    rc.style.height = "";       // let CSS control the height
  });

  // 3. [data-slot="chart"] (shadcn ChartContainer) — strip aspect-video height
  //    and set an explicit print height so charts are not invisible.
  clone.querySelectorAll<HTMLElement>('[data-slot="chart"]').forEach((c) => {
    c.style.height    = "180pt";
    c.style.maxHeight = "180pt";
    c.style.display   = "block";
  });

  // 4. ChartCard wrappers — clear overflow:hidden so SVG paths don't clip
  clone.querySelectorAll<HTMLElement>(".bg-card.rounded-xl").forEach((card) => {
    card.style.overflow = "visible";
    card.style.boxShadow = "none";
  });

  // 5. grid-cols-1 chart rows — these don't reach the md: breakpoint in print
  //    (A4 viewport ≈ 688px < 768px md: breakpoint), so force 2-column layout.
  clone.querySelectorAll<HTMLElement>(".grid.grid-cols-1").forEach((grid) => {
    grid.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  });

  // 6. Strip elements that should never appear in a printed document
  const STRIP_SELECTORS = [
    ".animate-pulse",                    // skeleton loaders
    "[data-slot='skeleton']",
    "[data-no-print]",                   // explicitly excluded elements
    "[role='dialog']",                   // modal overlays
    "[data-radix-popper-content-wrapper]", // tooltips / dropdowns
    "button",                            // all interactive controls
    "[role='button']",
    "input",
    "label:has(input)",                  // toggle labels
    "[data-slot='switch']",              // shadcn Switch
    "[data-slot='label']:has(input)",
    ".recharts-tooltip-wrapper",         // Recharts tooltip overlay
    ".recharts-legend-wrapper",          // optionally keep or remove
  ].join(", ");

  clone.querySelectorAll(STRIP_SELECTORS).forEach((el) => el.remove());

  // 7. Remove sticky / fixed positioning inside the clone
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const pos = getComputedStyle(el).position;
    if (pos === "sticky" || pos === "fixed") {
      el.style.position = "static";
    }
  });

  // 8. Remove min-h-screen that would create a huge blank page
  clone.querySelectorAll<HTMLElement>(".min-h-screen").forEach((el) => {
    el.style.minHeight = "0";
    el.style.background = "white";
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePrintReport() {
  const printReport = useCallback(({ title, periodLabel }: PrintReportConfig) => {
    const source = document.getElementById("report-print-area");
    if (!source) {
      window.print();
      return;
    }

    // Clean up any leftover portal from a previous (cancelled) print
    document.getElementById("print-portal")?.remove();
    document.body.classList.remove("print-active");

    const exportedAt = new Date().toLocaleString("en", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // ── Build portal ────────────────────────────────────────────────────────
    const portal = document.createElement("div");
    portal.id = "print-portal";

    // Cover header
    const cover = document.createElement("header");
    cover.className = "pf-cover";
    cover.innerHTML = `
      <div class="pf-cover-layout">
        <div class="pf-cover-left">
          <p class="pf-org">ITSM Helpdesk</p>
          <h1 class="pf-title">${escHtml(title)}</h1>
          <p class="pf-period">${escHtml(periodLabel)}</p>
        </div>
        <div class="pf-cover-right">
          <p class="pf-meta-label">Exported</p>
          <p class="pf-meta-value">${escHtml(exportedAt)}</p>
        </div>
      </div>
      <div class="pf-gradient-bar"></div>
    `;
    portal.appendChild(cover);

    // Cloned + post-processed report content
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.className = "pf-body " + (clone.className ?? "");
    processClone(clone);
    portal.appendChild(clone);

    // ── Inject and print ────────────────────────────────────────────────────
    document.body.appendChild(portal);
    document.body.classList.add("print-active");

    // Two rAFs: first lets React flush any pending state, second lets the browser
    // paint the portal before the print dialog opens.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();

        const cleanup = () => {
          document.body.classList.remove("print-active");
          document.getElementById("print-portal")?.remove();
          window.removeEventListener("afterprint", cleanup);
        };

        window.addEventListener("afterprint", cleanup);
        setTimeout(cleanup, 60_000); // safety fallback
      });
    });
  }, []);

  return printReport;
}
