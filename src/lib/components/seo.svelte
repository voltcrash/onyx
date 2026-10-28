<script lang="ts">
  import { canonicalUrl, SITE_TITLE, SITE_DESCRIPTION, serializeJsonLd } from '#lib/site.ts';
  let { title = SITE_TITLE, description = SITE_DESCRIPTION, path = '/', structuredData }: {
    title?: string; description?: string; path?: string; structuredData?: unknown;
  } = $props();
  const image = canonicalUrl('/icons/icon-512.png');
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonicalUrl(path)} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Onyx" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl(path)} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:image:alt" content="Onyx app icon" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
  <meta name="twitter:image:alt" content="Onyx app icon" />
  {#if structuredData}
    {@html `<script type="application/ld+json">${serializeJsonLd(structuredData)}<\/script>`}
  {/if}
</svelte:head>
