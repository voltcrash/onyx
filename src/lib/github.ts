import type { GithubBackupState, Vault } from "./storage/index.js";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";

let accessToken: string | undefined;

export interface GithubUser {
  avatarUrl: string;
  login: string;
  name: string | null;
}

interface SessionResponse {
  accessToken: string;
  authenticated: true;
  expiresAt?: number;
}

interface GithubUserResponse {
  avatar_url: string;
  login: string;
  name: string | null;
}

interface GithubRepositoryResponse {
  default_branch: string;
  name: string;
  owner: { login: string };
  private: boolean;
}

interface GithubReferenceResponse {
  object: { sha: string };
}

interface GithubCommitResponse {
  html_url: string;
  sha: string;
  tree: { sha: string };
}

interface GithubTreeResponse {
  sha: string;
  tree: Array<{ path: string; type: string }>;
  truncated?: boolean;
}

interface GithubBlobResponse {
  sha: string;
}

export interface GithubBackupResult {
  commitUrl?: string;
  fileCount: number;
  state: GithubBackupState;
}

export class GithubRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GithubRequestError";
  }
}

export async function restoreGithubSession(): Promise<GithubUser | undefined> {
  const response = await fetch("/auth/github/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (response.status === 401) {
    accessToken = undefined;
    return undefined;
  }
  if (!response.ok) throw new Error("GitHub authentication could not be restored");
  accessToken = ((await response.json()) as SessionResponse).accessToken;
  const user = await githubRequest<GithubUserResponse>("/user");
  return { avatarUrl: user.avatar_url, login: user.login, name: user.name };
}

export async function disconnectGithub(): Promise<void> {
  accessToken = undefined;
  const response = await fetch("/auth/github/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("GitHub could not be disconnected");
}

export async function createPrivateGithubRepository(name: string): Promise<GithubBackupState> {
  const repositoryName = name.trim();
  if (!/^[\w.-]+$/.test(repositoryName)) {
    throw new Error(
      "Use only letters, numbers, periods, hyphens, or underscores in the repository name",
    );
  }
  const repository = await githubRequest<GithubRepositoryResponse>("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repositoryName,
      description: "Private backup of an Onyx vault",
      private: true,
      auto_init: false,
    }),
  });
  if (!repository.private) throw new Error("GitHub did not create a private repository");
  return {
    owner: repository.owner.login,
    repository: repository.name,
    branch: repository.default_branch || "main",
    directory: "vault",
    updatedAt: new Date().toISOString(),
  };
}

export async function backupVaultToGithub(
  vault: Vault,
  backupState: GithubBackupState,
): Promise<GithubBackupResult> {
  const snapshot = await vault.createBackupSnapshot();
  if (snapshot.operationIds.length === 0) {
    return { fileCount: 0, state: backupState };
  }

  const repositoryPath =
    `/repos/${encodeURIComponent(backupState.owner)}/${encodeURIComponent(backupState.repository)}` as const;
  const branchPath = backupState.branch.split("/").map(encodeURIComponent).join("/");
  let parentSha: string | undefined;
  let baseTreeSha: string | undefined;
  let remotePaths = new Set<string>();

  try {
    const reference = await githubRequest<GithubReferenceResponse>(
      `${repositoryPath}/git/ref/heads/${branchPath}`,
    );
    parentSha = reference.object.sha;
    const parent = await githubRequest<GithubCommitResponse>(
      `${repositoryPath}/git/commits/${parentSha}`,
    );
    baseTreeSha = parent.tree.sha;
    const remoteTree = await githubRequest<GithubTreeResponse>(
      `${repositoryPath}/git/trees/${baseTreeSha}?recursive=1`,
    );
    if (remoteTree.truncated) throw new Error("The GitHub backup is too large to update safely");
    remotePaths = new Set(
      remoteTree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path),
    );
  } catch (error) {
    if (!(error instanceof GithubRequestError) || error.status !== 404) throw error;
  }

  const prefix = backupState.directory.replace(/^\/+|\/+$/g, "");
  const tree = (
    await Promise.all(
      snapshot.changes.map(async (change) => {
        const path = prefix ? `${prefix}/${change.path}` : change.path;
        if (!change.contents) {
          return remotePaths.has(path)
            ? { path, mode: "100644" as const, type: "blob" as const, sha: null }
            : undefined;
        }
        const blob = await githubRequest<GithubBlobResponse>(`${repositoryPath}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({
            content: await blobToBase64(change.contents),
            encoding: "base64",
          }),
        });
        return { path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
      }),
    )
  ).filter((entry) => entry !== undefined);

  if (tree.length === 0) {
    await vault.acknowledgeBackupOperations(snapshot.operationIds);
    return { fileCount: 0, state: backupState };
  }

  const createdTree = await githubRequest<GithubTreeResponse>(`${repositoryPath}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ ...(baseTreeSha ? { base_tree: baseTreeSha } : {}), tree }),
  });
  const commit = await githubRequest<GithubCommitResponse>(`${repositoryPath}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Back up Onyx vault (${tree.length} ${tree.length === 1 ? "file" : "files"})`,
      tree: createdTree.sha,
      parents: parentSha ? [parentSha] : [],
    }),
  });
  if (parentSha) {
    await githubRequest(`${repositoryPath}/git/refs/heads/${branchPath}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await githubRequest(`${repositoryPath}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${backupState.branch}`, sha: commit.sha }),
    });
  }

  const state = {
    ...backupState,
    lastCommitSha: commit.sha,
    lastBackedUpAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await vault.saveGithubBackupState(state);
  await vault.acknowledgeBackupOperations(snapshot.operationIds);
  return { commitUrl: commit.html_url, fileCount: tree.length, state };
}

export async function githubRequest<T>(path: `/${string}`, init: RequestInit = {}): Promise<T> {
  if (!accessToken) throw new Error("Connect GitHub before making an API request");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", API_VERSION);
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (!response.ok) {
    const result = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined;
    throw new GithubRequestError(
      response.status,
      result?.message || `GitHub request failed (${response.status})`,
    );
  }
  return (await response.json()) as T;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not encode a vault file"));
        return;
      }
      resolve(reader.result.split(",", 2)[1] ?? "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read a vault file"));
    reader.readAsDataURL(blob);
  });
}
