# Styling Onyx

App chrome uses Tailwind utilities in Svelte markup. This includes the sidebar,
file tree, toolbar, status notices, find/replace, dialogs, menus, and responsive
pane controls. Semantic classes such as `sidebar` and `settings-body` remain
useful hooks for tests; they are not a second global styling API.

The components in `src/lib/components/ui` are shadcn-svelte components, reduced
and restyled for Onyx. Bits UI owns dialog focus trapping, dismissal, menu
positioning, submenu navigation, and command selection. A small Page Up/Down adapter preserves Onyx’s page-sized
palette jumps through the library’s controlled selection value. Keep application actions
and command search ranking outside those primitives. The tree, drag and drop,
and resizable panes remain custom because these are application behavior.

## Plain CSS boundary

Keep these styles in CSS:

- `editor.css`: rendered Markdown, CodeMirror, and their responsive rules. The
  Markdown HTML is generated, and its styles also serve HTML export and print.
- `print.css`, `mermaid.css`, and generated color themes.
- `base.css`: document defaults, accessibility helpers, and shared keyframes.
- `static/startup.css`: the first-paint fallback, before route CSS arrives.

Do not convert rendered `.prose` content into Tailwind Typography or add utility
classes to the Markdown pipeline. The editor's existing pane CSS is intentionally
unlayered. Responsive chrome utilities that override it use Tailwind's `!` suffix.

The old app-shell, command-palette, and responsive stylesheets are gone.
`dialogs.css` and `menus.css` now contain only Tailwind imports and source lists,
not detached widget rules. Prefer utilities and local arbitrary variants for
parent state or generated child elements. Dynamic user-controlled dimensions,
such as sidebar width and tree depth, remain CSS custom properties.

## Colors and sizes

`src/lib/theme-tokens.json` and `scripts/generate-themes.mjs` remain the color
source of truth. Never hand-edit `color-themes.generated.css`.
`styles/chrome-theme.css` maps those variables to Tailwind colors and shadcn's
semantic names. For Onyx chrome prefer its precise tokens (`text-ink-soft`,
`text-faint`, `bg-paper`, `border-line-soft`) over generic shadcn defaults. Portals
inherit the variables from the document root, including all twelve themes in
both light and dark modes.

Use this type scale, in rem units relative to the root:

| Utility                                  | Size at a 16px root                |
| ---------------------------------------- | ---------------------------------- |
| `text-ui-10`, `text-ui-11`               | 10px, 11px metadata                |
| `text-ui-12`, `text-ui-13`, `text-ui-14` | 12px, 13px, 14px controls and body |
| `text-ui-16`, `text-ui-18`, `text-ui-20` | 16px, 18px, 20px subheadings       |
| `text-ui-24`, `text-ui-28`, `text-ui-32` | 24px, 28px, 32px display headings  |

Use Tailwind's radius scale: `rounded-none`, `rounded-sm` (4px), `rounded-md`
(6px), `rounded-lg` (8px), `rounded-xl` (12px), `rounded-2xl` (16px),
`rounded-3xl` (24px), or `rounded-full`. Avoid new intermediate type sizes or
radii. Existing layout measurements are preserved where changing them would
move controls or change text wrapping; use the standard spacing utilities when
they express the required dimension.

## Layers, lazy loading, and CSP

The startup stylesheet establishes `theme, base, components, utilities` order.
Its fallback rules and `base.css` live in `base`, so utilities can take over after
loading without losing the recognizable first paint.

`layout.css` excludes dialog and menu source files from the initial utility
sheet. Dialogs, image preview, the command palette, context menus, and the vault
menu load dynamically. Their CSS scans only the associated components, references
the shared theme, and emits into `utilities`. When adding a lazy component,
update both the exclusion in `layout.css` and the appropriate source list in
`dialogs.css` or `menus.css`. Do not reference `layout.css` from a lazy sheet:
that would inherit its source exclusions. Dialog preparation still waits for
`loadDialogStyles()` before displaying controller-driven dialogs.

The production CSP permits external stylesheets and style attributes, but not
runtime style elements. Use the existing CodeMirror constructable stylesheet
integration; do not add a CSS-in-JS runtime or runtime animation stylesheet.
Tailwind is compiled at build time. The trimmed widget components do not depend
on Tailwind Typography, tailwind-variants, or tw-animate-css.

Run `vp run ci`. The browser suites cover responsive layout, resizing and drag
and drop, dialogs, menus, keyboard commands, and startup behavior.
`chrome.e2e.ts` additionally checks lazy widget loading, focus, all theme variants,
and production CSP violations.
