export interface BackupEncryption {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  keyCheck: string;
}
export interface BackupKey {
  key: CryptoKey;
  encryption: BackupEncryption;
}
const encoder = new TextEncoder();
const checkText = "Onyx encrypted backup v1";
const unlocked = new Map<string, CryptoKey>();

function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
function cacheId(encryption: BackupEncryption): string {
  return JSON.stringify(encryption);
}

async function derive(passphrase: string, encryption: BackupEncryption): Promise<CryptoKey> {
  if (
    encryption.version !== 1 ||
    encryption.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(encryption.iterations) ||
    encryption.iterations < 600_000 ||
    encryption.iterations > 2_000_000 ||
    fromBase64(encryption.salt).length !== 16
  )
    throw new Error("Unsupported backup encryption parameters");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64(encryption.salt),
      iterations: encryption.iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackupFile(
  contents: Blob,
  key: CryptoKey,
  path: string,
): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(path) },
    key,
    await contents.arrayBuffer(),
  );
  return new Blob([iv, ciphertext], { type: "application/octet-stream" });
}
export async function decryptBackupFile(
  contents: Blob,
  key: CryptoKey,
  path: string,
): Promise<Blob> {
  try {
    const bytes = await contents.arrayBuffer();
    if (bytes.byteLength < 28) throw new Error("Truncated ciphertext");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: encoder.encode(path) },
      key,
      bytes.slice(12),
    );
    return new Blob([plain]);
  } catch {
    throw new Error("The backup passphrase is incorrect or the encrypted file is damaged.");
  }
}
export async function createBackupKey(passphrase: string): Promise<BackupKey> {
  if (!passphrase.trim()) throw new Error("Enter a backup passphrase");
  const encryption: BackupEncryption = {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600_000,
    salt: base64(crypto.getRandomValues(new Uint8Array(16))),
    keyCheck: "",
  };
  const key = await derive(passphrase, encryption);
  encryption.keyCheck = base64(
    new Uint8Array(
      await (await encryptBackupFile(new Blob([checkText]), key, "onyx-key-check")).arrayBuffer(),
    ),
  );
  unlocked.set(cacheId(encryption), key);
  return { key, encryption };
}
export async function unlockBackupKey(
  encryption: BackupEncryption,
  passphrase?: string,
): Promise<CryptoKey> {
  if (!passphrase) {
    const cached = unlocked.get(cacheId(encryption));
    if (cached) return cached;
    throw new Error("This backup is encrypted. Enter its backup passphrase to unlock it.");
  }
  const key = await derive(passphrase, encryption);
  const check = await decryptBackupFile(
    new Blob([fromBase64(encryption.keyCheck)]),
    key,
    "onyx-key-check",
  );
  if ((await check.text()) !== checkText) throw new Error("The backup passphrase is incorrect.");
  unlocked.set(cacheId(encryption), key);
  return key;
}
export function forgetBackupKeys(): void {
  unlocked.clear();
}
