// Developer-only GitHub conformance harness (no network in unit tests).
//
// Compares Onyx rendering against GitHub's official `/markdown` REST endpoint.
// It never runs during production rendering; the live check only runs when
// explicitly invoked:
//
//   GITHUB_MARKDOWN_COMPARE=1 \
//   GITHUB_MARKDOWN_TEXT='$(cat path/to/fixture.md)' \
//   GITHUB_TOKEN=ghp_optional \
//   vp test run src/lib/github-compare.test.ts
//
// `GITHUB_TOKEN` is optional where the API permits unauthenticated calls.
// Never commit credentials; pass tokens only through the environment.
// Byte-exact equality is not expected (GitHub adds its own classes and
// post-processing), so comparison is structural after normalization.

const KEPT_ATTRIBUTES = new Set(["align", "checked", "disabled", "href", "src", "start", "type"]);

// Strips volatile attributes (classes, ids, data hooks) while keeping the
// attributes that carry link, media, list, and table semantics.
export function normalizeMarkdownHtml(html: string): string {
  return html
    .replace(/<(\/?)([a-z][a-z\d]*)\b([^>]*?)(\/?)>/gi, (_, closing, name, attrs, selfClose) => {
      const kept: string[] = [];
      for (const match of String(attrs).matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g)) {
        const attrName = match[1]!.toLowerCase();
        if (KEPT_ATTRIBUTES.has(attrName)) {
          kept.push(match[2] === undefined ? attrName : `${attrName}="${match[2]}"`);
        }
      }
      return `<${closing}${name}${kept.length > 0 ? ` ${kept.join(" ")}` : ""}${selfClose}>`;
    })
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MarkdownComparison {
  equal: boolean;
  onyx: string;
  github: string;
  /** Character offset of the first difference, or -1 when equal. */
  firstDifference: number;
}

export function compareMarkdownHtml(onyxHtml: string, githubHtml: string): MarkdownComparison {
  const onyx = normalizeMarkdownHtml(onyxHtml);
  const github = normalizeMarkdownHtml(githubHtml);
  let firstDifference = -1;
  const length = Math.min(onyx.length, github.length);
  for (let index = 0; index < length; index += 1) {
    if (onyx[index] !== github[index]) {
      firstDifference = index;
      break;
    }
  }
  if (firstDifference === -1 && onyx.length !== github.length) firstDifference = length;
  return { equal: onyx === github, onyx, github, firstDifference };
}

// The surrounding context of the first difference for a readable report.
export function comparisonExcerpt(comparison: MarkdownComparison, radius = 120): string {
  if (comparison.equal) return "Outputs match after normalization.";
  const start = Math.max(0, comparison.firstDifference - radius);
  const onyxExcerpt = comparison.onyx.slice(start, comparison.firstDifference + radius);
  const githubExcerpt = comparison.github.slice(start, comparison.firstDifference + radius);
  return `First difference at offset ${comparison.firstDifference}.\nOnyx:   …${onyxExcerpt}…\nGitHub: …${githubExcerpt}…`;
}
