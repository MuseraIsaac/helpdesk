import path from "path"
import { createRequire } from "module"
import { readFileSync } from "fs"
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from "@sentry/vite-plugin"

const require = createRequire(import.meta.url)

/**
 * serveRootReleaseJson — exposes the repo-root `release.json` as
 * `/release.json` to the client.
 *
 *   - dev  : a tiny middleware reads the file fresh on every GET so the
 *            user's edits show up immediately without restarting Vite.
 *   - build: the same file is emitted into `dist/release.json`, so Caddy
 *            (or any static host) serves it post-deploy.
 *
 * The file at the repo root is the single source of truth — nothing in
 * this plugin generates or rewrites it. This is also the same file used
 * by the in-app updates feature, so the version stays consistent.
 */
function serveRootReleaseJson(): Plugin {
  const repoRoot = path.resolve(__dirname, "..");
  const releasePath = path.join(repoRoot, "release.json");

  return {
    name: "zentra:serve-root-release-json",
    configureServer(server) {
      server.middlewares.use("/release.json", (_req, res) => {
        try {
          const body = readFileSync(releasePath, "utf8");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.statusCode = 200;
          res.end(body);
        } catch (err) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "release.json not found", detail: String(err) }));
        }
      });
    },
    // For prod build: emit the repo-root file straight into dist/.
    generateBundle() {
      try {
        const source = readFileSync(releasePath, "utf8");
        this.emitFile({ type: "asset", fileName: "release.json", source });
      } catch (err) {
        this.warn(`[release] could not read ${releasePath}: ${err}`);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    serveRootReleaseJson(),
    tailwindcss(),
    react(),
    sentryVitePlugin({
      disable: !process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }) as any,
  ],
  build: {
    sourcemap: "hidden",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react": path.dirname(require.resolve("react/package.json")),
      "react-dom": path.dirname(require.resolve("react-dom/package.json")),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    server: {
      deps: {
        inline: ["@tanstack/react-table"],
      },
    },
  },
})
