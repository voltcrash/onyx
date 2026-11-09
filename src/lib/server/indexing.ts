import { SITE_URL, publicPaths, discoveryPaths } from "#lib/site.ts";

export function isIndexableResponse(url: URL, status: number, deploymentEnv?: string): boolean {
  return (
    deploymentEnv === "production" &&
    url.origin === SITE_URL &&
    status === 200 &&
    [...publicPaths, ...discoveryPaths].includes(url.pathname)
  );
}
