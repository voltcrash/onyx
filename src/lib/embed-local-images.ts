import { findLocalAttachment } from "./markdown-utils.js";
import type { Vault } from "./storage/index.js";

export async function embedLocalImages(
  html: string,
  vault: Vault,
  noteId: string,
  sourcePath?: string,
): Promise<string> {
  // Template contents stay inert, including remote image references.
  const template = document.createElement("template");
  template.innerHTML = html;
  const images = template.content.querySelectorAll<HTMLImageElement>("img[src]");
  if (!images.length) return html;
  const attachments = (await vault.listAttachments()).filter(
    (asset) =>
      asset.type.startsWith("image/") &&
      (asset.sourcePath !== undefined || asset.noteId === noteId),
  );
  const encoded = new Map<string, string>();
  for (const image of images) {
    const src = image.getAttribute("src")!;
    const asset = findLocalAttachment(src, sourcePath, attachments);
    if (!asset) continue;
    let url = encoded.get(asset.id);
    if (!url) {
      const attachment = await vault.getAttachment(asset.id);
      if (!attachment) continue;
      url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(attachment.file.slice(0, attachment.file.size, asset.type));
      });
      encoded.set(asset.id, url);
    }
    image.setAttribute("src", url + (src.match(/#.*$/)?.[0] ?? ""));
  }
  return template.innerHTML;
}
