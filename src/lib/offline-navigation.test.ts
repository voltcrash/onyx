import { describe, expect, it } from "vite-plus/test";
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
