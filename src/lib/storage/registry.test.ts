import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readVaultRegistry, UNREADABLE_REGISTRY_KEY } from "./registry.js";

const vault = {
  id: "work",
  name: "Work",
  databaseName: "onyx-vault-work",
  directoryName: "onyx-work",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("readVaultRegistry", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with the default vault when nothing is stored", () => {
    expect(readVaultRegistry().vaults.map(({ id }) => id)).toEqual(["default"]);
    expect(store.has(UNREADABLE_REGISTRY_KEY)).toBe(false);
  });

  it("reads stored vaults and the active one", () => {
    store.set("onyx:vaults", JSON.stringify([vault]));
    store.set("onyx:active-vault", "work");

    expect(readVaultRegistry()).toEqual({ activeId: "work", vaults: [vault] });
    expect(store.has(UNREADABLE_REGISTRY_KEY)).toBe(false);
  });

  it("keeps a copy of a registry it cannot parse", () => {
    store.set("onyx:vaults", "[{broken");

    expect(readVaultRegistry().vaults.map(({ id }) => id)).toEqual(["default"]);
    expect(store.get(UNREADABLE_REGISTRY_KEY)).toBe("[{broken");
  });

  it("keeps a copy when some entries are invalid", () => {
    const stored = JSON.stringify([vault, { id: "half" }]);
    store.set("onyx:vaults", stored);

    expect(readVaultRegistry().vaults).toEqual([vault]);
    expect(store.get(UNREADABLE_REGISTRY_KEY)).toBe(stored);
  });

  it("does not replace an earlier copy", () => {
    store.set(UNREADABLE_REGISTRY_KEY, "first");
    store.set("onyx:vaults", "second");

    readVaultRegistry();
    expect(store.get(UNREADABLE_REGISTRY_KEY)).toBe("first");
  });
});
