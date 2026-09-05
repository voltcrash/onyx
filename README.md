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
- deployed on Vercel

### interface

The workspace includes source, inline live preview, split, and read-only preview modes alongside the
note list. Live preview renders inactive lines in place and reveals Markdown syntax on the line being
edited. The workspace collapses to a single pane with a slide-over note list on narrow screens. Themes are light, dark, or matched to
the operating system; the choice is stored per browser and applied before first paint.

`⌘ K` opens the command palette, which jumps to any note by title and runs every action in the app
(new note, save, view modes, theme, GitHub backup and restore, import and export, settings).

| Shortcut       | Action                   |
| -------------- | ------------------------ |
| `⌘ K`          | Command palette          |
| `⌘ ⇧ F` or `/` | Search all notes         |
| `⌘ ⏎`          | New note                 |
| `⌘ S`          | Save note                |
| `⌘ B` / `⌘ I`  | Bold / italic selection  |
| `⌘ ⇧ P`        | Toggle preview           |
| `⌘ \`          | Toggle the note list     |
| `⌘ ⇧ L`        | Cycle theme              |
| `?`            | Keyboard shortcuts       |
| `Esc`          | Close the top-most panel |

Use `Ctrl` in place of `⌘` on Windows and Linux.

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

Once GitHub is connected, **Back up** creates a private repository on first use and uploads every
pending note and attachment change in one Git commit. Later backups reuse that repository and
advance its configured branch without force-pushing. Vault contents travel directly from the
browser to GitHub.

**Restore** loads the commit history for a configured backup (or an owner, repository, branch, and
directory entered on a new device). Choosing a commit downloads its vault files directly into OPFS,
replaces the local vault, and rebuilds IndexedDB metadata and the full-text search index. Current
backups include an Onyx metadata manifest; commits created before the manifest was introduced are
restored from their `notes/` and `attachments/` paths.

### GitHub App authentication

Onyx uses the GitHub App web authorization flow with PKCE. Configure the app callback URL as
`https://your-onyx-domain.example/auth/github/callback`, grant only the repository permissions the
backup feature needs, and set the variables in `.env.example` in the deployment environment.
Generate `GITHUB_AUTH_COOKIE_SECRET` with at least 32 random characters.

The GitHub App needs **Administration: write** to create the private backup repository and
**Contents: write** to create blobs, trees, commits, and update its branch. Install it for all
repositories so the newly created backup repository is immediately accessible.

The server handles only authorization-code exchange and token refresh. GitHub credentials are kept
in an encrypted, HTTP-only cookie, and the active access token is held only in browser memory. GitHub
API requests are sent from the browser directly to `api.github.com`; note and attachment contents do
not pass through the Onyx backend.
