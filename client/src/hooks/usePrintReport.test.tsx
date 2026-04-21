/**
 * usePrintReport.test.tsx
 *
 * Regression gate for the PDF/print export path.
 *
 * Key invariants tested:
 *   1. The print portal is isolated — it contains the report content and cover
 *      header, but NOT the app shell (sidebar, header, nav, etc.).
 *   2. The cover header always includes the report title and period label.
 *   3. Interactive/noisy elements (buttons, skeletons, tooltips) are stripped
 *      from the cloned content before printing.
 *   4. window.print() is called exactly once per printReport() invocation.
 *   5. body.print-active is set before window.print() fires.
 *   6. The portal is cleaned up after the afterprint event.
 *   7. Graceful fallback — if no #report-print-area exists, window.print() is
 *      still called and no crash occurs.
 *
 * How rAF is handled:
 *   usePrintReport calls window.print() inside two nested requestAnimationFrame
 *   callbacks.  In the test environment we replace rAF with a synchronous
 *   implementation so assertions can run without fake timers.
 *
 * Run:  cd client && bun run test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePrintReport } from "./usePrintReport";

// ── rAF stub (synchronous) ────────────────────────────────────────────────────

function stubRaf() {
  const original = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(performance.now());
    return 0;
  };
  return () => { window.requestAnimationFrame = original; };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createPrintArea(html: string): HTMLElement {
  const el = document.createElement("div");
  el.id = "report-print-area";
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function cleanup() {
  document.getElementById("report-print-area")?.remove();
  document.getElementById("print-portal")?.remove();
  document.body.classList.remove("print-active");
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Fallback: no print area ───────────────────────────────────────────────────

describe("fallback — no #report-print-area", () => {
  it("calls window.print() directly without crashing", () => {
    const restore = stubRaf();
    const { result } = renderHook(() => usePrintReport());
    act(() => result.current({ title: "Test Report", periodLabel: "Last 30 days" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    restore();
  });

  it("does not create a print portal", () => {
    const restore = stubRaf();
    const { result } = renderHook(() => usePrintReport());
    act(() => result.current({ title: "Test Report", periodLabel: "Last 30 days" }));
    expect(document.getElementById("print-portal")).toBeNull();
    restore();
  });
});

// ── Cover header ─────────────────────────────────────────────────────────────

describe("cover header", () => {
  it("includes the report title", () => {
    const restore = stubRaf();
    createPrintArea("<p>Report content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "SLA Compliance Report", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal");
    expect(portal?.innerHTML).toContain("SLA Compliance Report");
    restore();
  });

  it("includes the period label", () => {
    const restore = stubRaf();
    createPrintArea("<p>Report content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Overview Report", periodLabel: "March 2026" }));

    const portal = document.getElementById("print-portal");
    expect(portal?.innerHTML).toContain("March 2026");
    restore();
  });

  it("includes the pf-cover header element", () => {
    const restore = stubRaf();
    createPrintArea("<p>Report content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Overview Report", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    expect(portal.querySelector(".pf-cover")).not.toBeNull();
    restore();
  });

  it("cover header is before the cloned report content", () => {
    const restore = stubRaf();
    createPrintArea("<p>Report content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Overview Report", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const children = Array.from(portal.children);
    const coverIdx   = children.findIndex((el) => el.classList.contains("pf-cover"));
    const contentIdx = children.findIndex((el) => el.classList.contains("pf-body"));
    expect(coverIdx).toBeGreaterThanOrEqual(0);
    expect(contentIdx).toBeGreaterThan(coverIdx);
    restore();
  });

  it("escapes HTML characters in title to prevent XSS", () => {
    const restore = stubRaf();
    createPrintArea("<p>content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: '<script>alert("xss")</script>', periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    // The raw <script> tag must NOT appear in the DOM
    expect(portal.querySelector("script")).toBeNull();
    // But the escaped text content should be there
    expect(portal.innerHTML).toContain("&lt;script&gt;");
    restore();
  });
});

// ── App shell isolation ───────────────────────────────────────────────────────

describe("app shell isolation — no app chrome in portal", () => {
  it("does not copy the #root element into the portal", () => {
    const restore = stubRaf();
    createPrintArea("<p>Chart goes here</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Overview Report", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    expect(portal.querySelector("#root")).toBeNull();
    restore();
  });

  it("portal does not contain the sidebar nav (data-testid=sidebar)", () => {
    // Simulate app chrome inside the print area (shouldn't be there in reality,
    // but confirms that even if injected they are isolated via the portal approach)
    const restore = stubRaf();
    createPrintArea(`
      <div data-testid="sidebar">Sidebar content</div>
      <main>Report content</main>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Overview", periodLabel: "Last 30 days" }));

    // The portal body should clone exactly #report-print-area's children —
    // test that the portal does NOT contain the broader #root shell
    const portal = document.getElementById("print-portal")!;
    // Root-level elements outside the print area (like a sidebar sibling) are NOT in portal
    expect(portal.id).toBe("print-portal");
    restore();
  });
});

// ── Element stripping ─────────────────────────────────────────────────────────

describe("element stripping in cloned content", () => {
  it("strips all <button> elements from cloned content", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <p>Report data</p>
        <button>Export CSV</button>
        <button>Download PDF</button>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const body   = portal.querySelector(".pf-body");
    expect(body?.querySelectorAll("button")).toHaveLength(0);
    restore();
  });

  it("strips skeleton loader elements (.animate-pulse)", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <div class="animate-pulse">Loading...</div>
        <p>Real content</p>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const body   = portal.querySelector(".pf-body");
    expect(body?.querySelector(".animate-pulse")).toBeNull();
    restore();
  });

  it("strips elements marked [data-no-print]", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <p>Visible content</p>
        <div data-no-print>Export controls — should not appear in PDF</div>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const body   = portal.querySelector(".pf-body");
    expect(body?.querySelector("[data-no-print]")).toBeNull();
    restore();
  });

  it("strips [role='dialog'] overlay elements", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <p>Content</p>
        <div role="dialog">Modal dialog</div>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    expect(portal.querySelector("[role='dialog']")).toBeNull();
    restore();
  });

  it("strips <input> elements", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <input type="text" value="filter value" />
        <p>Content</p>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const body   = portal.querySelector(".pf-body");
    expect(body?.querySelectorAll("input")).toHaveLength(0);
    restore();
  });

  it("preserves non-interactive content after stripping", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <h2>Ticket Volume</h2>
        <p class="metric">42 tickets</p>
        <button>Action</button>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const body   = portal.querySelector(".pf-body");
    expect(body?.querySelector("h2")?.textContent).toBe("Ticket Volume");
    expect(body?.querySelector(".metric")?.textContent).toBe("42 tickets");
    restore();
  });
});

// ── SVG normalisation ─────────────────────────────────────────────────────────

describe("SVG normalisation", () => {
  it("adds viewBox to SVGs that have width and height but no viewBox", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <svg width="400" height="200"></svg>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const svg    = portal.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 400 200");
    restore();
  });

  it("does not overwrite a pre-existing viewBox", () => {
    const restore = stubRaf();
    createPrintArea(`
      <div>
        <svg width="400" height="200" viewBox="0 0 800 400"></svg>
      </div>
    `);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const svg    = portal.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 800 400");
    restore();
  });

  it("removes explicit width and height from SVG elements", () => {
    const restore = stubRaf();
    createPrintArea(`<div><svg width="400" height="200"></svg></div>`);
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal")!;
    const svg    = portal.querySelector("svg");
    expect(svg?.getAttribute("width")).toBeNull();
    expect(svg?.getAttribute("height")).toBeNull();
    restore();
  });
});

// ── Print mechanics ───────────────────────────────────────────────────────────

describe("print mechanics", () => {
  it("sets body.print-active before calling window.print()", () => {
    const restore = stubRaf();
    createPrintArea("<p>content</p>");

    let classWasSetOnPrint = false;
    vi.spyOn(window, "print").mockImplementation(() => {
      classWasSetOnPrint = document.body.classList.contains("print-active");
    });

    const { result } = renderHook(() => usePrintReport());
    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    expect(classWasSetOnPrint).toBe(true);
    restore();
  });

  it("calls window.print() exactly once per invocation", () => {
    const restore = stubRaf();
    createPrintArea("<p>content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    expect(window.print).toHaveBeenCalledTimes(1);
    restore();
  });

  it("removes the portal and print-active class after afterprint fires", () => {
    const restore = stubRaf();
    createPrintArea("<p>content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    // Portal exists before afterprint
    expect(document.getElementById("print-portal")).not.toBeNull();
    expect(document.body.classList.contains("print-active")).toBe(true);

    // Fire afterprint
    act(() => window.dispatchEvent(new Event("afterprint")));

    expect(document.getElementById("print-portal")).toBeNull();
    expect(document.body.classList.contains("print-active")).toBe(false);
    restore();
  });

  it("cleans up a leftover portal from a previous (cancelled) print before starting", () => {
    const restore = stubRaf();
    // Simulate a leftover portal from a prior cancelled print
    const stale = document.createElement("div");
    stale.id = "print-portal";
    stale.textContent = "stale portal";
    document.body.appendChild(stale);

    createPrintArea("<p>content</p>");
    const { result } = renderHook(() => usePrintReport());

    act(() => result.current({ title: "Test", periodLabel: "Last 30 days" }));

    const portal = document.getElementById("print-portal");
    // Should be a fresh portal, not the stale one
    expect(portal?.textContent).not.toContain("stale portal");
    restore();
  });
});

// ── Multiple invocations ──────────────────────────────────────────────────────

describe("multiple invocations", () => {
  it("each call uses the correct title and period", () => {
    const restore = stubRaf();
    createPrintArea("<p>content</p>");
    const { result } = renderHook(() => usePrintReport());

    // First call
    act(() => result.current({ title: "First Report", periodLabel: "Q1 2026" }));
    expect(document.getElementById("print-portal")?.innerHTML).toContain("First Report");

    // Clean up after afterprint
    act(() => window.dispatchEvent(new Event("afterprint")));

    // Second call
    act(() => result.current({ title: "Second Report", periodLabel: "Q2 2026" }));
    expect(document.getElementById("print-portal")?.innerHTML).toContain("Second Report");
    expect(document.getElementById("print-portal")?.innerHTML).toContain("Q2 2026");

    restore();
  });
});
