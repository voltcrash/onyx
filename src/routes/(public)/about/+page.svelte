<script lang="ts">
  import Seo from '#lib/components/seo.svelte';
  import { SITE_URL, SITE_DESCRIPTION, REPOSITORY_URL, guides } from '#lib/site.ts';
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Onyx', url: SITE_URL, description: SITE_DESCRIPTION, inLanguage: 'en' },
      { '@type': 'WebApplication', '@id': `${SITE_URL}/#app`, name: 'Onyx', url: SITE_URL, description: SITE_DESCRIPTION,
        applicationCategory: 'ProductivityApplication', operatingSystem: 'Web browser', browserRequirements: 'Requires JavaScript, IndexedDB and OPFS',
        featureList: ['Local Markdown notes', 'Offline editing after initial load', 'Live preview', 'Full-text search', 'Wiki links and backlinks', 'Optional GitHub backup', 'Markdown import and export'],
        sameAs: REPOSITORY_URL },
      { '@type': 'AboutPage', '@id': `${SITE_URL}/about#page`, url: `${SITE_URL}/about`, name: 'About Onyx', about: { '@id': `${SITE_URL}/#app` }, isPartOf: { '@id': `${SITE_URL}/#website` } },
    ],
  };
</script>

<Seo title="Onyx — Offline Markdown editor and local-first notes" path="/about" {structuredData} />

<h1>Local-first Markdown notes. A quiet place to think.</h1>
<p>Onyx is a Markdown notes app that runs in your browser. Write with a live preview, search your notes locally, and continue working offline after the app has loaded. Start without an account; connect GitHub only if you want private repository backup and cross-device restore.</p>
<p><a href="/">Open the Markdown editor</a> · <a href={REPOSITORY_URL}>Explore the source on GitHub</a></p>

<h2>Write, find and connect your ideas</h2>
<p>Keep drafts, personal notes, code snippets and research in Markdown. The source editor and rendered preview sit alongside each other, with syntax-highlighted code blocks, tables, task lists and math. Use full-text search across titles and contents, organize notes with folders and tags, and connect ideas with wiki links and backlinks.</p>

<h2>Your notes stay on this device by default</h2>
<p>Editing and search happen locally using browser storage. Notes are not published on this website. Export a vault as Markdown files and attachments in a folder or ZIP, or export an individual note as text, RTF or HTML. The browser print dialog can save rendered notes as PDF.</p>
<p>Browser storage can be cleared or evicted, so keep a separate export or backup of important work. Supported browsers can mirror a vault to a folder you choose. GitHub backup is optional and sends vault data directly from your browser to your selected private repository.</p>

<h2>Who is Onyx for?</h2>
<p>Onyx suits people who want a browser-based Markdown notebook, offline writing after initial setup, local search, and portable files without mandatory sign-in. It is built for individual vaults. It does not provide real-time collaboration, automatic multi-device merging or end-to-end encryption. Cross-device use works through explicit GitHub backup and restore.</p>

<h2>Practical guides</h2>
<ul>{#each guides as guide}<li><a href={`/guides/${guide.slug}`}>{guide.title}</a><p>{guide.description}</p></li>{/each}</ul>

<h2>Do I need an account?</h2>
<p>No account is needed to create, edit, search, import or export notes. GitHub sign-in is only needed for GitHub backup and restore.</p>
<h2>Can I use Onyx offline?</h2>
<p>Yes, after loading the editor online once in the same browser profile. Your local notes and search remain available offline. The first visit and GitHub operations need a network connection.</p>
<h2>Can I bring existing Markdown notes?</h2>
<p>Yes. Import a Markdown folder or ZIP archive with locally referenced attachments. Export the vault again whenever you want to keep a separate copy or move your files.</p>
