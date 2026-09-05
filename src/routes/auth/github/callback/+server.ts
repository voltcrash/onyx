import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  clearOauthCookies,
  exchangeAuthorizationCode,
  readOauthCookies,
  setCredentialsCookie,
} from "$lib/server/github-auth.js";

export const GET: RequestHandler = async ({ cookies, url }) => {
  const secure = url.protocol === "https:";
  if (url.searchParams.has("error")) {
    clearOauthCookies(cookies, secure);
    redirect(303, "/?github=denied");
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const { state, verifier } = readOauthCookies(cookies);
  clearOauthCookies(cookies, secure);
  if (!code || !returnedState || !state || !verifier || returnedState !== state) {
    redirect(303, "/?github=invalid");
  }

  try {
    const callbackUrl = new URL("/auth/github/callback", url.origin).toString();
    const credentials = await exchangeAuthorizationCode(code, verifier, callbackUrl);
    await setCredentialsCookie(cookies, credentials, secure);
  } catch {
    redirect(303, "/?github=failed");
  }
  redirect(303, "/?github=connected");
};
