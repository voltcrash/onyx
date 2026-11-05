import { describe, expect, it } from "vite-plus/test";
import { createConfirmation } from "./confirmation.svelte.js";
const options = { eyebrow: "Test", title: "Confirm", message: "Continue?", confirmLabel: "Yes" };
describe("Confirmation lifecycle", () => {
  it("settles a superseded request while preparation is pending", async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const confirmation = createConfirmation(() => ready);
    const first = confirmation.ask(options);
    const second = confirmation.ask(options);
    release();
    await expect(first).resolves.toBe(false);
    confirmation.confirm();
    await expect(second).resolves.toBe(true);
  });
  it("does not reopen after cancellation or disposal during preparation", async () => {
    const confirmation = createConfirmation(() => Promise.resolve());
    const pending = confirmation.ask(options);
    confirmation.dispose();
    await expect(pending).resolves.toBe(false);
    expect(confirmation.request).toBeUndefined();
  });
});
