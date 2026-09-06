import { describe, expect, it } from "vite-plus/test";

import { renderMarkdown } from "./markdown.js";

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
});
