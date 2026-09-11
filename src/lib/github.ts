import type {
  GithubBackupState,
  Vault,
  VaultBackupManifest,
  VaultRestoreFile,
  VaultOperationContext,
} from "./storage/index.js";
import { authClient } from "./auth-client.js";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 30_000;
const GITHUB_FILE_CONCURRENCY = 4;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

let accessToken: string | undefined;
let authenticatedUser: GithubUser | undefined;
let sessionRefreshPromise: Promise<boolean> | undefined;

export interface GithubUser {
  avatarUrl: string;
  id: number;
  login: string;
  name: string | null;
}

interface GithubUserResponse {
  avatar_url: string;
  id: number;
  login: string;
  name: string | null;
}

interface GithubRepositoryResponse {
  archived?: boolean;
  default_branch: string;
  disabled?: boolean;
  name: string;
  owner: { login: string };
  permissions?: { push?: boolean };
  private: boolean;
}

interface GithubReferenceResponse {
  object: { sha: string };
}

interface GithubCommitResponse {
  author?: { date: string; name: string };
  committer?: { date: string; name: string };
  html_url: string;
  message?: string;
  sha: string;
  tree: { sha: string };
}

interface GithubCommitListResponse {
  author: { login: string } | null;
  commit: {
    author: { date: string; name: string } | null;
    committer: { date: string; name: string } | null;
    message: string;
  };
  html_url: string;
  sha: string;
}

interface GithubTreeResponse {
  sha: string;
  tree: Array<{ path: string; sha: string; size?: number; type: string }>;
  truncated?: boolean;
}

interface GithubBlobResponse {
  content?: string;
  encoding?: string;
  sha: string;
  size?: number;
}

interface GithubRequestResult<T> {
  data: T;
  response: Response;
}

export interface GithubRepository {
  branch: string;
  name: string;
  owner: string;
  private: boolean;
}

export interface GithubBackupResult {
  commitUrl?: string;
  fileCount: number;
  state: GithubBackupState;
}

export interface GithubBackupCommit {
  author: string;
  committedAt: string;
  message: string;
  sha: string;
  url: string;
}

export interface GithubRestoreResult {
  attachmentCount: number;
  noteCount: number;
  state: GithubBackupState;
}

export class GithubRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAt?: Date,
  ) {
    super(message);
    this.name = "GithubRequestError";
  }
}

export async function restoreGithubSession(): Promise<GithubUser | undefined> {
  const token = await requestGithubSession();
  if (!token) {
    clearGithubAuthentication();
    return undefined;
  }
  accessToken = token;
  try {
    const user = await githubRequest<GithubUserResponse>("/user");
    authenticatedUser = {
      avatarUrl: user.avatar_url,
      id: user.id,
      login: user.login,
      name: user.name,
    };
    return authenticatedUser;
  } catch (error) {
    clearGithubAuthentication();
    throw error;
  }
}

export async function connectGithub(): Promise<void> {
  const result = await authClient.signIn.social({
    provider: "github",
    callbackURL: "/?github=connected",
    errorCallbackURL: "/?github=failed",
  });
  if (result.error) throw new Error(result.error.message || "GitHub sign-in could not be started");
}

export async function disconnectGithub(): Promise<void> {
  clearGithubAuthentication();
  const result = await authClient.signOut();
  if (result.error) throw new Error(result.error.message || "GitHub could not be disconnected");
}

export async function createPrivateGithubRepository(name: string): Promise<GithubBackupState> {
  const user = requireAuthenticatedUser();
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
      auto_init: true,
    }),
  });
  if (!repository.private) throw new Error("GitHub did not create a private repository");
  return {
    githubAccountId: user.id,
    githubAccountLogin: user.login,
    owner: repository.owner.login,
    repository: repository.name,
    branch: repository.default_branch || "main",
    directory: "vault",
    updatedAt: new Date().toISOString(),
  };
}

