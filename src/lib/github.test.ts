import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  backupVaultToGithub,
  createPrivateGithubRepository,
  GithubRequestError,
  githubRequest,
  listGithubBackupCommits,
  listGithubRepositories,
  restoreGithubSession,
} from "./github.js";
import type { Vault } from "./storage/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("githubRequest", () => {
  it("retries transient responses and reports long rate-limit windows", async () => {
    const reset = Math.ceil(Date.now() / 1_000) + 3_600;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ accessToken: "token", authenticated: true }))
      .mockResolvedValueOnce(
        Response.json(
          { message: "Service unavailable" },
          { status: 503, headers: { "Retry-After": "0" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { message: "API rate limit exceeded" },
          {
            status: 403,
            headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(reset) },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreGithubSession()).resolves.toMatchObject({ login: "onyx" });
    await expect(githubRequest("/rate-limit")).rejects.toMatchObject({
      status: 403,
      retryAt: new Date(reset * 1_000),
    } satisfies Partial<GithubRequestError>);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("clears partial authentication when loading the GitHub user fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ accessToken: "expired", authenticated: true }))
      .mockResolvedValueOnce(Response.json({ message: "Bad credentials" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ authenticated: false }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreGithubSession()).rejects.toMatchObject({ status: 401 });
    await expect(githubRequest("/user")).rejects.toThrow(
      "Connect GitHub before making an API request",
    );
  });

  it("rejects malformed successful session responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ authenticated: true })),
    );

    await expect(restoreGithubSession()).rejects.toThrow(
      "GitHub authentication could not be restored",
    );
  });

  it("refreshes the access token once after GitHub rejects a request", async () => {
    const authorizationHeaders: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://onyx.test",
      );
      if (url.pathname === "/auth/github/session") {
        return Response.json({
          accessToken: url.searchParams.has("refresh") ? "fresh" : "stale",
          authenticated: true,
        });
      }
      if (url.pathname === "/user") {
        return Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null });
      }
      if (url.pathname === "/resource") {
        const authorization = new Headers(init?.headers).get("Authorization") ?? "";
        authorizationHeaders.push(authorization);
        return authorization === "Bearer fresh"
          ? Response.json({ ok: true })
          : Response.json({ message: "Bad credentials" }, { status: 401 });
      }
      return Response.json({ message: "Unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreGithubSession();

    await expect(githubRequest<{ ok: boolean }>("/resource")).resolves.toEqual({ ok: true });
    expect(authorizationHeaders).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not retry non-idempotent writes after a transient response", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://onyx.test",
      );
      if (url.pathname === "/auth/github/session") {
        return Response.json({ accessToken: "token", authenticated: true });
      }
      if (url.pathname === "/user") {
        return Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null });
      }
      return Response.json({ message: "Service unavailable" }, { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreGithubSession();
    await expect(
      githubRequest("/write", { method: "POST", body: JSON.stringify({ value: true }) }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("aborts a request after the timeout without replaying a write", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://onyx.test",
      );
      if (url.pathname === "/auth/github/session") {
        return Response.json({ accessToken: "token", authenticated: true });
      }
      if (url.pathname === "/user") {
        return Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null });
      }
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The request was aborted", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await restoreGithubSession();

    vi.useFakeTimers();
    try {
      const request = githubRequest("/slow-write", { method: "POST", body: "{}" });
      const assertion = expect(request).rejects.toThrow("GitHub request timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("paginates repositories and backup commits", async () => {
    const repository = (name: string) => ({
      default_branch: "main",
      name,
      owner: { login: "onyx" },
      permissions: { push: true },
      private: true,
    });
    const commit = (index: number) => ({
      author: { login: "onyx" },
      commit: {
        author: { date: "2026-01-01T00:00:00Z", name: "Onyx" },
        committer: { date: "2026-01-01T00:00:00Z", name: "Onyx" },
        message: `Backup ${index}`,
      },
      html_url: `https://github.com/onyx/vault/commit/${index}`,
      sha: index.toString(16).padStart(40, "0"),
    });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://onyx.test",
      );
      if (url.pathname === "/auth/github/session") {
        return Response.json({ accessToken: "token", authenticated: true });
      }
      if (url.pathname === "/user") {
        return Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null });
      }
      if (url.pathname === "/user/repos") {
        return Response.json(
          url.searchParams.get("page") === "2"
            ? [repository("repo-100")]
            : Array.from({ length: 100 }, (_, index) => repository(`repo-${index}`)),
        );
      }
      if (url.pathname === "/repos/onyx/vault") return Response.json(repository("vault"));
      if (url.pathname === "/repos/onyx/vault/commits") {
        if (url.searchParams.get("page") === "2") return Response.json([commit(50)]);
        const next = new URL(url);
        next.searchParams.set("page", "2");
        return Response.json(
          Array.from({ length: 50 }, (_, index) => commit(index)),
          {
            headers: { Link: `<${next}>; rel="next"` },
          },
        );
      }
      return Response.json({ message: "Unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreGithubSession();
    await expect(listGithubRepositories()).resolves.toHaveLength(101);
    await expect(
      listGithubBackupCommits({
        branch: "main",
        directory: "vault",
        githubAccountId: 1,
        githubAccountLogin: "onyx",
        owner: "onyx",
        repository: "vault",
        updatedAt: new Date().toISOString(),
      }),
    ).resolves.toHaveLength(51);

    const requests = fetchMock.mock.calls.map(
      ([input]) =>
        new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          "https://onyx.test",
        ),
    );
    expect(
      requests
        .filter(({ pathname }) => pathname === "/user/repos")
        .map((url) => url.searchParams.get("page")),
    ).toEqual(["1", "2"]);
    expect(
      requests
        .filter(({ pathname }) => pathname.endsWith("/commits"))
        .map((url) => url.searchParams.get("page")),
    ).toEqual(["1", "2"]);
  });

  it("backs up to a newly created repository after initializing its default branch", async () => {
    const initialCommitSha = "a".repeat(40);
    const commitSha = "b".repeat(40);
    class TestFileReader {
      error: DOMException | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;

      readAsDataURL(blob: Blob): void {
        void blob.arrayBuffer().then((buffer) => {
          let binary = "";
          for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
          this.result = `data:;base64,${btoa(binary)}`;
          this.onload?.();
        }, this.onerror ?? undefined);
      }
    }
    vi.stubGlobal("FileReader", TestFileReader);
    const requests: Array<{ body?: string; method: string; path: string }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, "https://onyx.test").pathname;
      const method = init?.method ?? "GET";
      requests.push({ body: typeof init?.body === "string" ? init.body : undefined, method, path });
      if (path === "/auth/github/session") {
        return Response.json({ accessToken: "token", authenticated: true });
      }
      if (path === "/user") {
        return Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null });
      }
      if (path === "/user/repos" && method === "POST") {
        return Response.json({
          default_branch: "main",
          name: "vault",
          owner: { login: "onyx" },
          private: true,
        });
      }
      if (path === "/repos/onyx/vault" && method === "GET") {
        return Response.json({
          default_branch: "main",
          name: "vault",
          owner: { login: "onyx" },
          permissions: { push: true },
          private: true,
        });
      }
      if (path.endsWith("/git/ref/heads/main")) {
        return Response.json({ object: { sha: initialCommitSha } });
      }
      if (path.endsWith(`/git/commits/${initialCommitSha}`)) {
        return Response.json({
          html_url: "initial-commit",
          sha: initialCommitSha,
          tree: { sha: "base" },
        });
      }
      if (path.endsWith("/git/trees/base")) {
        return Response.json({ sha: "base", tree: [] });
      }
      if (path.endsWith("/git/blobs") && method === "POST") {
        return Response.json({ sha: `blob-${requests.length}` });
      }
      if (path.endsWith("/git/trees") && method === "POST") {
        return Response.json({ sha: "tree", tree: [] });
      }
      if (path.endsWith("/git/commits") && method === "POST") {
        return Response.json({ html_url: "commit", sha: commitSha, tree: { sha: "tree" } });
      }
      if (path.endsWith("/git/refs/heads/main") && method === "PATCH") {
        return Response.json({ object: { sha: commitSha } });
      }
      return Response.json({ message: `Unexpected request: ${method} ${path}` }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreGithubSession();
    const state = await createPrivateGithubRepository("vault");
    const acknowledgeBackupOperations = vi.fn();
    const saveGithubBackupState = vi.fn();
    const vault = {
      acknowledgeBackupOperations,
      createBackupManifest: vi.fn().mockResolvedValue({ version: 1, notes: [], attachments: [] }),
      createBackupSnapshot: vi.fn().mockResolvedValue({
        changes: [{ contents: new Blob(["# Edit"]), path: "notes/note.md" }],
        operationIds: ["operation"],
      }),
      saveGithubBackupState,
    } as unknown as Vault;

    await expect(backupVaultToGithub(vault, state)).resolves.toMatchObject({
      fileCount: 2,
      state: { lastCommitSha: commitSha },
    });
    expect(
      JSON.parse(requests.find((request) => request.path === "/user/repos")!.body!),
    ).toMatchObject({
      auto_init: true,
      name: "vault",
      private: true,
    });
    expect(requests).toContainEqual(
      expect.objectContaining({ method: "PATCH", path: "/repos/onyx/vault/git/refs/heads/main" }),
    );
    expect(requests).not.toContainEqual(
      expect.objectContaining({ method: "POST", path: "/repos/onyx/vault/git/refs" }),
    );
    expect(saveGithubBackupState).toHaveBeenCalledOnce();
    expect(acknowledgeBackupOperations).toHaveBeenCalledWith(["operation"]);
  });

  it("retains pending operations when the remote branch changes during backup", async () => {
    const parentSha = "a".repeat(40);
    class TestFileReader {
      error: DOMException | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;

      readAsDataURL(blob: Blob): void {
        void blob.arrayBuffer().then((buffer) => {
          let binary = "";
          for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
          this.result = `data:;base64,${btoa(binary)}`;
          this.onload?.();
        }, this.onerror ?? undefined);
      }
    }
    vi.stubGlobal("FileReader", TestFileReader);
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, "https://onyx.test").pathname;
      const method = init?.method ?? "GET";
      if (path === "/auth/github/session") {
        return Response.json({ accessToken: "token", authenticated: true });
      }
      if (path === "/user") {
        return Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null });
      }
      if (path === "/repos/onyx/vault" && method === "GET") {
        return Response.json({
          default_branch: "main",
          name: "vault",
          owner: { login: "onyx" },
          permissions: { push: true },
          private: true,
        });
      }
      if (path.endsWith("/git/ref/heads/main")) {
        return Response.json({ object: { sha: parentSha } });
      }
      if (path.endsWith(`/git/commits/${parentSha}`)) {
        return Response.json({ html_url: "commit", sha: parentSha, tree: { sha: "base" } });
      }
      if (path.endsWith("/git/trees/base")) {
        return Response.json({ sha: "base", tree: [] });
      }
      if (path.endsWith("/git/blobs") && method === "POST") {
        return Response.json({ sha: crypto.randomUUID() });
      }
      if (path.endsWith("/git/trees") && method === "POST") {
        return Response.json({ sha: "tree", tree: [] });
      }
      if (path.endsWith("/git/commits") && method === "POST") {
        return Response.json({ html_url: "commit", sha: "commit", tree: { sha: "tree" } });
      }
      if (path.endsWith("/git/refs/heads/main") && method === "PATCH") {
        return Response.json({ message: "Reference update failed" }, { status: 409 });
      }
      return Response.json({ message: `Unexpected request: ${method} ${path}` }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await restoreGithubSession();

    const acknowledgeBackupOperations = vi.fn();
    const vault = {
      acknowledgeBackupOperations,
      createBackupManifest: vi.fn().mockResolvedValue({ version: 1, notes: [], attachments: [] }),
      createBackupSnapshot: vi.fn().mockResolvedValue({
        changes: [{ contents: new Blob(["# Edit"]), path: "notes/note.md" }],
        operationIds: ["operation"],
      }),
      saveGithubBackupState: vi.fn(),
    } as unknown as Vault;
    const state = {
      branch: "main",
      directory: "vault",
      githubAccountId: 1,
      githubAccountLogin: "onyx",
      owner: "onyx",
      repository: "vault",
      updatedAt: new Date().toISOString(),
    };

    await expect(backupVaultToGithub(vault, state)).rejects.toMatchObject({ status: 409 });
    expect(acknowledgeBackupOperations).not.toHaveBeenCalled();
  });
});
