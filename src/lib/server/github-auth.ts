import { env } from "$env/dynamic/private";
import type { Cookies } from "@sveltejs/kit";

const AUTH_COOKIE = "onyx_github_auth";
const STATE_COOKIE = "onyx_github_state";
const VERIFIER_COOKIE = "onyx_github_verifier";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

export interface GithubCredentials {
  accessToken: string;
  accessExpiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

export function getGithubConfig(): { clientId: string; clientSecret: string } {
  const clientId = env.GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim();
  const cookieSecret = env.GITHUB_AUTH_COOKIE_SECRET?.trim();
  if (!clientId || !clientSecret || !cookieSecret) {
    throw new Error("GitHub authentication is not configured");
  }
  if (cookieSecret.length < 32) {
    throw new Error("GITHUB_AUTH_COOKIE_SECRET must be at least 32 characters");
  }
  return { clientId, clientSecret };
}

export function createOauthChallenge(): { state: string; verifier: string } {
  return { state: randomUrlSafe(32), verifier: randomUrlSafe(64) };
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export function setOauthCookies(
  cookies: Cookies,
  challenge: { state: string; verifier: string },
  secure: boolean,
): void {
  const options = {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
  cookies.set(STATE_COOKIE, challenge.state, options);
  cookies.set(VERIFIER_COOKIE, challenge.verifier, options);
}

export function readOauthCookies(cookies: Cookies): { state?: string; verifier?: string } {
  return { state: cookies.get(STATE_COOKIE), verifier: cookies.get(VERIFIER_COOKIE) };
}

export function clearOauthCookies(cookies: Cookies, secure: boolean): void {
  const options = { path: "/", secure };
  cookies.delete(STATE_COOKIE, options);
  cookies.delete(VERIFIER_COOKIE, options);
}

export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<GithubCredentials> {
  const { clientId, clientSecret } = getGithubConfig();
  return requestToken({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
}

export async function refreshCredentials(refreshToken: string): Promise<GithubCredentials> {
  const { clientId, clientSecret } = getGithubConfig();
  return requestToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

export async function setCredentialsCookie(
  cookies: Cookies,
  credentials: GithubCredentials,
  secure: boolean,
): Promise<void> {
  cookies.set(AUTH_COOKIE, await encryptCredentials(credentials), {
    httpOnly: true,
    maxAge: credentials.refreshExpiresAt
      ? Math.max(0, Math.floor((credentials.refreshExpiresAt - Date.now()) / 1000))
      : undefined,
    path: "/",
    sameSite: "strict",
    secure,
  });
}

export async function getCredentialsCookie(
  cookies: Cookies,
): Promise<GithubCredentials | undefined> {
  const value = cookies.get(AUTH_COOKIE);
  if (!value) return undefined;
  try {
    return await decryptCredentials(value);
  } catch {
    return undefined;
  }
}

export function clearCredentialsCookie(cookies: Cookies, secure: boolean): void {
  cookies.delete(AUTH_COOKIE, { path: "/", secure });
}

async function requestToken(parameters: Record<string, string>): Promise<GithubCredentials> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const result = (await response.json()) as GithubTokenResponse;
  if (!response.ok || !result.access_token) {
    throw new Error(
      result.error_description || result.error || "GitHub rejected the token request",
    );
  }
  const now = Date.now();
  return {
    accessToken: result.access_token,
    accessExpiresAt: result.expires_in ? now + result.expires_in * 1000 : undefined,
    refreshToken: result.refresh_token,
    refreshExpiresAt: result.refresh_token_expires_in
      ? now + result.refresh_token_expires_in * 1000
      : undefined,
  };
}

async function encryptCredentials(credentials: GithubCredentials): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cookieKey(),
    plaintext,
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptCredentials(value: string): Promise<GithubCredentials> {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) throw new Error("Invalid authentication cookie");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(encodedIv) },
    await cookieKey(),
    fromBase64Url(encodedCiphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as GithubCredentials;
}

async function cookieKey(): Promise<CryptoKey> {
  getGithubConfig();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(env.GITHUB_AUTH_COOKIE_SECRET),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function randomUrlSafe(bytes: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function toBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