export async function listGithubRepositories(): Promise<GithubRepository[]> {
  const repositories = await collectGithubPages<GithubRepositoryResponse>(
    "/user/repos",
    new URLSearchParams({ per_page: "100", sort: "pushed" }),
    100,
  );
  return repositories
    .filter(
      (repository) =>
        repository.private &&
        repository.permissions?.push === true &&
        !repository.archived &&
        !repository.disabled,
    )
    .map((repository) => ({
      branch: repository.default_branch || "main",
      name: repository.name,
      owner: repository.owner.login,
      private: repository.private,
    }));
}

export function backupVaultToGithub(
  vault: Vault,
  backupState: GithubBackupState,
): Promise<GithubBackupResult> {
  const runExclusive = (
    vault as unknown as {
      runExclusive?: (
        task: (context: VaultOperationContext) => Promise<GithubBackupResult>,
      ) => Promise<GithubBackupResult>;
    }
  ).runExclusive;
  if (typeof runExclusive !== "function") {
    return backupVaultToGithubUnlocked(vault, backupState);
  }
  return runExclusive.call(vault, (context) =>
    backupVaultToGithubUnlocked(vault, backupState, context),
  );
}

async function backupVaultToGithubUnlocked(
  vault: Vault,
  backupState: GithubBackupState,
  context?: VaultOperationContext,
): Promise<GithubBackupResult> {
  await validateGithubBackupRepository(backupState);
  const snapshot = context
    ? await vault.createBackupSnapshot({ context })
    : await vault.createBackupSnapshot();
  const repositoryPath = repositoryApiPath(backupState);
  const branchPath = backupState.branch.split("/").map(encodeURIComponent).join("/");
  let parentSha: string | undefined;
  let baseTreeSha: string | undefined;
  let remoteBlobs = new Map<string, string>();

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
    remoteBlobs = new Map(
      remoteTree.tree
        .filter((entry) => entry.type === "blob")
        .map((entry) => [entry.path, entry.sha]),
    );
  } catch (error) {
    if (!(error instanceof GithubRequestError) || error.status !== 404) throw error;
  }

  const prefix = backupState.directory.replace(/^\/+|\/+$/g, "");
  const manifestPath = prefix ? `${prefix}/.onyx.json` : ".onyx.json";
  const pendingTree = (
    await mapWithConcurrency(snapshot.changes, GITHUB_FILE_CONCURRENCY, async (change) => {
      const path = prefix ? `${prefix}/${change.path}` : change.path;
      if (!change.contents) {
        return remoteBlobs.has(path)
          ? { path, mode: "100644" as const, type: "blob" as const, sha: null }
          : undefined;
      }
      const blob = await createGithubBlob(repositoryPath, change.contents);
      if (remoteBlobs.get(path) === blob.sha) return undefined;
      return { path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    })
  ).filter((entry) => entry !== undefined);
  const manifest = new Blob(
    [
      JSON.stringify(
        context
          ? await vault.createBackupManifest({ context })
          : await vault.createBackupManifest(),
      ),
    ],
    {
      type: "application/json",
    },
  );
  const manifestBlob = await createGithubBlob(repositoryPath, manifest);
  const tree =
    remoteBlobs.get(manifestPath) === manifestBlob.sha
      ? pendingTree
      : [
          ...pendingTree,
          {
            path: manifestPath,
            mode: "100644" as const,
            type: "blob" as const,
            sha: manifestBlob.sha,
          },
        ];

  if (tree.length === 0) {
    if (context) await vault.acknowledgeBackupOperations(snapshot.operationIds, { context });
    else await vault.acknowledgeBackupOperations(snapshot.operationIds);
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
  if (context) {
    await vault.saveGithubBackupState(state, { context });
    await vault.acknowledgeBackupOperations(snapshot.operationIds, { context });
  } else {
    await vault.saveGithubBackupState(state);
    await vault.acknowledgeBackupOperations(snapshot.operationIds);
  }
  return { commitUrl: commit.html_url, fileCount: tree.length, state };
}

export async function listGithubBackupCommits(
  backupState: GithubBackupState,
): Promise<GithubBackupCommit[]> {
  await validateGithubBackupRepository(backupState);
  const commits = await collectGithubPages<GithubCommitListResponse>(
    `${repositoryApiPath(backupState)}/commits`,
    new URLSearchParams({
      sha: backupState.branch,
      path: normalizedDirectory(backupState.directory),
      per_page: "50",
    }),
    50,
  );
  return commits.map((commit) => ({
    author: commit.author?.login ?? commit.commit.author?.name ?? "Unknown author",
    committedAt: commit.commit.committer?.date ?? commit.commit.author?.date ?? "",
    message: commit.commit.message.split("\n", 1)[0],
    sha: commit.sha,
    url: commit.html_url,
  }));
}

export async function restoreVaultFromGithub(
  vault: Vault,
  backupState: GithubBackupState,
  commitSha: string,
): Promise<GithubRestoreResult> {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error("Select a valid GitHub backup commit");
  await validateGithubBackupRepository(backupState);
  const repositoryPath = repositoryApiPath(backupState);
  const selectedCommit = await githubRequest<GithubCommitResponse>(
    `${repositoryPath}/git/commits/${commitSha}`,
  );
  const selectedTree = await getGithubTree(repositoryPath, selectedCommit.tree.sha);
  const currentReference = await githubRequest<GithubReferenceResponse>(
    `${repositoryPath}/git/ref/heads/${backupState.branch.split("/").map(encodeURIComponent).join("/")}`,
  );
  const currentCommit =
    currentReference.object.sha === selectedCommit.sha
      ? selectedCommit
      : await githubRequest<GithubCommitResponse>(
          `${repositoryPath}/git/commits/${currentReference.object.sha}`,
        );
  const currentTree =
    currentCommit.sha === selectedCommit.sha
      ? selectedTree
      : await getGithubTree(repositoryPath, currentCommit.tree.sha);
  const selectedBlobs = vaultBlobs(selectedTree, backupState.directory);
  const currentBlobs = vaultBlobs(currentTree, backupState.directory);
  const files = await mapWithConcurrency(
    [...selectedBlobs.entries()].filter(([path]) => isVaultFile(path)),
    GITHUB_FILE_CONCURRENCY,
    async ([path, sha]): Promise<VaultRestoreFile> => ({
      path,
      contents: await downloadGithubBlob(repositoryPath, sha),
    }),
  );
  if (!files.some((file) => file.path.startsWith("notes/"))) {
    throw new Error("The selected commit does not contain an Onyx vault in that directory");
  }
  const manifestSha = selectedBlobs.get(".onyx.json");
  const manifest = manifestSha
    ? await parseBackupManifest(await downloadGithubBlob(repositoryPath, manifestSha))
    : undefined;
  const changedPaths = new Set<string>();
  for (const [path, sha] of selectedBlobs) {
    if (isVaultFile(path) && currentBlobs.get(path) !== sha) changedPaths.add(path);
  }
  for (const path of currentBlobs.keys()) {
    if (isVaultFile(path) && !selectedBlobs.has(path)) changedPaths.add(path);
  }
  const restoredAt =
    selectedCommit.committer?.date ?? selectedCommit.author?.date ?? new Date().toISOString();
  const applyRestore = async (context?: VaultOperationContext): Promise<GithubRestoreResult> => {
    const result = context
      ? await vault.restoreBackup(files, {
          manifest,
          pendingPaths: [...changedPaths],
          restoredAt,
          context,
        })
      : await vault.restoreBackup(files, {
          manifest,
          pendingPaths: [...changedPaths],
          restoredAt,
        });
    const state: GithubBackupState = {
      ...backupState,
      lastCommitSha: selectedCommit.sha,
      updatedAt: new Date().toISOString(),
    };
    if (context) await vault.saveGithubBackupState(state, { context });
    else await vault.saveGithubBackupState(state);
    return { ...result, state };
  };
  const runExclusive = (
    vault as unknown as {
      runExclusive?: (
        task: (context: VaultOperationContext) => Promise<GithubRestoreResult>,
      ) => Promise<GithubRestoreResult>;
    }
  ).runExclusive;
  return typeof runExclusive === "function"
    ? runExclusive.call(vault, applyRestore)
    : applyRestore();
}

export async function githubRequest<T>(path: `/${string}`, init: RequestInit = {}): Promise<T> {
  return (await requestGithub<T>(path, init)).data;
}

async function requestGithub<T>(
  path: `/${string}`,
  init: RequestInit = {},
): Promise<GithubRequestResult<T>> {
  if (!accessToken) throw new Error("Sign in with GitHub before using backup and sync");
  const baseHeaders = new Headers(init.headers);
  baseHeaders.set("Accept", "application/vnd.github+json");
  if (init.body) baseHeaders.set("Content-Type", "application/json");
  baseHeaders.set("X-GitHub-Api-Version", API_VERSION);
  let refreshed = false;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const tokenForRequest = accessToken;
    if (!tokenForRequest) throw new Error("Sign in with GitHub before using backup and sync");
    const headers = new Headers(baseHeaders);
    headers.set("Authorization", `Bearer ${tokenForRequest}`);
    let response: Response;
    try {
      response = await fetchWithTimeout(`${API_ROOT}${path}`, { ...init, headers });
    } catch (error) {
      if (
        attempt === MAX_REQUEST_ATTEMPTS - 1 ||
        !isRetryableRequest(init.method) ||
        isAbortError(error)
      ) {
        throw error;
      }
      await retryDelay(exponentialDelay(attempt));
      continue;
    }
    if (response.ok) return { data: (await response.json()) as T, response };

    if (response.status === 401 && !refreshed && attempt < MAX_REQUEST_ATTEMPTS - 1) {
      refreshed = true;
      if (await refreshGithubAccessToken(tokenForRequest)) continue;
    }

    const result = (await response.json().catch(() => undefined)) as
      | { message?: string }
      | undefined;
    const retryAt = githubRetryAt(response);
    const rateLimited = isRateLimited(response, result?.message);
    const delay = retryAt ? Math.max(0, retryAt.getTime() - Date.now()) : exponentialDelay(attempt);
    if (
      attempt < MAX_REQUEST_ATTEMPTS - 1 &&
      isRetryableRequest(init.method) &&
      (rateLimited || RETRYABLE_STATUSES.has(response.status)) &&
      delay <= MAX_RETRY_DELAY_MS
    ) {
      await retryDelay(delay);
      continue;
    }
    const message = rateLimited
      ? retryAt
        ? `GitHub's rate limit is exhausted. Try again after ${retryAt.toLocaleTimeString()}.`
        : "GitHub is temporarily rate limiting requests. Try again shortly."
      : result?.message || `GitHub request failed (${response.status})`;
    throw new GithubRequestError(response.status, message, retryAt);
  }
  throw new Error("GitHub request failed after multiple attempts");
}

