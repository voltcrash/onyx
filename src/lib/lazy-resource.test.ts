import { expect, it, vi } from "vite-plus/test";
import { createLazyResource } from "./lazy-resource.js";
it("shares in-flight work and retries failures", async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("ready");
  const resource = createLazyResource(load);
  const first = resource.load();
  expect(resource.load()).toBe(first);
  await expect(first).rejects.toThrow("offline");
  expect(resource.status).toBe("failed");
  await expect(resource.load()).resolves.toBe("ready");
  expect(resource.status).toBe("ready");
  expect(load).toHaveBeenCalledTimes(2);
});
