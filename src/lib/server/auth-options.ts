import { betterAuth, type BetterAuthOptions } from "better-auth";

const SESSION_LENGTH_SECONDS = 7 * 24 * 60 * 60;

export function createAuth(
  secret: string,
  clientId: string,
  clientSecret: string,
  baseURL?: string,
) {
  const options = {
    baseURL,
    secret,
    socialProviders: {
      github: {
        clientId,
        clientSecret,
        disableDefaultScope: true,
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
    advanced: { cookiePrefix: "onyx-app" },
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}
