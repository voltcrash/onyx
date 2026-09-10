import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

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
            "font-src": ["self"],
            "form-action": ["self"],
            "frame-ancestors": ["none"],
            "img-src": ["self", "blob:"],
            "manifest-src": ["self"],
            "object-src": ["none"],
            "script-src": ["self"],
            "style-src": ["self"],
            "worker-src": ["self", "blob:"],
          },
        },
        adapter: adapter(),
      }),
    ]),
  ],
});
