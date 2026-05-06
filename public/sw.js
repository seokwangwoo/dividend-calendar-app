const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith("static-") && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Do not cache authenticated app pages, admin pages, auth pages, API, or user data
  if (
    url.pathname.startsWith("/app/") ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("supabase") ||
    request.headers.get("authorization")
  ) {
    return;
  }

  // Only cache same-origin static assets
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        // Only cache successful static responses
        if (
          response.status === 200 &&
          (request.destination === "script" ||
            request.destination === "style" ||
            request.destination === "image" ||
            request.destination === "document" ||
            request.destination === "manifest")
        ) {
          const cloned = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, cloned);
          });
        }
        return response;
      });
    })
  );
});
