# Onyx

Onyx is a local-first Markdown notes app. It autosaves notes in the browser, provides full-text
search and several editing views, and can back up the vault to a private GitHub repository.

## What is implemented

- Create and autosave Markdown notes locally.
- Search note titles and contents from an on-device index.
- Write in source, rendered inline, split, or read-only preview mode.
- Switch between light, dark, and system themes.
- Import Markdown folders or ZIP archives, including locally referenced attachments.
- Export the complete vault to a folder when the browser supports the File System Access API, or
  download it as a ZIP in other browsers.
- Connect a GitHub account, select or create a private repository, back up pending changes in one
  commit, and restore the vault from a selected backup commit.
- Continue editing offline after the app has been loaded; GitHub actions pause until connectivity
  returns.
- Inspect browser storage usage, request persistent storage, or clear the local vault in Settings.

The interface is responsive: desktop layouts have a collapsible note sidebar, while narrow layouts
use a slide-over note list. Preferences are saved per browser when local storage is available.

## Keyboard shortcuts

| Shortcut       | Action                  |
| -------------- | ----------------------- |
| `⌘ K`          | Open command palette    |
| `⌘ ⇧ F` or `/` | Search all notes        |
| `⌘ ⏎`          | Create a note           |
| `⌘ S`          | Save the active note    |
| `⌘ B` / `⌘ I`  | Format selected text    |
| `⌘ ⇧ P`        | Toggle source/preview   |
| `⌘ \`          | Toggle the note sidebar |
| `⌘ ⇧ L`        | Cycle the theme         |
| `?`            | Show all shortcuts      |
| `Esc`          | Close the active panel  |

Use `Ctrl` instead of `⌘` on Windows and Linux.

## Storage model

Onyx requires IndexedDB and the origin private file system (OPFS). IndexedDB stores note and
attachment metadata, the latest note text, the search index, GitHub backup configuration, and the
ordered backup queue. Markdown files and attachment bytes are written to OPFS. Keeping the latest
note text in IndexedDB also lets an edit survive when an OPFS write fails because the site has
reached its storage quota.

Browser storage is not the same as a user-selected folder. Clearing site data removes the local
vault, and browsers may evict non-persistent storage under space pressure. Onyx reports unavailable
storage capabilities in the workspace and exposes persistence status in Settings, so important
vaults should also be exported or backed up.

## GitHub backup and restore

Onyx authenticates through a GitHub App using the authorization-code flow with PKCE. The server
handles the code exchange and token refresh; credentials stay in an encrypted HTTP-only cookie and
the active access token exists only in browser memory. Vault data is sent from the browser directly
to `api.github.com` and does not pass through the Onyx server.

Backups target private, active repositories where the connected account has write access. A backup
coalesces pending changes by path and advances the configured branch without force-pushing. Restore
downloads the files from a chosen commit, replaces the local notes and attachments, and rebuilds the
IndexedDB metadata and search index. Current backups contain an Onyx manifest; older backups can be
reconstructed from their `notes/` and `attachments/` paths.

Configure the GitHub App callback URL as
`https://your-onyx-domain.example/auth/github/callback` and set the variables listed in
[`.env.example`](.env.example). `GITHUB_AUTH_COOKIE_SECRET` must contain at least 32 random
characters. The app needs **Administration: write** to create a private repository and
**Contents: write** to create and update backup commits. Install it for all repositories if newly
created backup repositories should become available immediately.

## Architecture

- `src/routes/+page.svelte` owns application state and coordinates persistence, transfer, and
  GitHub workflows.
- `src/lib/components/` contains focused workspace, navigation, dialog, and status components.
- `src/routes/styles/` separates base tokens, application shell, editor, dialog, command-palette,
  and responsive styles.
- `src/lib/storage/` implements the IndexedDB and OPFS vault.
- `src/lib/markdown-transfer.ts` implements folder and ZIP import/export.
- `src/lib/github.ts` implements repository validation, backup, and restore.
- `src/service-worker.ts` caches the application shell for offline use.

The app uses SvelteKit, TypeScript, Tailwind CSS, shadcn-svelte, and Vite+. It is configured for
Vercel deployment.

## Development

Use the latest Node.js LTS release and Vite+ for project commands:

```sh
vp install
vp dev
vp check
vp test
vp build
```

GitHub authentication requires the environment variables in `.env.example`; local note editing and
browser storage do not.
