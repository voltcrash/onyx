# Onyx

Onyx is a local-first Markdown notes app. It works without an account, autosaves notes on the
current device, and provides full-text search. Optional GitHub sign-in
adds private backup and cross-device restore.

## What is implemented

- Create and autosave Markdown notes locally.
- Search note titles and contents from an on-device index. Add `#tag` to a search to keep only
  notes with that tag.
- Link notes with `[[Note name]]`, `[[Note name#Heading]]`, or `[[Note name|label]]`. A wiki link
  finds the note with that file name in any folder, preferring the linking note's folder, and a
  link to a missing note offers to create it. Each rendered note lists the notes that link to it.
- Tag notes with inline `#tags` or a front matter `tags:` list. Clicking a tag in the rendered note
  searches for it.
- Write in the CodeMirror source pane with Markdown syntax highlighting, then see the rendered
  pane update alongside it. Find matches appear directly in the source, and long notes render
  only the source lines near the viewport.
- Syntax-highlight fenced code blocks and show a short language label when the opening fence names
  a language; the same markup is preserved in rich-text, PDF, and HTML output.
- Render Mermaid fences as diagrams with [Pele](https://pele.run/), including responsive layouts,
  theme colors, and keyboard zoom. Diagrams also appear in HTML exports and printed PDFs.
- Point just beside the divider to reveal a pane's grip, drag it to any side of the workspace to place the panes side by side or stacked, and drag the divider to resize them.
- Copy or export notes as plain text, rich text, generated HTML, or a printed-page PDF. Plain text
  copies to the clipboard or downloads as a text file, rich
  text copies with its formatting or downloads as an RTF document, HTML downloads as a standalone
  file, and the PDF view prints through the browser's print dialog, where it can be saved as a PDF.
- Choose a light, dark, or system theme. System follows the operating system preference, updates
  when that preference changes, and the selected mode is saved in this browser.
- Choose from twelve color themes. Ember is the default: Ember, Monochrome, Ocean, Forest,
  Graphite, Marigold, Espresso, Ink, Lavender, Burgundy, Rose, and Solarized are available.
- Import Markdown folders or ZIP archives, including locally referenced attachments.
- Export the complete vault to a folder when the browser supports the File System Access API, or
  download it as a ZIP in other browsers.
- Optionally sign in with GitHub, select or create a private repository, back up pending changes in
  one commit, and restore the vault on this or another device. Backups can run automatically once
  editing settles.
- Continue editing offline after the app has been loaded; GitHub actions pause until connectivity
  returns.
- Inspect browser storage usage, request persistent storage, connect a local folder, or clear the
  local vault in Settings.

The interface is responsive: desktop layouts have a collapsible note sidebar, while narrow layouts
use a slide-over note list. Preferences are saved per browser when local storage is available.

## Keyboard shortcuts

| Shortcut        | Action                                |
| --------------- | ------------------------------------- |
| `⌘ K`           | Open command palette and search notes |
| `⌘ ⇧ F` or `/`  | Open command palette and search notes |
| `⌘ ⏎`           | Create a note                         |
| `⌘ S`           | Save the active note                  |
| `⌘ X` / `⌘ C`   | Cut or copy the current selection     |
| `⌘ V`           | Paste into the active editor          |
| `⌘ Z`           | Undo the last edit                    |
| `⌘ ⇧ Z` / `⌘ Y` | Redo the last undone edit             |
| `⌘ A`           | Select all Markdown                   |
| `⌘ B` / `⌘ I`   | Format selected text                  |
| `⌘ ⇧ P`         | Toggle rendered pane                  |
| `⌘ \`           | Toggle the note sidebar               |
| `⌘ ⇧ L`         | Cycle light, dark, and system themes  |
| `?`             | Show all shortcuts                    |
| `Esc`           | Close the active panel                |

Use `Ctrl` instead of `⌘` on Windows and Linux.

## Storage model

Onyx requires IndexedDB and the origin private file system (OPFS). IndexedDB stores note and
attachment metadata, the latest note text, the search index, GitHub backup configuration, and the
ordered backup queue. Markdown files and attachment bytes are written to OPFS. OPFS is the default
for every new vault and remains the universal fallback. Keeping the latest note text in IndexedDB
also lets an edit survive when an OPFS write fails because the site has reached its storage quota.

When the browser exposes the File System Access API, **Settings → Storage choices** can connect a
user-selected directory. Onyx detects this API directly rather than checking the browser name, then
stores the granted directory handle in IndexedDB and mirrors the OPFS `notes/` and `attachments/`
trees into that directory. Choose a dedicated folder because restoring a vault replaces those two
subdirectories. Disconnecting leaves the folder contents in place and continues with OPFS.

Firefox and Safari generally do not expose persistent handles to arbitrary local files or folders.
On those browsers, use OPFS together with Import & export, upload/download, or GitHub backup
workflows. If a previously connected directory's permission expires or is revoked, startup and
autosave continue against OPFS. Settings shows that the folder needs to be reconnected; choosing it
again copies the current OPFS vault into the folder before mirroring resumes.

Open tabs coordinate vault writes and GitHub backups with the Web Locks API when it is available.
BroadcastChannel invalidations refresh other tabs after a change, while note and vault revisions
reject stale writes and snapshots.

Browser storage is not the same as a user-selected folder. Clearing site data removes the local
vault, and browsers may evict non-persistent storage under space pressure. Onyx reports unavailable
storage capabilities in the workspace and exposes persistence status in Settings, so important
vaults should also be exported or backed up.

## Optional GitHub backup and sync

GitHub is not required to create, edit, search, import, or export notes. Signing in only enables an
off-device backup that can be restored on another device.

Onyx authenticates through Better Auth's GitHub provider. Better Auth handles the OAuth flow and
keeps the session and GitHub account data in signed, encrypted HTTP-only cookies; the active access
token exists only in browser memory. Vault data is sent from the browser directly to
`api.github.com` and does not pass through the Onyx server.

Backups target private, active repositories where the connected account has write access. A backup
coalesces pending changes by path and advances the configured branch without force-pushing. Restore
downloads the files from a chosen commit, replaces the local notes and attachments, and rebuilds the
IndexedDB metadata and search index. Current backups contain an Onyx manifest; older backups can be
reconstructed from their `notes/` and `attachments/` paths.

Each device remembers the commit it last backed up or restored. If another device has backed up to
the branch since then, Onyx does not build on that backup, because each backup's manifest lists
only the backing-up device's notes. It asks instead: restore the newer backup, which replaces this
device's notes, or back up anyway, which keeps the other backup in the repository history.

With **Back up automatically** on, Onyx backs up pending changes two minutes after editing stops
while the device is online. A failed or conflicting automatic backup pauses automatic backups until
the next manual one.

Create a GitHub OAuth App, configure its callback URL as
`https://your-onyx-domain.example/api/auth/callback/github`, and set the variables listed in
[`.env.example`](.env.example). `BETTER_AUTH_SECRET` must contain at least 32 random characters.
Onyx requests the `repo` scope so it can create private repositories and write backup commits.

## Local note history

Use **Show note history** in the command palette to preview and restore earlier text.
Snapshots stay in this browser's IndexedDB and are never uploaded. Saves capture at most
one snapshot per note every five minutes, retaining the newest fifty. Link rewrites and
restores preserve the previous text immediately; permanent deletion removes its history.

## Architecture

Focused reactive controllers handle GitHub backup and restore in
`src/routes/github-controller.svelte.ts`; the page controller coordinates the workspace. Import, export, and printing live in
`transfer-controller.svelte.ts`. Themes, fonts, and shortcuts live in
`preferences-controller.svelte.ts`. File and folder mutations, pins, and trash live in
`file-tree-controller.svelte.ts`.

- `src/routes/page-controller.svelte.ts` owns application state and coordinates persistence,
  transfer, and GitHub workflows; `src/routes/+page.svelte` composes the interface.
- `src/lib/markdown-editor.ts` adapts CodeMirror to the controller's editing, selection, find,
  clipboard, and scroll-sync workflows. Undo and redo use Onyx's document history; opening another note starts a fresh history.
- `src/lib/components/` contains focused workspace, navigation, dialog, and status components.
- `src/routes/styles/` separates base tokens, application shell, editor, dialog, command-palette,
  responsive, and print styles.
- `src/lib/theme-catalog.json` is the source of truth for theme metadata and preference keys;
  `src/lib/theme-tokens.json` contains the semantic palette overrides. Run `vp run themes:generate`
  after changing either file; it updates the static CSS. The document applies the mode and palette
  inline before hydration for a fast first paint.
- `src/lib/storage/` implements the IndexedDB vault and its OPFS/native-folder file abstraction.
- `src/lib/markdown-transfer.ts` implements folder and ZIP import/export.
- `src/lib/markdown-output.ts` formats the generated HTML, builds standalone HTML exports, and
  converts notes to plain text and RTF.
- `src/lib/markdown-lite.ts` keeps the first editor render dependency-free; the full parser,
  export/transfer tools, fonts, and dialog styles load only when needed.
- `src/lib/github.ts` implements repository validation, backup, and restore.
- `src/service-worker/index.ts` caches the application shell for offline use.

The app uses SvelteKit, TypeScript, Tailwind CSS, shadcn-svelte, and Vite+. It is configured for
Cloudflare Workers deployment through Wrangler. See [deployment](docs/deployment.md) for
account setup, secrets, domain cutover, previews, and rollback.

## Development

Use Node.js 26 LTS (currently 26.13.0) and Vite+ for project commands:

```sh
vp install
vp dev
vp check
vp run check
vp test
vp run build
```

TypeScript 7 provides the `tsc` command through the `@typescript/native` alias. SvelteKit and
`svelte-check` still need the JavaScript compiler API, so the `typescript` alias uses Microsoft’s
[`@typescript/typescript6` compatibility package](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

`vp test` runs the unit tests. The end-to-end tests drive Chromium through Playwright; install it
once with `vp run test:e2e:install`, then run `vp run test:e2e`. `vp run test` runs both suites.

The variables in `.env.example` enable optional GitHub backup and sync. Onyx runs locally without
them.

## Continuous integration

[GitHub Actions](https://github.com/voltcrash/onyx/actions/workflows/ci.yml) runs on pull requests
and pushes to `main`, and can also be started manually. Two independent Ubuntu validation jobs
run in parallel:

| Job                                | Validation                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lint, types and unit tests         | `vp check`, `vp run check`, and `vp test`                                                                    |
| Production build and browser tests | `vp run test:e2e` builds once, then tests the Worker in Chromium; `vp run deploy:check` validates its bundle |

All jobs use `setup-vp` to select Node.js from `package.json`, Vite+ from the workspace catalog,
and pnpm from `packageManager`. Dependencies are installed through `vp` with a frozen lockfile;
the pnpm download store is cached by platform and lockfile. Browser binaries and test results
are not cached. Chromium and its system dependencies are installed only in the browser job.

Checks have a ten-minute timeout; the build and browser tests have twenty minutes. New commits
cancel older runs on the same pull request. Pushes to `main` do not cancel an in-progress run.
The workflow has read-only repository permissions and does not persist checkout credentials.
Actions are pinned to release commits, with grouped weekly Dependabot updates.

The browser job keeps Playwright's single worker to avoid starving the preview server. Playwright
starts a fresh production build, so a separate build job would duplicate that work. Focused tests
(`test.only`) fail CI. Failures produce GitHub annotations, an HTML report, screenshots, and traces;
reports and `test-results/` are uploaded for seven days. Download the `playwright-failures` artifact
from the failed run to inspect them. Validation jobs need no real GitHub OAuth credentials or
deployment. Auth handler tests use
fixed placeholders, and GitHub API calls in the browser tests are intercepted locally.
Playwright serves the production build through Wrangler and the local Workers runtime.

After both jobs pass on a push to the current `main` commit, a deployment job publishes the
Worker and assets with Wrangler. Production deployments are serialized. Pull requests never
deploy production. Configure the repository secret `CLOUDFLARE_API_TOKEN` and variable
`CLOUDFLARE_ACCOUNT_ID`; keep OAuth credentials in Worker secrets. See
[deployment](docs/deployment.md) for the CLI setup and first cutover.

To reproduce CI locally on Ubuntu:

```sh
vp install --frozen-lockfile
vp exec playwright install --with-deps chromium
CI=1 vp run ci
```

On other operating systems, use `vp run test:e2e:install` and install any required browser system
libraries through your OS package manager. Local CI runs checks and browser tests sequentially
because Svelte checks and builds share generated files. The GitHub jobs use separate checkouts.

## Search discoverability

Onyx explains itself in the welcome note that opens on first visit, in
`src/routes/welcome-note.ts`. It is server-rendered at `/`, so search engines read it too. See
[search discoverability](docs/search-discoverability.md) for indexing behavior, validation and
production search-console setup.
