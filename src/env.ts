import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  VERCEL_ENV: { static: true, schema: (value) => value },
  BETTER_AUTH_SECRET: { schema: (value) => value },
  GITHUB_CLIENT_ID: { schema: (value) => value },
  GITHUB_CLIENT_SECRET: { schema: (value) => value },
});
