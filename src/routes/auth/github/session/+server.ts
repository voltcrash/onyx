import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  clearCredentialsCookie,
  getCredentialsCookie,
  refreshCredentials,
  setCredentialsCookie,
} from "$lib/server/github-auth.js";

const RESPONSE_HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache" };

export const GET: RequestHandler = async ({ cookies, url }) => {
  const secure = url.protocol === "https:";
  const forceRefresh = url.searchParams.get("refresh") === "1";
  let credentials = await getCredentialsCookie(cookies);
  if (!credentials) {
    clearCredentialsCookie(cookies, secure);
    return json({ authenticated: false }, { status: 401, headers: RESPONSE_HEADERS });
  }

  if (
    forceRefresh ||
    (credentials.accessExpiresAt && credentials.accessExpiresAt <= Date.now() + 60_000)
  ) {
    if (
      !credentials.refreshToken ||
      (credentials.refreshExpiresAt && credentials.refreshExpiresAt <= Date.now())
    ) {
      clearCredentialsCookie(cookies, secure);
      return json({ authenticated: false }, { status: 401, headers: RESPONSE_HEADERS });
    }
    try {
      const refreshed = await refreshCredentials(credentials.refreshToken);
      credentials = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? credentials.refreshToken,
        refreshExpiresAt: refreshed.refreshExpiresAt ?? credentials.refreshExpiresAt,
      };
      await setCredentialsCookie(cookies, credentials, secure);
    } catch {
      clearCredentialsCookie(cookies, secure);
      return json({ authenticated: false }, { status: 401, headers: RESPONSE_HEADERS });
    }
  }

  return json(
    {
      authenticated: true,
      accessToken: credentials.accessToken,
      expiresAt: credentials.accessExpiresAt,
    },
    { headers: RESPONSE_HEADERS },
  );
};

export const DELETE: RequestHandler = ({ cookies, url }) => {
  clearCredentialsCookie(cookies, url.protocol === "https:");
  return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
};
