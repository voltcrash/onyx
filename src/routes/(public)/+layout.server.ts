import { VERCEL_ENV } from "$app/env/private";

export function load() {
  return { preventIndexing: Boolean(VERCEL_ENV && VERCEL_ENV !== "production") };
}
