import { defineConfig } from "@playwright/test";

// Read without Node's types, which this project does not install.
const { env } = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process ?? {
  env: {},
};

const port = Number(env.ONYX_E2E_PORT ?? "4173");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid ONYX_E2E_PORT");

export default defineConfig({
  forbidOnly: !!env.CI,
  reporter: env.CI ? [["dot"], ["github"], ["html", { open: "never" }]] : undefined,
  webServer: {
    command: [
      "vp run build && vp exec wrangler dev --local --infer-origin-from-routes=false",
      `--port ${port}`,
      `--var BETTER_AUTH_URL:http://localhost:${port}`,
      // Fixed placeholders exercise the real auth handler without external credentials.
      "--var BETTER_AUTH_SECRET:onyx-e2e-placeholder-secret-never-use-in-production",
      "--var GITHUB_CLIENT_ID:onyx-e2e-placeholder",
      "--var GITHUB_APP_SLUG:onyx-e2e-placeholder",
      "--var GITHUB_CLIENT_SECRET:onyx-e2e-placeholder",
    ].join(" "),
    port,
    env: { CLOUDFLARE_SEND_METRICS: "false" },
  },
  testMatch: "**/*.e2e.{ts,js}",
  // Hosted CI runners are small, and parallel workers there starve the preview server of CPU.
  workers: env.CI ? 1 : undefined,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