function isRetryableRequest(method = "GET"): boolean {
  return ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method.toUpperCase());
}

async function requestGithubSession(forceRefresh = false): Promise<string | undefined> {
  const session = await authClient.getSession({
    query: forceRefresh ? { disableRefresh: false } : undefined,
  });
  if (session.error) {
    if (session.error.status === 401) return undefined;
    throw new Error(session.error.message || "GitHub authentication could not be restored");
  }
  if (!session.data) return undefined;

  const token = forceRefresh
    ? await authClient.refreshToken({ useAccountCookie: true })
    : await authClient.getAccessToken({ useAccountCookie: true });
  if (token.error) {
    if (token.error.status === 401) return undefined;
    throw new Error(token.error.message || "GitHub authentication could not be restored");
  }
  return token.data?.accessToken;
}

async function refreshGithubAccessToken(rejectedToken: string): Promise<boolean> {
  if (accessToken && accessToken !== rejectedToken) return true;
  if (sessionRefreshPromise) return sessionRefreshPromise;

  sessionRefreshPromise = (async () => {
    let token: string | undefined;
    try {
      token = await requestGithubSession(true);
    } catch {
      return false;
    }
    if (!token) {
      clearGithubAuthentication();
      return false;
    }
    accessToken = token;
    return true;
  })().finally(() => {
    sessionRefreshPromise = undefined;
  });
  return sessionRefreshPromise;
}

