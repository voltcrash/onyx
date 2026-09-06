import { describe, expect, it } from "vite-plus/test";

import { renderMarkdown, resolveLocalAttachmentUrl } from "./markdown.js";

describe("renderMarkdown", () => {
  it("renders CommonMark structure and GFM extensions", () => {
    const html = renderMarkdown(`# Heading

1. First
   1. Nested
2. Second

- [x] Finished
- [ ] Pending

> Quoted **text**

\`\`\`ts
const answer = 42;
\`\`\`

| Name | State |
| --- | ---: |
| Onyx | Ready |

[Website](https://example.com) and ![Diagram](attachments/diagram.png)`);

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<ol>");
    expect(html.match(/<ol>/g)).toHaveLength(2);
    expect(html).toContain('<ul class="contains-task-list">');
    expect(html).toContain(
      '<li class="task-list-item"><input type="checkbox" checked disabled> Finished</li>',
    );
    expect(html).toContain("<blockquote>");
    expect(html).toContain('<code class="language-ts">const answer = 42;');
    expect(html).toContain("<table>");
    expect(html).toContain('<th align="right">State</th>');
    expect(html).toContain('<a href="https://example.com">Website</a>');
    expect(html).toContain('<img src="attachments/diagram.png" alt="Diagram">');
  });

  it("removes unsafe HTML and URL protocols", () => {
    const html = renderMarkdown(`<script>alert('xss')</script>

<img src=x onerror="alert('xss')">

[unsafe](javascript:alert('xss'))

![unsafe](javascript:alert('xss'))`);

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  it("replaces local image and file destinations with resolved attachment URLs", () => {
    const resolve = (destination: string) =>
      resolveLocalAttachmentUrl(destination, "notes/trips/day-one.md", [
        {
          name: "lake view.png",
          sourcePath: "notes/trips/media/lake view.png",
          url: "blob:image-url",
        },
        {
          name: "guide.pdf",
          sourcePath: "notes/files/guide.pdf",
          url: "blob:file-url",
        },
      ]);

    const html = renderMarkdown(
      "![Lake](media/lake%20view.png) [Guide](../files/guide.pdf#page=2)",
      resolve,
    );

    expect(html).toContain('<img src="blob:image-url" alt="Lake">');
    expect(html).toContain('<a href="blob:file-url#page=2">Guide</a>');
  });

  it("leaves remote, absolute, and unmatched destinations unchanged", () => {
    const attachments = [{ name: "photo.png", url: "blob:photo-url" }];
    const resolve = (destination: string) =>
      resolveLocalAttachmentUrl(destination, undefined, attachments);

    const html = renderMarkdown(
      "![Local](photo.png) ![Remote](https://example.com/photo.png) [Root](/photo.png) [Missing](missing.pdf)",
      resolve,
    );

    expect(html).toContain('<img src="blob:photo-url" alt="Local">');
    expect(html).toContain('<img src="https://example.com/photo.png" alt="Remote">');
    expect(html).toContain('<a href="/photo.png">Root</a>');
    expect(html).toContain('<a href="missing.pdf">Missing</a>');
  });
});
