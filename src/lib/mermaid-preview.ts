import type { Mounted } from "pele";

/** Adds responsive layout, font measurement, and zoom to the worker's static SVGs. */
export function enhanceMermaidPreview(root: HTMLElement): () => void {
  const mounted = new Map<HTMLElement, Mounted>();
  let pele: typeof import("pele") | undefined;
  let loading: Promise<void> | undefined;
  let disposed = false;

  function update(): void {
    if (disposed) return;
    for (const [element, diagram] of mounted) {
      if (!root.contains(element)) {
        diagram.destroy();
        mounted.delete(element);
      }
    }
    const elements = root.querySelectorAll<HTMLElement>(".diagram-mermaid[data-mermaid-source]");
    if (!elements.length) return;
    if (!pele) {
      loading ??= import("pele")
        .then((module) => {
          pele = module;
          update();
        })
        .catch(() => undefined);
      return;
    }
    for (const element of elements) {
      if (mounted.has(element)) continue;
      mounted.set(
        element,
        pele.mount(element, decodeURIComponent(element.dataset.mermaidSource ?? ""), {
          images: false,
          linkRel: "noopener noreferrer",
        }),
      );
    }
  }

  const observer = new MutationObserver(update);
  observer.observe(root, { childList: true, subtree: true });
  const fonts = new MutationObserver(() => {
    for (const diagram of mounted.values()) diagram.refresh();
  });
  fonts.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  update();
  return () => {
    disposed = true;
    observer.disconnect();
    fonts.disconnect();
    for (const diagram of mounted.values()) diagram.destroy();
    mounted.clear();
  };
}
