import { afterEach, expect, it, vi } from "vite-plus/test";
import { createBackupKey, encryptBackupFile, forgetBackupKeys } from "./backup-crypto.ts";
import { backupVaultToGithub, restoreGithubSession, restoreVaultFromGithub } from "./github.ts";
import type { GithubBackupState, Vault, VaultBackupManifest } from "./storage/index.ts";

vi.mock("./auth-client.js", () => ({
  authClient: {
    getAccessToken: async () => ({ data: { accessToken: "token" }, error: null }),
    getSession: async () => ({ data: { session: {} }, error: null }),
  },
}));

afterEach(() => {
  forgetBackupKeys();
  vi.unstubAllGlobals();
});

async function encryptedFixture() {
  const remoteSha = "a".repeat(40),
    baseSha = "b".repeat(40);
  const blobs = new Map<string, Blob>();
  const manifests: VaultBackupManifest[] = [];
  for (const side of ["remote", "base"]) {
    const { key, encryption } = await createBackupKey("secret");
    const note = {
      id: side,
      path: `notes/${side}.md`,
      title: side,
      tags: [],
      revision: 1,
      size: 5,
      createdAt: "",
      updatedAt: "",
    };
    const manifest: VaultBackupManifest = {
      version: 1,
      notes: [note],
      attachments: [],
      encryption,
    };
    manifests.push(manifest);
    blobs.set(`${side}-manifest`, new Blob([JSON.stringify(manifest)]));
    blobs.set(`${side}-note`, await encryptBackupFile(new Blob([side]), key, note.path));
  }
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://onyx.test",
      ).pathname;
      requests.push(path);
      if (path === "/user") return Response.json({ id: 1, login: "onyx" });
      if (path === "/repos/onyx/vault")
        return Response.json({
          owner: { login: "onyx" },
          name: "vault",
          private: true,
          permissions: { push: true },
        });
      if (path.endsWith("/git/ref/heads/main"))
        return Response.json({ object: { sha: remoteSha } });
      for (const [side, sha] of [
        ["remote", remoteSha],
        ["base", baseSha],
      ]) {
        if (path.endsWith(`/git/commits/${sha}`))
          return Response.json({ sha, tree: { sha: side } });
        if (path.endsWith(`/git/trees/${side}`))
          return Response.json({
            tree: [
              { path: "vault/.onyx.json", sha: `${side}-manifest`, type: "blob" },
              { path: `vault/notes/${side}.md`, sha: `${side}-note`, type: "blob" },
              { path: "vault/notes/remote-only.md", sha: "plaintext", type: "blob" },
              { path: "vault/attachments/orphan/file", sha: "plaintext", type: "blob" },
            ],
          });
      }
      const blob = blobs.get(path.split("/").at(-1)!);
      if (blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return Response.json({ encoding: "base64", content: btoa(String.fromCharCode(...bytes)) });
      }
      if (path.endsWith("/git/blobs/plaintext"))
        return Response.json({ encoding: "base64", content: btoa("left behind") });
      if (init?.method === "POST")
        return Response.json({ message: "upload stopped" }, { status: 422 });
      return Response.json({ message: `Unexpected ${path}` }, { status: 422 });
    }),
  );
  vi.stubGlobal(
    "FileReader",
    class {
      result = "";
      onload?: () => void;
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => {
          this.result = `data:;base64,${btoa(String.fromCharCode(...new Uint8Array(buffer)))}`;
          this.onload?.();
        });
      }
    },
  );
  await restoreGithubSession();
  const state: GithubBackupState = {
    owner: "onyx",
    repository: "vault",
    branch: "main",
    directory: "vault",
    githubAccountId: 1,
    githubAccountLogin: "onyx",
    updatedAt: "",
    lastCommitSha: baseSha,
  };
  const restoreBackup = vi.fn();
  const vault = {
    runBackupExclusive: <T>(task: () => Promise<T>) => task(),
    getVersion: async () => 1,
    restoreBackup,
    createBackupManifest: async () => ({ version: 1, notes: [], attachments: [] }),
    createBackupSnapshot: async () => ({ changes: [], operationIds: [] }),
  } as unknown as Vault;
  return { vault, state, remoteSha, restoreBackup, requests, manifests };
}

it.each(["restore", "merge"])(
  "ignores unlisted plaintext files in an encrypted %s",
  async (mode) => {
    const { vault, state, remoteSha, restoreBackup, requests } = await encryptedFixture();
    if (mode === "restore") await restoreVaultFromGithub(vault, state, remoteSha);
    else
      await expect(backupVaultToGithub(vault, state, { mergeNewerBackup: true })).rejects.toThrow(
        "upload stopped",
      );
    expect(restoreBackup).toHaveBeenCalledOnce();
    const files = restoreBackup.mock.calls[0][0];
    expect(files.map((file: { path: string }) => file.path)).toEqual(["notes/remote.md"]);
    expect(await files[0].contents.text()).toBe("remote");
    expect(requests.some((path) => path.endsWith("/git/blobs/plaintext"))).toBe(false);
  },
);
