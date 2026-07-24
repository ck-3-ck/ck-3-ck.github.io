const CACHE_NAME = "pocket-quiz-v8-http-error-fallback";
const scopedAsset = (path) => new URL(path.replace(/^\/+/, ""), self.registration.scope).toString();
const APP_SHELL = scopedAsset("./");
const CORE_ASSETS = [
  "./",
  "manifest.webmanifest",
  "data/banks.json",
  "assets/app.js",
  "assets/app.css",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "data/banks/bills-20250507.json",
  "data/banks/employee-conduct.json",
  "data/banks/customer-manager-2026.json",
  "data/banks/cash-counterfeit-2026-new-employee.json",
  "data/banks/super-counter.json"
].map(scopedAsset);

async function appShellFallback(response) {
  return (await caches.match(APP_SHELL)) ?? response ?? Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event.data?.type !== "OFFLINE_STATUS") return;

  const replyTarget = event.ports?.[0] ?? event.source;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const matches = await Promise.all(CORE_ASSETS.map((asset) => cache.match(asset)));
      const cached = matches.filter(Boolean).length;
      replyTarget?.postMessage({
        type: "OFFLINE_STATUS",
        version: CACHE_NAME,
        ready: cached === CORE_ASSETS.length,
        cached,
        total: CORE_ASSETS.length,
      });
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!response.ok) return appShellFallback(response);

          const copy = response.clone();
          await caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          return response;
        })
        .catch(() => appShellFallback())
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
