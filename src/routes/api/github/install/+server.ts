import { GITHUB_APP_SLUG } from "$app/env/private";
import { error, redirect } from "@sveltejs/kit";

export function GET(): never {
  const slug = GITHUB_APP_SLUG?.trim();
  if (!slug || !/^[a-z0-9-]+$/.test(slug))
    error(503, "The Onyx GitHub App installation link is not configured.");
  redirect(303, `https://github.com/apps/${slug}/installations/new`, {
    external: ["https://github.com"],
  });
}
