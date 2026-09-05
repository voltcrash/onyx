import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createCodeChallenge,
  createOauthChallenge,
  getGithubConfig,
  setOauthCookies,
} from "$lib/server/github-auth.js";

export const GET: RequestHandler = async ({ cookies, url }) => {
  const secure = url.protocol === "https:";
  let clientId: string;
  try {
    ({ clientId } = getGithubConfig());
  } catch {
    redirect(303, "/?github=configuration");
  }

  const challenge = createOauthChallenge();
  setOauthCookies(cookies, challenge, secure);
  const callbackUrl = new URL("/auth/github/callback", url.origin).toString();
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    code_challenge: await createCodeChallenge(challenge.verifier),
    code_challenge_method: "S256",
    redirect_uri: callbackUrl,
    state: challenge.state,
  }).toString();
  redirect(302, authorizationUrl.toString());
};
