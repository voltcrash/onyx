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

export async function githubRequest<T>(path: `/${string}`, init: RequestInit = {}): Promise<T> {
  if (!accessToken) throw new Error("Connect GitHub before making an API request");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("X-GitHub-Api-Version", API_VERSION);
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return (await response.json()) as T;
}
