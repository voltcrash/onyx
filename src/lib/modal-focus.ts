const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function manageModalFocus(node: HTMLElement): { destroy: () => void } {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

  function focusableElements(): HTMLElement[] {
    return [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
    );
  }

  function trapFocus(event: KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const elements = focusableElements();
    if (elements.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }
    const first = elements[0];
    const last = elements.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  node.addEventListener("keydown", trapFocus);
  queueMicrotask(() => {
    const preferred = node.querySelector<HTMLElement>("[autofocus]");
    (preferred ?? focusableElements()[0] ?? node).focus();
  });

  return {
    destroy: () => {
      node.removeEventListener("keydown", trapFocus);
      if (previouslyFocused?.isConnected) queueMicrotask(() => previouslyFocused.focus());
    },
  };
}
