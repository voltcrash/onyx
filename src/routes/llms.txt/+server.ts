import { SITE_URL, SITE_DESCRIPTION, REPOSITORY_URL, guides } from "#lib/site.ts";

export const prerender = true;
export function GET() {
  return new Response(
    `# Onyx\n\n> ${SITE_DESCRIPTION}\n\nOnyx is a local-first Markdown notes application for individual vaults, not an enterprise AI search product. No account is required for local editing. Notes stay in browser storage unless the user exports them or enables GitHub backup. Browser storage can be cleared or evicted. GitHub restore replaces the local vault; it does not automatically merge concurrent edits. Onyx does not claim end-to-end encryption.\n\n## Product\n\n- [About Onyx](${SITE_URL}/about): Features, intended uses and limitations.\n- [Editor](${SITE_URL}/): Browser application; requires JavaScript, IndexedDB and OPFS.\n- [Source code](${REPOSITORY_URL}): Implementation and deployment documentation.\n\n## Guides\n\n${guides.map((guide) => `- [${guide.title}](${SITE_URL}/guides/${guide.slug}): ${guide.description}`).join("\n")}\n`,
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
