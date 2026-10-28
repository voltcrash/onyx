<script lang="ts">
  import Seo from '#lib/components/seo.svelte';
  import { canonicalUrl, type guides } from '#lib/site.ts';
  let { data }: { data: { guide: (typeof guides)[number] } } = $props();
  const path = $derived(`/guides/${data.guide.slug}`);
  const structuredData = $derived({
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: data.guide.title, description: data.guide.description, url: canonicalUrl(path), inLanguage: 'en',
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'About Onyx', item: canonicalUrl('/about') },
      { '@type': 'ListItem', position: 2, name: data.guide.title, item: canonicalUrl(path) },
    ] },
  });
</script>

<Seo title={`${data.guide.title} | Onyx`} description={data.guide.description} {path} {structuredData} />
<nav aria-label="Breadcrumb"><a href="/about">About Onyx</a> / Guide</nav>
<article>
  <h1>{data.guide.title}</h1>
  <p>{data.guide.intro}</p>
  {#each data.guide.sections as section}<section><h2>{section.heading}</h2><p>{section.text}</p></section>{/each}
</article>
<p><a href="/">Open Onyx and start writing</a></p>
