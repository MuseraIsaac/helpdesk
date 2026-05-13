/**
 * Global 403 (Forbidden) response handler.
 *
 * The user's permissions are checked in three places:
 *   1. Sidebar `permission:` gates — hide nav entries the user can't use.
 *   2. <PermissionRoute permission="…"> — block direct URL navigation.
 *   3. Server `requirePermission("…")` middleware — last line of defence.
 *
 * Normally #1 and #2 catch everything client-side and #3 never fires. But
 * permission changes save instantly on the server while the client's
 * session/role data is briefly stale, OR a user lands on a permission
 * mismatch path. Without this interceptor, pages render a red "Forbidden"
 * banner inline which looks broken.
 *
 * Behaviour:
 *   - On any axios response with status 403:
 *     • Fire a sonner toast ("Access denied — your permissions changed").
 *     • Replace the URL with "/" (the user's landing page).
 *     • Swallow the rejected promise's error so consumer components show
 *       skeleton/empty state instead of a permission banner.
 *
 * Some 403s are intentional (e.g. a setting that's deliberately admin-only)
 * — those routes should be unreachable to non-admins via the sidebar/route
 * gates so the user never sees them. If a 403 fires from a path on the
 * SUPPRESS_PATHS list, the redirect is skipped and the error is rethrown
 * for the caller to handle locally.
 */
import axios, { AxiosError } from "axios";
import { toast } from "sonner";

/**
 * Endpoints where a 403 is part of normal probing logic and should NOT
 * trigger a global redirect — e.g. a settings panel testing whether the
 * caller can write, or feature-flag style "can the user see this?" probes.
 */
const SUPPRESS_REDIRECT_PATHS: ReadonlyArray<RegExp> = [
  /\/api\/auth\//,                  // Better Auth probes 403 during login
  /\/api\/settings\/[^/]+$/,        // Section reads — let the page handle it
];

let lastRedirectAt = 0;

export function installAxios403Interceptor(): void {
  axios.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error?.response?.status === 403) {
        const url = error.config?.url ?? "";
        const suppress = SUPPRESS_REDIRECT_PATHS.some((re) => re.test(url));

        if (!suppress) {
          // Debounce so a page that fires multiple parallel queries doesn't
          // trigger N toasts and N redirects on the same render cycle.
          const now = Date.now();
          if (now - lastRedirectAt > 1500) {
            lastRedirectAt = now;
            toast.error("Access denied", {
              description:
                "You don't have permission to view this. Your role may have changed — taking you home.",
              duration: 4000,
            });
            // Hard navigate (not pushState) to ensure session/role caches
            // refresh on the next page load.
            window.setTimeout(() => {
              if (window.location.pathname !== "/") {
                window.location.assign("/");
              }
            }, 200);
          }
          // Mark the error so ErrorAlert / other consumers can choose to
          // render nothing (the redirect already conveys the failure).
          (error as AxiosError & { _suppressed?: boolean })._suppressed = true;
        }
      }
      return Promise.reject(error);
    },
  );
}
