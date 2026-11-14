# Startup performance

Onyx prioritizes opening the local editor. Opening with no active note uses the
lightweight preview while the full Markdown worker loads; switching between notes still
prepares the full preview before displaying the next note.

Returning sessions use the service worker's versioned app shell for `/` without
a query string. This avoids waiting for a document request. Callback URLs and
other routes stay network-first. Navigations also use the network when a service
worker update is installing or waiting, so reloading can pick up a new deployment.
A missing or inaccessible cache falls back to the network. Service worker registration still checks for updates, and a new
worker activates after tabs using the previous worker close.

Vault recovery still checks every saved note before opening. It loads note
contents in one database read, checks files in batches of eight, and repairs
mismatches sequentially. Quota failures remain visible as pending note files;
other write failures still stop opening. This avoids unbounded parallel file I/O.
Backlinks and mentions share one vault snapshot, and mention searches avoid
parsing notes that cannot match.

## Verification

Run the standard project checks, then the production browser tests:

```sh
vp check
vp run check
vp test
vp run test:e2e
vp run deploy:check
```

`test/e2e/startup.e2e.ts` holds worker replies until after the editor has opened,
accepted edits, and saved. It then releases the worker and verifies preview
convergence and persistence after reload. Another case installs the actual
service worker and verifies that reopening needs no document fetch.

Storage unit tests assert one bulk content read, at most eight simultaneous file
reads, repair of missing/stale files, and quota/error behavior. The existing
browser suites cover offline editing, concurrent saves, cross-tab conflicts,
interrupted replacement recovery, note switching, and navigation.

A local Chromium production-build probe on 2026-11-14 delayed each worker reply
by four seconds. The editor became usable at 8,544 ms on the baseline and 390 ms
after the changes (fresh browser contexts, time measured from navigation via
`performance.now()`). This is a controlled dependency-delay experiment, not a
normal-load benchmark or a latency guarantee. Cold downloads, device speed,
vault size, and attachment I/O still affect startup.

## Chrome widget loading

Dialogs, the command palette, file context menus, and the vault menu load their
shadcn/Bits UI code and utility styles on demand. The startup route does not
import the widget primitives. CSS loading goes through `lazy-styles.ts` rather
than static imports in lazy Svelte components: SvelteKit otherwise adds those
component styles to the initial document. The first-paint fallback remains in
`static/startup.css`, in the base layer so route utilities can replace it.

A production build on 2026-11-14, compared with main `7bb0197`, had this footprint:

| Initial route assets   |    Before |     After |  Change |
| ---------------------- | --------: | --------: | ------: |
| JavaScript, raw bytes  | 1,045,695 | 1,062,969 | +17,274 |
| JavaScript, gzip bytes |   341,991 |   346,005 |  +4,014 |
| CSS, raw bytes         |    92,762 |   101,176 |  +8,414 |
| CSS, gzip bytes        |    20,090 |    21,938 |  +1,848 |

These totals follow static imports from the client manifest's layout/page nodes
(0 and 2), counting shared files once and gzipping each file separately with
Node's default compression. They exclude bootstrap scripts, workers, fonts, and
dynamic imports. Colocated utility markup and generated selectors add about
5.7 KiB compressed to that route graph; the widget library remains lazy. This
is a payload comparison, not a latency benchmark or a claim of zero byte growth.

The production browser tests verify that the editor opens without widget styles,
then that opening Settings loads dialog CSS. They also exercise focus trapping
and restoration, nested menu navigation, page-sized palette navigation, all
24 color/mode combinations, and CSP enforcement. The existing delayed-preview
and offline startup tests continue to apply. Desktop and phone screenshots of
the editor and Settings were compared against the previous chrome; menus and
confirmation dialogs were also checked in the running production build.
