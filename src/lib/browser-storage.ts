export interface BrowserStorageSupport {
  directoryPicker: boolean;
  indexedDb: boolean;
  localStorage: boolean;
  opfs: boolean;
  persistentStorage: boolean;
}

const STORAGE_PROBE_KEY_PREFIX = "onyx:storage-probe";

export function detectBrowserStorageSupport(): BrowserStorageSupport {
  return {
    directoryPicker: typeof globalThis.showDirectoryPicker === "function",
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
      "Browser settings cannot be saved, so appearance, editor, and keyboard preferences will reset after this tab closes.",
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

export interface PersistenceEnvironment {
  platform?: string;
  userAgent?: string;
  standalone?: boolean;
}

// WebKit only grants persistence to sites installed on the Home Screen, so iOS
// browsers need install guidance rather than a repeated permission request.
export function persistenceDeniedMessage(environment?: PersistenceEnvironment): string {
  const context = environment ?? currentPersistenceEnvironment();
  if (isWebKitMobile(context) && !isInstalledApp(context)) {
    return "Persistent storage needs Onyx on your Home Screen. Tap Share, then Add to Home Screen, and open Onyx from there so the browser keeps your notes.";
  }
  return "Persistent storage was not granted, so keep a backup of important notes.";
}

function currentPersistenceEnvironment(): PersistenceEnvironment {
  const navigatorLike = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  return {
    platform: navigatorLike?.platform,
    userAgent: navigatorLike?.userAgent,
    standalone: navigatorLike?.standalone,
  };
}

function isWebKitMobile(environment: PersistenceEnvironment): boolean {
  const signature = `${environment.platform ?? ""} ${environment.userAgent ?? ""}`;
  return (
    /iPhone|iPad|iPod/i.test(signature) ||
    (/Mac/i.test(signature) && (globalThis.navigator?.maxTouchPoints ?? 0) > 1)
  );
}

function isInstalledApp(environment: PersistenceEnvironment): boolean {
  if (environment.standalone) return true;
  try {
    return globalThis.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}
