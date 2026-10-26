import { defineConfig } from "@playwright/test";

// Read without Node's types, which this project does not install.
const { env } = (globalThis as { process?: { env: Record<string, string | undefined> } })
  .process ?? {
  env: {},
};

export default defineConfig({
  webServer: { command: "vp run build && vp preview", port: 4173 },
  testMatch: "**/*.e2e.{ts,js}",
  // Hosted CI runners are small, and parallel workers there starve the preview server of CPU.
  workers: env.CI ? 1 : undefined,
  use: { trace: "retain-on-failure" },
});
