import { fetchNavigation } from "../lib/offline-navigation.js";
import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";
import { asset, resolve } from "$app/paths";
import { self } from "$app/service-worker";

const CACHE = `onyx-${version}`;
const APP_SHELL = resolve("/");
const IMMUTABLE = immutable.map(({ path }) => `${APP_SHELL}${path}`);
const STATIC = assets.map(({ path }) => asset(path));
const PRECACHE = [...IMMUTABLE, ...STATIC];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...PRECACHE, APP_SHELL])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("onyx-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetchNavigation(
        () => fetch(request),
        async () => (await caches.open(CACHE)).match(APP_SHELL),
        // The versioned shell has no user data. Callbacks and other routes still use the network.
        url.pathname === APP_SHELL &&
          !url.search &&
          !self.registration.waiting &&
          !self.registration.installing,
      ),
    );
    return;
  }

  if (IMMUTABLE.includes(url.pathname)) {
    // Vite varies CORS headers by Origin, but these static asset contents are identical.
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) => (await cache.match(request, { ignoreVary: true })) ?? fetch(request),
        ),
    );
    return;
  }

  if (STATIC.includes(url.pathname)) {
    // Unhashed files keep their URL across deployments. A document fetched while an update
    // waits names a newer version, so only this version's documents may use this cache.
    event.respondWith(
      fetchNavigation(
        () => fetch(request),
        async () =>
          (await caches.open(CACHE)).match(request, { ignoreSearch: true, ignoreVary: true }),
        url.searchParams.get("v") === version,
      ),
    );
  }
});
