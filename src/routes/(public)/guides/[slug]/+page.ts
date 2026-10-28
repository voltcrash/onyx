import { error } from "@sveltejs/kit";
import { guides } from "#lib/site.ts";

export const entries = () => guides.map(({ slug }) => ({ slug }));
export function load({ params }: { params: { slug: string } }) {
  const guide = guides.find(({ slug }) => slug === params.slug);
  if (!guide) error(404, "Guide not found");
  return { guide };
}
