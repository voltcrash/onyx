import { VERCEL_ENV } from "$app/env/private";
import { publicPaths, discoveryPaths } from "#lib/site.ts";
import { building } from "$app/env";
import { getAuth, isGithubAuthConfigured } from "#lib/server/auth.ts";
import { svelteKitHandler } from "better-auth/svelte-kit";
import type { Handle } from "@sveltejs/kit/hooks";

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
} as const;

export const handle: Handle = async ({ event, resolve }) => {
  const response = event.url.pathname.startsWith("/api/auth")
    ? isGithubAuthConfigured()
      ? await svelteKitHandler({ auth: getAuth(), building, event, resolve })
      : new Response(JSON.stringify({ message: "GitHub authentication is not configured" }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        })
    : await resolve(event);
  const headers = new Headers(response.headers);
  const indexable =
    response.status === 200 &&
    [...publicPaths, ...discoveryPaths].includes(event.url.pathname) &&
    (!VERCEL_ENV || VERCEL_ENV === "production");
  headers.set(
    "X-Robots-Tag",
    indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow",
  );

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (event.url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
