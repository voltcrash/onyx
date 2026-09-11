import { readLocalStorage, writeLocalStorage } from "../browser-storage.js";
import type { VaultOptions } from "./types.js";

export interface VaultDescriptor {
  id: string;
  name: string;
  databaseName: string;
  directoryName: string;
  createdAt: string;
}

export interface VaultRegistry {
  activeId: string;
  vaults: VaultDescriptor[];
}

const REGISTRY_KEY = "onyx:vaults";
const ACTIVE_VAULT_KEY = "onyx:active-vault";
const MAX_VAULT_NAME_LENGTH = 60;

// The first vault keeps the original database and directory names so existing notes stay put.
const DEFAULT_VAULT: VaultDescriptor = {
  id: "default",
  name: "Notes",
  databaseName: "onyx-vault",
  directoryName: "onyx",
  createdAt: "1970-01-01T00:00:00.000Z",
};

export function defaultVaultDescriptor(): VaultDescriptor {
  return { ...DEFAULT_VAULT };
}

export function isDefaultVault(vault: VaultDescriptor): boolean {
  return vault.id === DEFAULT_VAULT.id;
}

export function readVaultRegistry(): VaultRegistry {
  const vaults = parseVaults(readLocalStorage(REGISTRY_KEY));
  const activeId = readLocalStorage(ACTIVE_VAULT_KEY) ?? "";
  return {
    activeId: vaults.some((vault) => vault.id === activeId) ? activeId : vaults[0].id,
    vaults,
  };
}

export function writeVaultRegistry(registry: VaultRegistry): void {
  writeLocalStorage(REGISTRY_KEY, JSON.stringify(registry.vaults));
  writeLocalStorage(ACTIVE_VAULT_KEY, registry.activeId);
}

export function createVaultDescriptor(name: string, existing: VaultDescriptor[]): VaultDescriptor {
  const id = crypto.randomUUID();
  return {
    id,
    name: uniqueVaultName(name, existing),
    databaseName: `onyx-vault-${id}`,
    directoryName: `onyx-${id}`,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeVaultName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_VAULT_NAME_LENGTH);
}

export function uniqueVaultName(name: string, existing: VaultDescriptor[]): string {
  const base = normalizeVaultName(name) || "Notes";
  const taken = new Set(existing.map((vault) => vault.name.toLocaleLowerCase()));
  if (!taken.has(base.toLocaleLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

// Each vault backs up to its own repository, so the name is seeded from the vault name.
// The untouched first vault keeps the name Onyx suggested before vaults could be renamed.
export function suggestedRepositoryName(vault: VaultDescriptor | undefined): string {
  if (!vault || (isDefaultVault(vault) && vault.name === DEFAULT_VAULT.name)) return "onyx-vault";
  const slug = vault.name
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug ? `onyx-${slug}` : "onyx-vault";
}

export function vaultOptions(vault: VaultDescriptor): VaultOptions {
  return { databaseName: vault.databaseName, directoryName: vault.directoryName };
}

function parseVaults(value: string | undefined): [VaultDescriptor, ...VaultDescriptor[]] {
  if (!value) return [defaultVaultDescriptor()];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [defaultVaultDescriptor()];
    const vaults = parsed.filter(isVaultDescriptor);
    return vaults.length > 0
      ? (vaults as [VaultDescriptor, ...VaultDescriptor[]])
      : [defaultVaultDescriptor()];
  } catch {
    return [defaultVaultDescriptor()];
  }
}

function isVaultDescriptor(value: unknown): value is VaultDescriptor {
  if (!value || typeof value !== "object") return false;
  const vault = value as Partial<VaultDescriptor>;
  return (
    typeof vault.id === "string" &&
    typeof vault.name === "string" &&
    typeof vault.databaseName === "string" &&
    typeof vault.directoryName === "string" &&
    typeof vault.createdAt === "string" &&
    vault.id.length > 0 &&
    vault.databaseName.length > 0 &&
    vault.directoryName.length > 0
  );
}