function clearGithubAuthentication(): void {
  accessToken = undefined;
  authenticatedUser = undefined;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeExternalListener: (() => void) | undefined;
  const timeoutRequest = new Promise<Response>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new GithubRequestTimeoutError());
    }, GITHUB_REQUEST_TIMEOUT_MS);
  });
  const requests = [timeoutRequest];
  if (externalSignal) {
    const externalAbort = new Promise<Response>((_, reject) => {
      const abort = () => {
        controller.abort(externalSignal.reason);
        reject(externalSignal.reason ?? new DOMException("The request was aborted", "AbortError"));
      };
      if (externalSignal.aborted) abort();
      else {
        externalSignal.addEventListener("abort", abort, { once: true });
        removeExternalListener = () => externalSignal.removeEventListener("abort", abort);
      }
    });
    requests.push(externalAbort);
  }
  requests.push(Promise.resolve().then(() => fetch(input, { ...init, signal: controller.signal })));
  try {
    return await Promise.race(requests);
  } catch (error) {
    if (timedOut) throw new GithubRequestTimeoutError();
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    removeExternalListener?.();
  }
}

class GithubRequestTimeoutError extends Error {
  constructor() {
    super("GitHub request timed out. Try again shortly.");
    this.name = "GithubRequestTimeoutError";
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function collectGithubPages<T>(
  path: `/${string}`,
  parameters: URLSearchParams,
  pageSize: number,
): Promise<T[]> {
  const items: T[] = [];
  if (!parameters.has("page")) parameters.set("page", "1");
  let page = 1;
  let nextPath = withGithubQuery(path, parameters);
  while (true) {
    const result = await requestGithub<T[]>(nextPath);
    items.push(...result.data);
    const linkedNextPath = nextGithubPage(result.response);
    if (
      linkedNextPath === null ||
      (linkedNextPath === undefined && result.data.length < pageSize)
    ) {
      return items;
    }
    if (linkedNextPath) {
      nextPath = linkedNextPath;
      continue;
    }
    page += 1;
    parameters.set("page", String(page));
    nextPath = withGithubQuery(path, parameters);
  }
}

function withGithubQuery(path: `/${string}`, parameters: URLSearchParams): `/${string}` {
  return `${path}?${parameters}` as `/${string}`;
}

function nextGithubPage(response: Response): `/${string}` | null | undefined {
  const link = response.headers.get("Link");
  if (!link) return undefined;
  const next = link
    .split(",")
    .map((part) => part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/))
    .find((match) => match?.[2].split(" ").includes("next"));
  if (!next) return null;
  try {
    const url = new URL(next[1], API_ROOT);
    if (url.origin !== API_ROOT) return null;
    return `${url.pathname}${url.search}` as `/${string}`;
  } catch {
    return null;
  }
}

function isRateLimited(response: Response, message?: string): boolean {
  return (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("X-RateLimit-Remaining") === "0" ||
        /rate limit|secondary rate/i.test(message ?? "")))
  );
}

