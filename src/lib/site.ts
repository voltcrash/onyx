export const SITE_URL = "https://onyx.voltcrash.com";
export const SITE_TITLE = "Onyx — Local-first Markdown notes app";
export const SITE_DESCRIPTION =
  "Write, preview and search Markdown notes in your browser with Onyx. Works offline after loading, without an account, with optional GitHub backup.";
export const REPOSITORY_URL = "https://github.com/voltcrash/onyx";

export const guides = [
  {
    slug: "offline-markdown-editor",
    title: "Write Markdown notes offline in your browser",
    description:
      "Use Onyx as an offline Markdown editor with live preview, local autosave and full-text search. Learn how local storage and backups work.",
    intro:
      "Onyx is a browser-based Markdown editor for writing that continues without a network connection. Load the app online once, then keep editing and searching notes on the same device offline.",
    sections: [
      {
        heading: "Start writing without an account",
        text: "Open Onyx and create a note from the notes sidebar. Write Markdown in the source pane and see the rendered preview alongside it. Notes autosave on this device; no GitHub account is needed to write, search, import or export.",
      },
      {
        heading: "Prepare for offline use",
        text: "Open the editor while connected and let the app finish loading before going offline. Onyx caches its application shell with a service worker. Keep using the same browser profile and site address to access your local vault. A first visit still needs a connection, and GitHub backup and restore need internet access.",
      },
      {
        heading: "Find notes without a server",
        text: "Search titles and note contents with the on-device full-text index. Add a #tag to narrow results. The command palette provides another way to search and navigate without leaving the keyboard.",
      },
      {
        heading: "Keep a separate copy",
        text: "Browser storage can be cleared or evicted. Export your vault as a ZIP or folder, or use optional GitHub backup when back online. Private browsing and clearing site data can remove local notes. Offline access is not a substitute for a backup.",
      },
    ],
  },
  {
    slug: "local-first-notes",
    title: "Local-first notes: storage, privacy and portability",
    description:
      "Understand where Onyx stores Markdown notes, when data leaves your device, and how to export your vault or connect a local folder.",
    intro:
      "Onyx stores your Markdown notes on your device by default. It suits personal notes, drafts and research when you want local search and portable files without creating an account.",
    sections: [
      {
        heading: "Where your notes live",
        text: "Onyx uses IndexedDB for note metadata, note text and its search index, and the origin private file system (OPFS) for Markdown files and attachments. This is browser-managed storage, separate from an ordinary folder in your file manager. Notes are not published as web pages.",
      },
      {
        heading: "When data leaves the device",
        text: "Editing and search work locally. If you choose GitHub backup, your browser sends vault data directly to the GitHub API and stores it in your selected private repository. GitHub sign-in is optional. A private repository is not end-to-end encryption, and Onyx does not claim encrypted local storage.",
      },
      {
        heading: "Connect a folder or export your vault",
        text: "In Settings → Storage choices, browsers that support the File System Access API can mirror the vault to a dedicated folder you choose. Other browsers can use folder import and ZIP import/export. Export Markdown and attachments to keep a copy independent of browser storage.",
      },
      {
        heading: "Link ideas and keep files portable",
        text: "Use [[Note name]] wiki links and backlinks to connect notes, and inline #tags or front matter tags to organize them. Markdown files remain exportable. Onyx is designed for individual vaults; GitHub restore replaces the local vault rather than merging simultaneous edits from several people.",
      },
    ],
  },
  {
    slug: "github-backup",
    title: "Back up Markdown notes to a private GitHub repository",
    description:
      "Set up optional GitHub backup in Onyx, restore Markdown notes on another device, and understand automatic backups and restore limitations.",
    intro:
      "Onyx can back up your Markdown vault and attachments to a private GitHub repository. Use this optional workflow for an off-device copy and cross-device restore while keeping everyday editing local.",
    sections: [
      {
        heading: "Connect GitHub and choose a repository",
        text: "Open Settings and connect GitHub. Select an existing private repository with write access or create a new one. GitHub authentication must be configured by the deployment operator. The integration requests the repo scope to create private repositories and write backup commits.",
      },
      {
        heading: "Back up manually or after editing",
        text: "Run a backup to commit pending changes. With automatic backup enabled, Onyx backs up two minutes after editing stops while online. A failed or conflicting automatic backup pauses automatic backups until the next manual backup.",
      },
      {
        heading: "Restore on another device",
        text: "Open Onyx on the other device, connect GitHub, and restore the vault from a chosen repository commit. Restore replaces local notes and attachments and rebuilds the local search index. Export any local work you want to keep before replacing a vault.",
      },
      {
        heading: "Understand cross-device conflicts",
        text: "If another device has backed up newer changes, Onyx asks you to restore that backup or back up anyway, preserving the other backup in repository history. This is backup and restore, not live collaborative editing or automatic merging. Exporting a ZIP is also available without GitHub.",
      },
    ],
  },
];

export const publicPaths = ["/", "/about", ...guides.map(({ slug }) => `/guides/${slug}`)];
export const discoveryPaths = ["/robots.txt", "/sitemap.xml", "/llms.txt"];
export const canonicalUrl = (path: string) => new URL(path, SITE_URL).href;
export const serializeJsonLd = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
