import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  DEPLOYMENT_ENV: { schema: (value) => value },
  BETTER_AUTH_URL: { schema: (value) => value },
  BETTER_AUTH_SECRET: { schema: (value) => value },
  GITHUB_APP_SLUG: { schema: (value) => value },
  GITHUB_CLIENT_ID: { schema: (value) => value },
  GITHUB_CLIENT_SECRET: { schema: (value) => value },
});
