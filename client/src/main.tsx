import Sentry from "./lib/sentry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./lib/theme";
import { installAxios403Interceptor } from "./lib/axios-403-interceptor";
import { installChunkReloadHandler } from "./lib/chunk-reload";
import "./index.css";
import App from "./App.tsx";

// Catch permission-mismatch 403s globally and convert them into a clean
// redirect-home + toast, instead of letting pages render red banners.
installAxios403Interceptor();

// Auto-recover from stale lazy-chunk errors after a deploy or dev-server
// restart. Without this, the user sees "Failed to fetch dynamically
// imported module" the first time they navigate to a route whose chunk
// hash changed since their tab opened.
installChunkReloadHandler();

/**
 * Global TanStack Query defaults.
 *
 * `staleTime: 2 min` — most ITSM data (tickets, incidents, assets…) changes
 * on the order of minutes, not seconds. Treating every fresh fetch as good
 * for 2 minutes eliminates the redundant refetches that were happening on
 * almost every cross-page navigation (e.g. dashboard → tickets list →
 * back to dashboard fired the dashboard widgets again). Mutations still
 * invalidate by query key, so user actions surface immediately.
 *
 * `gcTime: 10 min` — keep cached data around for 10 min after the last
 * subscriber unmounts. Longer than staleTime so quick back-navigations
 * read from cache without a network roundtrip even after staleness.
 *
 * `refetchOnWindowFocus: false` / `refetchOnReconnect: false` — pages
 * that genuinely need live data subscribe via SSE.
 *
 * `retry: 1` — a single retry is enough for transient network blips;
 * the default of 3 made failing pages take ~10 s to settle into their
 * error state.
 *
 * Individual `useQuery` calls override these (e.g. dictionary endpoints
 * with `staleTime: 5 * 60_000`, presence streams with explicit zero).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
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
