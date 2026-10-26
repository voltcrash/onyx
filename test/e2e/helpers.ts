import { expect, type Locator, type Page } from "@playwright/test";

interface EditorElement extends HTMLElement {
  markdownEditor?: { value: string };
}

/** The full text of the Markdown editor, which only renders the lines in view. */
export function markdownOf(editor: Locator): Promise<string> {
  return editor.evaluate((element) => (element as EditorElement).markdownEditor?.value ?? "");
}

export async function expectMarkdown(
  editor: Locator,
  expected: string | RegExp,
  options: { timeout?: number } = {},
): Promise<void> {
  const value = expect.poll(() => markdownOf(editor), options);
  if (typeof expected === "string") await value.toBe(expected);
  else await value.toMatch(expected);
}

export async function blockNextVaultWrite(page: Page): Promise<void> {
  await page.evaluate(() => {
    const prototype = FileSystemFileHandle.prototype;
    const createWritable = Reflect.get(
      prototype,
      "createWritable",
    ) as FileSystemFileHandle["createWritable"];
    const state = window as typeof window & {
      onyxReleaseWrite?: () => void;
      onyxWriteBlocked?: boolean;
    };
    prototype.createWritable = async function (...parameters) {
      const writable = await createWritable.apply(this, parameters);
      const write = writable.write.bind(writable);
      Object.defineProperty(writable, "write", {
        value: async (data: FileSystemWriteChunkType) => {
          state.onyxWriteBlocked = true;
          await new Promise<void>((resolve) => {
            state.onyxReleaseWrite = resolve;
          });
          return write(data);
        },
      });
      prototype.createWritable = createWritable;
      return writable;
    };
  });
}

export async function waitForBlockedVaultWrite(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Boolean((window as typeof window & { onyxWriteBlocked?: boolean }).onyxWriteBlocked),
  );
}

export async function releaseVaultWrite(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as typeof window & { onyxReleaseWrite?: () => void }).onyxReleaseWrite?.(),
  );
}
