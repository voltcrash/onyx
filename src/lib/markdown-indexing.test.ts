import { expect, it, vi } from "vite-plus/test";
import * as source from "./markdown-source.js";
import { extractTags } from "./tags.js";
import { linksToNote } from "./wikilinks.js";

it("avoids parsing notes without candidate tags or note links", () => {
  const parse = vi.spyOn(source, "parseMarkdownSource");
  try {
    const target = { id: "target", title: "Target", sourcePath: "Target.md" };
    const markdown = "# Tasks\n\n- [ ] Finish this\n- [x] Done\n".repeat(100);
    expect(extractTags(markdown)).toEqual([]);
    expect(linksToNote(markdown, "Tasks.md", target, [target])).toBe(false);
    expect(parse).not.toHaveBeenCalled();
  } finally {
    parse.mockRestore();
  }
});
