/*
 * PocketPulse service worker. Its one job is to let the app open with no network, so a purchase
 * can always be recorded.
 *
 * - Build files have hashed names, so a saved copy is always right: cache first.
 * - Screens hold live money figures, so the network always goes first. A saved copy is used only
 *   when the network fails or takes too long, and the app says how old it is.
 * - Writes, API routes, exports and auth never pass through here.
 *
 * Next's in-app navigation requests are left alone. When one fails offline, Next falls back to a
 * full page load, which arrives here.
 */
const STATIC_CACHE = "pp-static-v1";
const PAGES_CACHE = "pp-pages-v1";
const OFFLINE_PAGE = "/offline";
const NETWORK_WAIT_MS = 4000;
const MAX_PAGES = 40;
const MAX_STATIC = 300;

/** Signed-out and setup screens have nothing to offer offline. */
const NOT_SAVED =
  /^\/(welcome|login|register|forgot-password|reset-password|onboarding|auth|api)\b/;
const NEVER_HANDLED = /^\/(api|auth)\/|\/export$/;
const ASSETS_IN_HTML = /\/_next\/static\/[^"'\\\s<>)]+/g;

// Bumped on clear, so a page fetch still running can't save itself after a sign-out.
let generation = 0;

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)),
  );
}

async function saveAssets(html) {
  const cache = await caches.open(STATIC_CACHE);
  const urls = [...new Set(html.match(ASSETS_IN_HTML) ?? [])];
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url).catch(() => null);
      if (response?.ok) await cache.put(url, response);
    }),
  );
  await trim(STATIC_CACHE, MAX_STATIC);
}

/** Saves a finished screen, with the time, unless it's an error screen. */
async function savePage(key, response, started) {
  const html = await response.text();
  if (started !== generation || html.includes('data-state="error"')) return;
  const headers = new Headers(response.headers);
  headers.set("x-pp-saved-at", String(Date.now()));
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(key, new Response(html, { status: 200, headers }));
  await trim(PAGES_CACHE, MAX_PAGES);
  await saveAssets(html);
}

async function fetchAndSave(urls) {
  for (const url of urls) {
    const started = generation;
    const response = await fetch(url, { credentials: "same-origin" }).catch(() => null);
    if (response?.ok && !response.redirected) {
      await savePage(url, response, started).catch(() => undefined);
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(OFFLINE_PAGE);
      const html = await response.clone().text();
      await (await caches.open(STATIC_CACHE)).put(OFFLINE_PAGE, response);
      await saveAssets(html);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = [STATIC_CACHE, PAGES_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !current.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "save-pages") event.waitUntil(fetchAndSave(event.data.urls ?? []));
  if (event.data?.type === "clear-pages") {
    generation += 1;
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function offlineScreen() {
  const saved = await (await caches.open(STATIC_CACHE)).match(OFFLINE_PAGE);
  return saved ?? fetch(OFFLINE_PAGE);
}

async function networkFirstPage(event) {
  const url = new URL(event.request.url);
  const key = url.pathname + url.search;
  const started = generation;
  const savedCopy = async () => (await caches.open(PAGES_CACHE)).match(key);
  // A redirect, not the page in place: Next can't run a page at another page's address.
  const offlinePage = () =>
    Response.redirect(`${OFFLINE_PAGE}?from=${encodeURIComponent(key)}`, 302);

  const network = fetch(event.request);
  event.waitUntil(
    network
      .then((response) => {
        const worthSaving =
          response.ok && response.type === "basic" && !NOT_SAVED.test(url.pathname);
        return worthSaving ? savePage(key, response.clone(), started) : undefined;
      })
      .catch(() => undefined),
  );

  let timer;
  const tooSlow = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_WAIT_MS);
  });
  try {
    const first = await Promise.race([network, tooSlow]);
    if (first) return first;
    return (await savedCopy()) ?? (await network);
  } catch {
    return (await savedCopy()) ?? offlinePage();
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (NEVER_HANDLED.test(url.pathname)) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode !== "navigate") return;
  event.respondWith(url.pathname === OFFLINE_PAGE ? offlineScreen() : networkFirstPage(event));
});
