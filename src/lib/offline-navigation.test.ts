import { describe, expect, it, vi } from "vite-plus/test";
import { fetchNavigation } from "./offline-navigation.js";

describe("offline navigation", () => {
  it("serves network responses without replacing the active offline shell", async () => {
    const response = new Response("newer deployment shell");
    const activeShell = new Response("active deployment shell");
    const actual = await fetchNavigation(
      () => Promise.resolve(response),
      () => Promise.resolve(activeShell),
    );
    expect(actual).toBe(response);
    expect(await actual.text()).toBe("newer deployment shell");
    const offline = await fetchNavigation(
      () => Promise.reject(new TypeError("Offline")),
      () => Promise.resolve(activeShell),
    );
    expect(await offline.text()).toBe("active deployment shell");
  });

  it("uses the current cached shell only when the network fails", async () => {
    const response = new Response("offline shell");
    expect(
      await fetchNavigation(
        () => Promise.reject(new TypeError("Offline")),
        () => Promise.resolve(response),
      ),
    ).toBe(response);
  });
});

it("opens the cached app shell without waiting for the network", async () => {
  const network = vi.fn(() => new Promise<Response>(() => {}));
  const shell = new Response("installed shell");
  expect(await fetchNavigation(network, async () => shell, true)).toBe(shell);
  expect(network).not.toHaveBeenCalled();
});

it("fetches the shell if its cache is missing or unavailable", async () => {
  const response = new Response("fresh shell");
  for (const cached of [
    async () => undefined,
    async () => {
      throw new Error("cache unavailable");
    },
  ]) {
    const network = vi.fn(async () => response);
    expect(await fetchNavigation(network, cached, true)).toBe(response);
    expect(network).toHaveBeenCalledTimes(1);
  }
});

it("keeps network errors and responses for callback and non-shell navigations", async () => {
  const response = new Response("not found", { status: 404 });
  const cached = vi.fn(async () => new Response("shell"));
  expect(await fetchNavigation(async () => response, cached)).toBe(response);
  expect(cached).not.toHaveBeenCalled();
});
