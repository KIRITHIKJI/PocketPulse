/**
 * The offline queue, and Dexie with it, is loaded on first use rather than with every page's
 * first JavaScript. The browser loads it once and reuses it.
 */
export const loadQueue = () => import("@/lib/offline/queue");
