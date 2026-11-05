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
  webServer: { command: `vp run build && vp preview --port ${port} --strictPort`, port },
  testMatch: "**/*.e2e.{ts,js}",
  // Hosted CI runners are small, and parallel workers there starve the preview server of CPU.
  workers: env.CI ? 1 : undefined,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
});
