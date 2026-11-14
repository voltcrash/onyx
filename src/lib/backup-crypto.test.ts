import { describe, expect, it } from "vite-plus/test";
import {
  createBackupKey,
  encryptBackupFile,
  decryptBackupFile,
  forgetBackupKeys,
  unlockBackupKey,
} from "./backup-crypto.ts";

describe("encrypted backups", () => {
  it("round-trips binary bytes with random salts and IVs", async () => {
    const first = await createBackupKey("a sufficiently long test passphrase");
    const second = await createBackupKey("a sufficiently long test passphrase");
    expect(first.encryption.salt).not.toBe(second.encryption.salt);
    expect(first.key.extractable).toBe(false);
    const bytes = new Blob([new Uint8Array([0, 255, 128, 1])]);
    const a = await encryptBackupFile(bytes, first.key, "notes/a.md");
    const b = await encryptBackupFile(bytes, first.key, "notes/a.md");
    expect([...new Uint8Array(await a.arrayBuffer())].join(",")).not.toBe(
      [...new Uint8Array(await b.arrayBuffer())].join(","),
    );
    forgetBackupKeys();
    const unlocked = await unlockBackupKey(first.encryption, "a sufficiently long test passphrase");
    expect(await (await decryptBackupFile(a, unlocked, "notes/a.md")).arrayBuffer()).toEqual(
      await bytes.arrayBuffer(),
    );
  });
  it("rejects wrong passphrases, damaged bytes, and swapped paths", async () => {
    const session = await createBackupKey("correct passphrase");
    const bytes = await encryptBackupFile(new Blob(["private text"]), session.key, "notes/a.md");
    await expect(unlockBackupKey(session.encryption, "wrong")).rejects.toThrow("passphrase");
    await expect(decryptBackupFile(bytes, session.key, "notes/b.md")).rejects.toThrow("damaged");
    await expect(
      decryptBackupFile(new Blob(["broken"]), session.key, "notes/a.md"),
    ).rejects.toThrow("damaged");
    forgetBackupKeys();
    await expect(unlockBackupKey(session.encryption)).rejects.toThrow("encrypted");
  });
});
