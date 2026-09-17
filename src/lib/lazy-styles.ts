let commandPaletteStylesPromise: Promise<void> | undefined;
let dialogStylesPromise: Promise<void> | undefined;

export function loadCommandPaletteStyles(): Promise<void> {
  return (commandPaletteStylesPromise ??= import("../routes/styles/command-palette.css").then(
    () => undefined,
  ));
}

export function loadDialogStyles(): Promise<void> {
  return (dialogStylesPromise ??= import("../routes/styles/dialogs.css").then(() => undefined));
}
