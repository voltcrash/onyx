# Startup performance

Onyx prioritizes opening the local editor. First opening uses the lightweight
preview while the full Markdown worker loads; switching between notes still
prepares the full preview before displaying the next note.

Returning sessions use the service worker's versioned app shell for `/` without
a query string. This avoids waiting for a document request. Callback URLs and
other routes stay network-first. A missing or inaccessible cache falls back to
the network. Service worker registration still checks for updates, and a new
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
