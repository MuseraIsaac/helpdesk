import Sentry from "./lib/sentry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./lib/theme";
import "./index.css";
import App from "./App.tsx";

const queryClient = new QueryClient();

// Record when the page started loading so we can enforce a minimum display time.
const splashStart = performance.now();
const SPLASH_MIN_MS = 1600;

function dismissSplash() {
  const el = document.getElementById("spl");
  if (!el) return;
  // Complete the progress bar instantly before fading out
  const bar = el.querySelector(".spl-bar") as HTMLElement | null;
  if (bar) {
    bar.style.cssText = "width:100%;transition:width 0.22s ease;background:linear-gradient(90deg,#6366f1,#a855f7,#06b6d4)";
  }
  setTimeout(() => {
    el.classList.add("spl-out");
    // Remove from DOM after transition finishes so it can never block clicks
    setTimeout(() => el.remove(), 600);
  }, 240);
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