function githubRetryAt(response: Response): Date | undefined {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const timestamp = Number.isFinite(seconds)
      ? Date.now() + seconds * 1_000
      : Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) return new Date(timestamp);
  }
  const reset = Number(response.headers.get("X-RateLimit-Reset"));
  return Number.isFinite(reset) && reset > 0 ? new Date(reset * 1_000) : undefined;
}

function exponentialDelay(attempt: number): number {
  const base = Math.min(1_000 * 2 ** attempt, 8_000);
  return base + Math.floor(Math.random() * Math.max(1, base / 4));
}

function retryDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  map: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: values.length });
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
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

function repositoryApiPath(state: GithubBackupState): `/repos/${string}` {
  return `/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repository)}`;
}

export async function validateGithubBackupRepository(state: GithubBackupState): Promise<void> {
  const user = requireAuthenticatedUser();
  if (!Number.isSafeInteger(state.githubAccountId) || state.githubAccountId !== user.id) {
    const configuredAccount = state.githubAccountLogin
      ? `@${state.githubAccountLogin}`
      : "another GitHub account";
    throw new Error(
      `This backup configuration belongs to ${configuredAccount}. Re-select a private repository for @${user.login}.`,
    );
  }
  validateBackupConfiguration(state);
  const repository = await githubRequest<GithubRepositoryResponse>(repositoryApiPath(state));
  if (
    repository.owner.login.toLowerCase() !== state.owner.toLowerCase() ||
    repository.name.toLowerCase() !== state.repository.toLowerCase()
  ) {
    throw new Error("GitHub returned a different repository than the configured backup target");
  }
  if (!repository.private) {
    throw new Error("Onyx refuses to back up to a public GitHub repository");
  }
  if (repository.permissions?.push !== true) {
    throw new Error("The connected GitHub account does not have write access to this repository");
  }
  if (repository.archived || repository.disabled) {
    throw new Error("Choose an active GitHub repository for backups");
  }
}

