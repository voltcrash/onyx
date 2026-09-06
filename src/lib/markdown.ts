import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const markdownSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      ["checked", true],
      ["disabled", true],
    ],
    li: [...(defaultSchema.attributes?.li ?? []), ["className", "task-list-item"]],
    ul: [...(defaultSchema.attributes?.ul ?? []), ["className", "contains-task-list"]],
  },
};

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, markdownSchema)
  .use(rehypeStringify);

export function renderMarkdown(source: string): string {
  return String(markdownProcessor.processSync(source));
}
