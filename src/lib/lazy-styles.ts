import { createLazyResource } from "./lazy-resource.js";
const styles = createLazyResource(() =>
  import("../routes/styles/dialogs.css").then(() => undefined),
);
export function loadDialogStyles(): Promise<void> {
  return styles.load();
}
