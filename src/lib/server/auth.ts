import { env } from "$env/dynamic/private";
import { betterAuth, type BetterAuthOptions } from "better-auth";

const SESSION_LENGTH_SECONDS = 7 * 24 * 60 * 60;

let authInstance: ReturnType<typeof createAuth> | undefined;

export function isGithubAuthConfigured(): boolean {
  return Boolean(
    env.BETTER_AUTH_SECRET?.trim() &&
    env.GITHUB_CLIENT_ID?.trim() &&
    env.GITHUB_CLIENT_SECRET?.trim(),
  );
}

export function getAuth(): ReturnType<typeof createAuth> {
  if (authInstance) return authInstance;
  const secret = env.BETTER_AUTH_SECRET?.trim();
  const clientId = env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  if (!secret || !clientId || !clientSecret) {
    throw new Error("GitHub authentication is not configured");
  }

  authInstance = createAuth(secret, clientId, clientSecret);
  return authInstance;
}

function createAuth(secret: string, clientId: string, clientSecret: string) {
  const options = {
    secret,
    socialProviders: {
      github: {
        clientId,
        clientSecret,
        scope: ["repo"],
      },
    },
    session: {
      expiresIn: SESSION_LENGTH_SECONDS,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_LENGTH_SECONDS,
        refreshCache: true,
        strategy: "jwe",
      },
    },
    account: {
      storeAccountCookie: true,
      storeStateStrategy: "cookie",
    },
    advanced: { cookiePrefix: "onyx" },
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}
