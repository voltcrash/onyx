import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

// Some dependencies' browser builds touch DOM APIs that workers lack (DOMParser, document) as
// soon as they load. Worker builds still resolve the `browser` export condition, so these are
// switched to the entry each package publishes under its `worker` condition.
const WORKER_ENTRIES: Record<string, { browser: string; worker: string }> = {
  "decode-named-character-reference": { browser: "/index.dom.js", worker: "/index.js" },
  "hast-util-from-html-isomorphic": { browser: "/lib/browser.js", worker: "/index.js" },
};

function workerExportConditions() {
  return {
    name: "onyx:worker-export-conditions",
    enforce: "pre" as const,
    async resolveId(
      this: {
        resolve: (
          source: string,
          importer?: string,
          options?: { skipSelf?: boolean },
        ) => Promise<{ id: string } | null>;
      },
      source: string,
      importer?: string,
    ) {
      const entry = WORKER_ENTRIES[source];
      if (!entry) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      const id = resolved?.id.replaceAll("\\", "/");
      if (!id?.endsWith(entry.browser)) return resolved;
      return `${id.slice(0, -entry.browser.length)}${entry.worker}`;
    },
  };
}

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  worker: {
    format: "es",
    plugins: () => [workerExportConditions()],
  },
  plugins: [
    lazyPlugins(() => [
      tailwindcss(),
      sveltekit({
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        },
        serviceWorker: { register: false },
        csp: {
          mode: "auto",
          directives: {
            "default-src": ["self"],
            "base-uri": ["self"],
            "connect-src": ["self", "https://api.github.com"],
            "font-src": ["self", "data:"],
            "form-action": ["self"],
            "frame-ancestors": ["none"],
            "img-src": ["self", "blob:", "data:"],
            "manifest-src": ["self"],
            "object-src": ["none"],
            "script-src": ["self"],
            "style-src": ["self"],
            "style-src-attr": ["unsafe-inline"],
            "worker-src": ["self", "blob:"],
          },
        },
        adapter: adapter(),
      }),
    ]),
  ],
});
