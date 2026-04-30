import Sentry from "./lib/sentry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./lib/theme";
import "./index.css";
import App from "./App.tsx";

/**
 * Global TanStack Query defaults.
 *
 * `staleTime: 30s` — every query is considered fresh for 30 seconds after
 * a successful fetch, so quick navigations (e.g. ticket detail → back to
 * list) reuse cached data instead of paying a network round-trip. Mutations
 * still invalidate by query key as usual.
 *
 * `gcTime: 5min` — keep cached data around for 5 min after the last
 * subscriber unmounts, then garbage-collect.
 *
 * `refetchOnWindowFocus: false` — the helpdesk doesn't need refetch-on-tab-
 * focus everywhere; pages that *do* need live data subscribe via SSE.
 *
 * Individual `useQuery` calls override these by passing their own values
 * (e.g. dictionary endpoints with `staleTime: 5 * 60_000`).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Record when the page started loading so we can enforce a minimum display time.
const splashStart = performance.now();
const SPLASH_MIN_MS = 1600;

function dismissSplash() {
  const el = document.getElementById("spl");
  if (!el) return;
  // Indeterminate sweeping bar — just fade the splash out; the bar continues
  // its sweep animation until the element is removed from the DOM.
  el.classList.add("spl-out");
  setTimeout(() => el.remove(), 600);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">
            Something went wrong. Please refresh the page.
          </p>
        </div>
      }
    >
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);

// Wait until the browser has painted the first React frame, then honour the
// minimum display time before sliding the splash away.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const elapsed = performance.now() - splashStart;
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    setTimeout(dismissSplash, remaining);
  });
});
