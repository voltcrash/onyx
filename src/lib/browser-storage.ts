export interface BrowserStorageSupport {
  indexedDb: boolean;
  localStorage: boolean;
  opfs: boolean;
  persistentStorage: boolean;
}

const STORAGE_PROBE_KEY_PREFIX = "onyx:storage-probe";

export function detectBrowserStorageSupport(): BrowserStorageSupport {
  return {
    indexedDb: indexedDbAvailable(),
    localStorage: canUseLocalStorage(),
    opfs: storageMethodAvailable("getDirectory"),
    persistentStorage: storageMethodAvailable("persist") && storageMethodAvailable("persisted"),
  };
}

export function browserStorageWarnings(support: BrowserStorageSupport): string[] {
  const warnings: string[] = [];
  if (!support.localStorage) {
    warnings.push(
      "Browser settings cannot be saved, so appearance and editor preferences will reset after this tab closes.",
    );
  }
  if (!support.persistentStorage) {
    warnings.push(
      "Persistent storage is unavailable, so the browser may remove locally saved notes when space is low.",
    );
  }
  return warnings;
}

export function readLocalStorage(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalStorage(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value);
    return typeof globalThis.localStorage !== "undefined";
  } catch {
    return false;
  }
}

function canUseLocalStorage(): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const key = `${STORAGE_PROBE_KEY_PREFIX}:${globalThis.crypto?.randomUUID?.() ?? Math.random()}`;
    storage.setItem(key, key);
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function indexedDbAvailable(): boolean {
  try {
    return typeof globalThis.indexedDB?.open === "function";
  } catch {
    return false;
  }
}

function storageMethodAvailable(method: "getDirectory" | "persist" | "persisted"): boolean {
  try {
    return typeof globalThis.navigator?.storage?.[method] === "function";
  } catch {
    return false;
  }
}
