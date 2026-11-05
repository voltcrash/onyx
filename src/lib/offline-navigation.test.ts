import { describe, expect, it } from "vite-plus/test";
import { fetchNavigation } from "./offline-navigation.js";

describe("offline navigation", () => {
  it("serves a successful network response when cache storage is full", async () => {
    const response = new Response("current shell");
    const actual = await fetchNavigation(
      () => Promise.resolve(response),
      () => Promise.resolve(new Response("old shell")),
      () => Promise.reject(new Error("Quota exceeded")),
    );
    expect(actual).toBe(response);
    expect(await actual.text()).toBe("current shell");
  });

  it("uses the current cached shell only when the network fails", async () => {
    const response = new Response("offline shell");
    expect(
      await fetchNavigation(
        () => Promise.reject(new TypeError("Offline")),
        () => Promise.resolve(response),
        () => Promise.resolve(),
      ),
    ).toBe(response);
  });
});
