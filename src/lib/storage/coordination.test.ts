import { describe, expect, it } from "vite-plus/test";
import { VaultCoordination } from "./coordination.js";

describe("Vault coordination lifecycle", () => {
  it("drains active work and rejects queued work when closing", async () => {
    const coordination = new VaultCoordination("test", crypto.randomUUID());
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = coordination.runExclusive(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    await started;
    const queued = coordination.runExclusive(async () => "unexpected");
    const rejected = expect(queued).rejects.toThrow("closed");
    const closed = coordination.close();
    release();
    await first;
    await rejected;
    await closed;
    await expect(coordination.runExclusive(async () => undefined)).rejects.toThrow("closed");
  });
});
