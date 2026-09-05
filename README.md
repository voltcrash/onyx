# onyx

---

### concept

web-based markdown note-taking app that only stores files locally, while it uses GitHub to store your files for backup

### technologies

- _**IndexedDB**_ - noSQL database built in the browser
- _**SvelteKit**_ - full-stack framework
- **Tailwind CSS & shadcn**: ui design
- _**TypeScript**_ - language
- _**GitHub**_ - auth and backup/restore
- _**Vite+**_ with _**pnpm**_

### local vault

`Vault` is the browser-only persistence API exported from `$lib`. Markdown and attachment bytes live
in the origin private file system (OPFS); IndexedDB stores note and attachment metadata, the local
search index and UI state, GitHub backup configuration, and an ordered backup-operation queue.

```ts
import { Vault } from "$lib";

const vault = await Vault.open();
await vault.requestPersistentStorage();

const note = await vault.saveNote({
  title: "Local first",
  markdown: "# Stored in OPFS",
  tags: ["architecture"],
});

const results = await vault.search("stored", ["architecture"]);
const pending = await vault.getPendingBackupOperations();
```

After a GitHub backup succeeds, pass the uploaded operation IDs to
`acknowledgeBackupOperations`. Authentication tokens are intentionally not part of the persisted
backup state.
