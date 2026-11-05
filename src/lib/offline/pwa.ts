/**
 * The page side of the service worker in `public/sw.js`. Saved pages hold the user's own figures,
 * so they're cleared on sign-out. Everything here is best effort: a browser without a service
 * worker just has no offline pages.
 */
const PAGES_CACHE = "pp-pages-v1";
const SAVED_AT_HEADER = "x-pp-saved-at";

/** The screens that have to open offline even if this device never visited them. */
const OFFLINE_PAGES = [
  "/home",
  "/add",
  "/add/text",
  "/transactions",
  "/transactions/new",
  "/settings/sync",
];
const REFRESH_EVERY_MS = 60 * 60 * 1000;
const REFRESHED_KEY = "pp-pages-saved-at";
const AFTER_WRITE_DELAY_MS = 15_000;

function post(message: { type: string; urls?: string[] }) {
  if ("serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage(message);
}

/** Saves the core screens for offline use, at most once an hour unless `force`d. */
export function savePagesForOffline({ force = false }: { force?: boolean } = {}) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  try {
    const last = Number(window.localStorage.getItem(REFRESHED_KEY) ?? 0);
    if (!force && Date.now() - last < REFRESH_EVERY_MS) return;
    window.localStorage.setItem(REFRESHED_KEY, String(Date.now()));
  } catch {
    // Without storage this just repeats more often.
  }
  post({ type: "save-pages", urls: OFFLINE_PAGES });
}

/**
 * Hands the worker every build file this page has loaded, so code fetched before the worker took
 * over (the offline queue loads on demand) is still there with no network.
 */
export function saveLoadedAssets() {
  try {
    const urls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => name.includes("/_next/static/"));
    if (urls.length > 0) post({ type: "save-assets", urls });
  } catch {
    // Without resource timing, the worker still saves what passes through it.
  }
}

let afterWrite: ReturnType<typeof setTimeout> | undefined;

/** Keeps the saved screens close to what the ledger says, without a refresh per tap. */
export function savePagesSoon() {
  clearTimeout(afterWrite);
  afterWrite = setTimeout(() => savePagesForOffline({ force: true }), AFTER_WRITE_DELAY_MS);
}

export async function clearSavedPages() {
  clearTimeout(afterWrite);
  post({ type: "clear-pages" });
  try {
    window.localStorage.removeItem(REFRESHED_KEY);
    if ("caches" in window) await window.caches.delete(PAGES_CACHE);
  } catch {
    // Storage is blocked, so nothing was saved either.
  }
}

/** When the page on screen was saved, if a saved copy exists. */
export async function savedPageTime(): Promise<number | null> {
  try {
    const cache = await window.caches.open(PAGES_CACHE);
    const page = await cache.match(window.location.pathname + window.location.search);
    return Number(page?.headers.get(SAVED_AT_HEADER)) || null;
  } catch {
    return null;
  }
}
