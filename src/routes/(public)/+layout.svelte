<script lang="ts">
  import { guides, REPOSITORY_URL } from '#lib/site.ts';
  let { children, data } = $props();
</script>

<svelte:head>
  <meta name="robots" content={data.preventIndexing ? "noindex, nofollow" : "index, follow, max-image-preview:large"} />
</svelte:head>

<div class="public-page">
  <a class="skip" href="#content">Skip to content</a>
  <header>
    <a class="brand" href="/about">Onyx</a>
    <nav aria-label="Main navigation"><a href="/about">About</a><a href={REPOSITORY_URL}>Source code</a><a class="cta" href="/">Open editor</a></nav>
  </header>
  <main id="content">{@render children()}</main>
  <footer>
    <p>Onyx · A quiet place to think in Markdown.</p>
    <nav aria-label="Guides">{#each guides as guide}<a href={`/guides/${guide.slug}`}>{guide.title}</a>{/each}</nav>
    <a href="/">Start writing in Onyx</a>
  </footer>
</div>

<style>
  :global(body:has(.public-page)) { overflow: auto; background: #fafafa; color: #262623; font-family: system-ui, sans-serif; }
  :global(body:has(.public-page) #startup-shell) { display: none; }
  .public-page { max-width: 960px; padding: 0 24px; margin: auto; line-height: 1.75; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 24px 0; border-bottom: 1px solid #ddd; }
  nav { display: flex; flex-wrap: wrap; gap: 12px 24px; }
  a { color: #34342f; text-underline-offset: 4px; }
  .brand { font: bold 30px Georgia, serif; text-decoration: none; }
  .cta { background: #262623; color: white; padding: 4px 14px; border-radius: 6px; text-decoration: none; }
  main { max-width: 740px; padding: 48px 0; }
  :global(.public-page h1) { font: 500 clamp(2rem, 5vw, 3.5rem)/1.15 Georgia, serif; letter-spacing: -0.03em; }
  :global(.public-page h2) { margin-top: 36px; font: 500 1.65rem/1.3 Georgia, serif; }
  :global(.public-page p) { margin: 18px 0; }
  :global(.public-page a:focus-visible) { outline: 2px solid #262623; outline-offset: 4px; }
  footer { padding: 24px 0 48px; border-top: 1px solid #ddd; }
  footer nav { flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .skip { position: absolute; top: -100px; }
  .skip:focus { top: 0; background: white; padding: 12px; }
  @media (max-width: 540px) { header { align-items: flex-start; } header nav { justify-content: flex-end; gap: 12px; } }
</style>
