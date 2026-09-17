let dialogStylesPromise: Promise<void> | undefined;

export function loadDialogStyles(): Promise<void> {
  return (dialogStylesPromise ??= import("../routes/styles/dialogs.css").then(() => undefined));
}
