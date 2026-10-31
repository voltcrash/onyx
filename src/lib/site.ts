export const SITE_URL = "https://onyx.voltcrash.com";
export const SITE_TITLE = "Onyx — Local-first Markdown notes app";
export const SITE_DESCRIPTION =
  "Write, preview and search Markdown notes in your browser with Onyx. Works offline after loading, without an account, with optional GitHub backup.";
export const REPOSITORY_URL = "https://github.com/voltcrash/onyx";

export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Onyx",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Onyx",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Web browser",
      browserRequirements: "Requires JavaScript, IndexedDB and OPFS",
      featureList: [
        "Local Markdown notes",
        "Offline editing after initial load",
        "Live preview",
        "Full-text search",
        "Wiki links and backlinks",
        "Optional GitHub backup",
        "Markdown import and export",
      ],
      sameAs: REPOSITORY_URL,
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
  ],
};

export const publicPaths = ["/"];
export const discoveryPaths = ["/robots.txt", "/sitemap.xml", "/llms.txt"];
export const canonicalUrl = (path: string) => new URL(path, SITE_URL).href;
export const serializeJsonLd = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
