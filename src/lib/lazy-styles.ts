import { createLazyResource } from "./lazy-resource.js";
const styles = createLazyResource(() =>
  import("../routes/styles/dialogs.css").then(() => undefined),
);
export function loadDialogStyles(): Promise<void> {
  return styles.load();
}

const menuStyles = createLazyResource(() =>
  import("../routes/styles/menus.css").then(() => undefined),
);
export function loadMenuStyles(): Promise<void> {
  return menuStyles.load();
}
