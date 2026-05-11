/**
 * capture-screenshots.ts
 *
 * Drives a Chromium browser against the locally-running dev server, signs in
 * as the admin, and captures every page that's worth putting in a sales
 * proposal. Output goes into `./proposal-screenshots/`.
 *
 * Usage:
 *   1. Make sure both dev processes are up:
 *        cd server && bun run dev      (API on :3000)
 *        cd client && bun run dev      (Vite on :5173)
 *   2. From the repo root:
 *        bun run scripts/capture-screenshots.ts
 *
 * Override the target URL or credentials via env if you need to:
 *   BASE_URL=http://localhost:5173 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Admin1234!
 */

import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL       = process.env.BASE_URL       ?? "http://138.199.153.57";
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Zentr@2026";
const THEME          = (process.env.THEME ?? "light") as "light" | "dark";
const OUT_DIR        = join(__dirname, "..", "proposal-screenshots", THEME);

mkdirSync(OUT_DIR, { recursive: true });

// Each entry: a route to visit, a stable selector to wait for, an output
// filename, and an optional pre-shot pause to let in-flight animations / data
// settle. Selectors are chosen to be tolerant of minor markup changes — they
// look for content the page is meant to render, not for specific class names.
interface Shot {
  name:        string;        // output filename (no extension)
  path:        string;        // route to visit
  waitFor?:    string;        // selector to await before screenshotting
  waitText?:   string;        // OR text to await
  settleMs?:   number;        // extra wait after the selector matches
  fullPage?:   boolean;       // true → full-page screenshot
}

const SHOTS: Shot[] = [
  // Data-heavy pages need a generous settle window because the dev API runs
  // synchronous rule-engine / automation evaluation on many requests; 6s is
  // empirically enough to let dashboard widgets, charts, and tables paint.
  { name: "01-login",            path: "/login",                  waitText: "Sign in",            settleMs: 800 },
  { name: "02-dashboard",        path: "/dashboard",              waitText: "Dashboard",          settleMs: 7000, fullPage: true },
  { name: "03-tickets-list",     path: "/tickets",                waitText: "Tickets",            settleMs: 4000 },
  { name: "04-ticket-detail",    path: "/tickets/INC0003",        waitText: "Conversation",       settleMs: 4500, fullPage: true },
  { name: "05-incidents",        path: "/incidents",              waitText: "Incidents",          settleMs: 4000 },
  { name: "06-service-requests", path: "/requests",               waitText: "Service Requests",   settleMs: 4000 },
  { name: "07-problems",         path: "/problems",               waitText: "Problems",           settleMs: 4000 },
  { name: "08-changes",          path: "/changes",                waitText: "Changes",            settleMs: 4000 },
  { name: "09-cmdb",             path: "/cmdb",                   waitText: "CMDB",               settleMs: 4000 },
  { name: "10-assets",           path: "/assets",                 waitText: "Assets",             settleMs: 4000 },
  { name: "11-approvals",        path: "/approvals",              waitText: "Approvals",          settleMs: 4000 },
  { name: "12-kb",               path: "/kb",                     waitText: "Knowledge",          settleMs: 3000 },
  { name: "13-reports",          path: "/reports",                waitText: "Reports",            settleMs: 6000, fullPage: true },
  { name: "14-automations",      path: "/automations",            waitText: "Automation",         settleMs: 3500, fullPage: true },
  { name: "15-admin-overview",   path: "/admin",                  waitText: "Administration",    settleMs: 2000, fullPage: true },
  { name: "16-admin-monitoring", path: "/admin/monitoring",       waitText: "System Monitoring",  settleMs: 5000 },
  { name: "17-profile",          path: "/profile",                waitText: "Profile",            settleMs: 2000 },
  { name: "18-shortcuts",        path: "/profile?tab=shortcuts",  waitText: "Keyboard shortcuts", settleMs: 2000 },
];

async function signIn(page: Page) {
  console.log(`→ signing in as ${ADMIN_EMAIL}`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });

  // The login form is the agent sign-in — find the email/password inputs by
  // attribute rather than class so we're resilient to styling changes.
  await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"], input[name="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');

  // Land somewhere authenticated — the layout sidebar is the most reliable
  // signal that login succeeded.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  console.log("  ✓ signed in");
}

async function capture(page: Page, shot: Shot) {
  const file = join(OUT_DIR, `${shot.name}.png`);
  console.log(`→ ${shot.path}  →  ${shot.name}.png`);

  try {
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "networkidle", timeout: 20000 });
  } catch (e) {
    // networkidle can be flaky on SSE-rich pages; fall back to domcontentloaded
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  }

  // Wait for the page's first-meaningful element.
  if (shot.waitFor) {
    await page.locator(shot.waitFor).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  } else if (shot.waitText) {
    await page.getByText(shot.waitText, { exact: false }).first()
      .waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  }

  if (shot.settleMs) await page.waitForTimeout(shot.settleMs);

  // Belt-and-braces: confirm the html element matches the requested theme
  // — index.html hardcodes `class="dark"`, so we strip / re-add accordingly
  // in case the provider's effect hasn't run yet.
  await page.evaluate((theme: string) => {
    if (theme === "light") document.documentElement.classList.remove("dark");
    else                   document.documentElement.classList.add("dark");
    try { localStorage.setItem("helpdesk-theme", theme); } catch {}
  }, THEME);

  await page.screenshot({
    path:     file,
    fullPage: shot.fullPage ?? false,
    type:     "png",
  });
  console.log(`  ✓ ${shot.name}.png saved`);
}

async function main() {
  const start = Date.now();
  console.log(`→ capturing in ${THEME} theme → ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    // Make screenshots clean: hide scrollbars, slow down animations.
    reducedMotion: "reduce",
    colorScheme: THEME,
  });

  // Pin the theme before any page script runs. The app's ThemeProvider reads
  // `helpdesk-theme` from localStorage on boot; pre-seeding it means every
  // navigation lands in the requested mode from the first paint.
  await context.addInitScript((theme) => {
    try { localStorage.setItem("helpdesk-theme", theme); } catch {}
  }, THEME);

  const page = await context.newPage();

  // Helpful console capture so failures are visible.
  page.on("pageerror", (err) => console.warn("  [page error]", err.message));

  try {
    await signIn(page);
    for (const shot of SHOTS) {
      try {
        await capture(page, shot);
      } catch (e) {
        console.error(`  ✗ ${shot.name} failed:`, e instanceof Error ? e.message : e);
      }
    }
    console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s — ${SHOTS.length} screenshots in ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
