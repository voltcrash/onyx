import { expect, it } from "vite-plus/test";
import { titleFromMarkdown } from "./markdown-utils.js";
it.each([
  ["[Docs](https://example.com/long) intro", "Docs intro"],
  ["[[Other|Alias]] start", "Alias start"],
  ["![img](a.png)", "img"],
  ["> [!NOTE] hi", "hi"],
  ["<h1>Html</h1>", "Html"],
  [String.raw`\*literal\* &#35;tag`, "*literal* #tag"],
  [String.raw`\[[Other|Alias]]`, "[[Other|Alias]]"],
])("extracts visible title text from %s", (source, title) => {
  expect(titleFromMarkdown(source)).toBe(title);
});