function requireAuthenticatedUser(): GithubUser {
  if (!authenticatedUser) {
    throw new Error("Sign in with GitHub before configuring a backup repository");
  }
  return authenticatedUser;
}

function validateBackupConfiguration(state: GithubBackupState): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(state.owner)) {
    throw new Error("The configured GitHub repository owner is invalid");
  }
  if (
    !/^[\w.-]+$/.test(state.repository) ||
    state.repository === "." ||
    state.repository === ".."
  ) {
    throw new Error("The configured GitHub repository name is invalid");
  }
  if (
    !state.branch ||
    hasForbiddenCharacter(state.branch, 32, "~^:?*\\[") ||
    state.branch.includes("..") ||
    state.branch.includes("@{") ||
    state.branch.includes("//") ||
    state.branch.startsWith("/") ||
    state.branch.endsWith("/") ||
    state.branch.endsWith(".") ||
    state.branch === "@"
  ) {
    throw new Error("The configured GitHub branch is invalid");
  }
  const directory = normalizedDirectory(state.directory);
  if (
    directory &&
    (hasForbiddenCharacter(directory, 31, "\\") ||
      directory.split("/").some((segment) => !segment || segment === "." || segment === ".."))
  ) {
    throw new Error("The configured GitHub backup directory is invalid");
  }
}

function hasForbiddenCharacter(
  value: string,
  maximumCodePoint: number,
  forbidden: string,
): boolean {
  for (const character of value) {
    if (character.codePointAt(0)! <= maximumCodePoint || forbidden.includes(character)) return true;
  }
  return false;
}

function normalizedDirectory(directory: string): string {
  return directory.replace(/^\/+|\/+$/g, "");
}

async function createGithubBlob(
  repositoryPath: `/repos/${string}`,
  contents: Blob,
): Promise<GithubBlobResponse> {
  return githubRequest<GithubBlobResponse>(`${repositoryPath}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: await blobToBase64(contents), encoding: "base64" }),
  });
}

async function getGithubTree(
  repositoryPath: `/repos/${string}`,
  sha: string,
): Promise<GithubTreeResponse> {
  const tree = await githubRequest<GithubTreeResponse>(
    `${repositoryPath}/git/trees/${sha}?recursive=1`,
  );
  if (tree.truncated) throw new Error("The GitHub backup is too large to restore safely");
  return tree;
}

function vaultBlobs(tree: GithubTreeResponse, directory: string): Map<string, string> {
  const prefix = normalizedDirectory(directory);
  const directoryPrefix = prefix ? `${prefix}/` : "";
  return new Map(
    tree.tree.flatMap((entry) =>
      entry.type === "blob" && entry.path.startsWith(directoryPrefix)
        ? [[entry.path.slice(directoryPrefix.length), entry.sha] as const]
        : [],
    ),
  );
}

function isVaultFile(path: string): boolean {
  return /^notes\/[^/]+\.md$/.test(path) || /^attachments\/[^/]+\/[^/]+$/.test(path);
}

async function downloadGithubBlob(repositoryPath: `/repos/${string}`, sha: string): Promise<Blob> {
  const blob = await githubRequest<GithubBlobResponse>(`${repositoryPath}/git/blobs/${sha}`);
  if (blob.encoding !== "base64" || blob.content === undefined) {
    throw new Error("GitHub returned an unsupported backup file");
  }
  const binary = atob(blob.content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes]);
}

async function parseBackupManifest(blob: Blob): Promise<VaultBackupManifest> {
  const manifest = JSON.parse(await blob.text()) as Partial<VaultBackupManifest>;
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.notes) ||
    !Array.isArray(manifest.attachments)
  ) {
    throw new Error("The selected commit has an invalid Onyx backup manifest");
  }
  return manifest as VaultBackupManifest;
}
