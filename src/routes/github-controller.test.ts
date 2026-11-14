import { expect, it, vi } from "vite-plus/test";
import { createBackupKey } from "#lib/backup-crypto.ts";
import { createGithubController } from "./github-controller.svelte.ts";
import type { GithubBackupOptions } from "#lib/github.ts";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({ page: { state: {} } }));

const configuration = {
  owner: "onyx",
  repository: "vault",
  branch: "main",
  directory: "vault",
  githubAccountId: 1,
  githubAccountLogin: "onyx",
  updatedAt: "",
};

function fixture(backup: (options: GithubBackupOptions) => Promise<unknown>) {
  const host = {
    disposed: false,
    isOnline: true,
    activeNoteId: "active",
    searchQuery: "",
    loadDialogStyles: vi.fn(),
    loadGithubModule: async () => ({
      GithubBackupConflictError: class extends Error {},
      backupVaultToGithub: (
        _vault: unknown,
        _configuration: unknown,
        options: GithubBackupOptions,
      ) => backup(options),
    }),
    vault: { countPendingBackupOperations: async () => 0 },
  } as unknown as Parameters<typeof createGithubController>[0];
  const controller = createGithubController(host);
  controller.githubBackup = configuration;
  return { host, controller };
}

it("keeps merge unlock open after a wrong passphrase and resumes after verification", async () => {
  const { encryption } = await createBackupKey("secret");
  let passphrase: string | undefined;
  const { controller } = fixture(async (options) => {
    passphrase = await options.requestPassphrase!(encryption);
    return { state: configuration };
  });
  const run = controller.runBackup(configuration);
  await vi.waitFor(() => expect(controller.mergeUnlock).toBe(true));
  controller.restorePassphrase = "wrong";
  await controller.submitMergeUnlock();
  expect(controller.restoreState).toBe("error");
  expect(controller.restoreMessage).toContain("passphrase is incorrect");
  expect(passphrase).toBeUndefined();
  controller.restorePassphrase = "secret";
  await controller.submitMergeUnlock();
  await run;
  expect(passphrase).toBe("secret");
  expect(controller.restoreModalOpen).toBe(false);
  expect(controller.backupState).toBe("success");
});

it("cancels a pending merge unlock when its dialog closes", async () => {
  const { encryption } = await createBackupKey("secret");
  const { controller } = fixture(async (options) => {
    expect(await options.requestPassphrase!(encryption)).toBeUndefined();
    throw new Error("Backup unlock was cancelled");
  });
  const run = controller.runBackup(configuration);
  await vi.waitFor(() => expect(controller.mergeUnlock).toBe(true));
  controller.restoreModalOpen = false;
  await run;
  expect(controller.mergeUnlock).toBe(false);
  expect(controller.backupMessage).toContain("cancelled");
});
