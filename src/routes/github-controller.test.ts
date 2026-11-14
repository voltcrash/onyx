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
    vault: {
      countPendingBackupOperations: async () => 0,
      getGithubBackupState: async () => configuration,
    },
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

it.each([
  { active: "deleted", notes: ["remaining"], selected: "remaining" },
  { active: "deleted", notes: [], selected: undefined },
  { active: "", notes: ["remote"], selected: "remote" },
  { active: "active", notes: ["other", "active"], selected: "active" },
])(
  "refreshes the merged workspace with $active active and $notes remaining",
  async ({ active, notes, selected }) => {
    const { host, controller } = fixture(async (options) => {
      await options.onLocalMerge?.();
      return { state: configuration };
    });
    host.activeNoteId = active;
    Object.assign(host.vault!, {
      listNotes: async () => notes.map((id) => ({ id })),
      listFolders: async () => [{ id: "folder" }],
      listAttachments: async () => [{ id: "attachment" }],
    });
    host.loadNote = vi.fn();
    host.resetActiveNote = vi.fn();
    host.runSearch = vi.fn();
    await controller.runBackup(configuration, { mergeNewerBackup: true });
    if (selected) expect(host.loadNote).toHaveBeenCalledWith(selected);
    else expect(host.resetActiveNote).toHaveBeenCalledOnce();
    expect(host.runSearch).toHaveBeenCalledWith("");
    expect(host.folders).toEqual([{ id: "folder" }]);
    expect(host.vaultAttachments).toEqual([{ id: "attachment" }]);
  },
);

it("reconciles the committed merge before an upload fails", async () => {
  let committed = false;
  const { host, controller } = fixture(async (options) => {
    committed = true;
    await options.onLocalMerge?.();
    expect(host.loadNote).toHaveBeenCalledWith("active");
    throw new Error("Upload failed");
  });
  Object.assign(host.vault!, {
    listNotes: async () => (committed ? [{ id: "active" }] : []),
    listFolders: async () => [],
    listAttachments: async () => [],
  });
  host.loadNote = vi.fn(async () => {
    host.markdown = "merged";
    host.lastSavedMarkdown = "merged";
  });
  host.resetActiveNote = vi.fn();
  host.runSearch = vi.fn();
  await controller.runBackup(configuration, { mergeNewerBackup: true });
  expect(controller.backupMessage).toBe("Upload failed");
  expect(host.markdown).toBe("merged");
  expect(host.lastSavedMarkdown).toBe("merged");
  expect(host.runSearch).toHaveBeenCalledOnce();
});
