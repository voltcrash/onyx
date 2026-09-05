/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { base, build, files, version } from "$service-worker";

declare const self: ServiceWorkerGlobalScope;

const CACHE = `onyx-${version}`;
const APP_SHELL = `${base}/`;
const PRECACHE = [...build, ...files];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...PRECACHE, APP_SHELL])));
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth/github/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(APP_SHELL, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(APP_SHELL)) ?? Response.error()),
    );
    return;
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
