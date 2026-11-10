/**
 * Connections to the database occasionally drop mid-request (ECONNRESET). A page makes about ten
 * reads, and one lost read shouldn't take down the whole screen, so a read that fails at the
 * network level is tried again. So is an update or a delete: every one in the app sets an
 * absolute state ("status = active", "archived_at = now", "delete this id"), so repeating one
 * that already landed changes nothing. Without this, a dropped connection turned "Reopen" into
 * "Something went wrong" (Design 4 final check).
 *
 * Inserts and RPCs are never retried here, except the one RPC that's safe to repeat by design:
 * they may already have worked, and saving money has its own idempotent retry in the mutation
 * layer. An HTTP error is an answer, not a dropped connection, so it's returned as it is.
 */
const RETRY_DELAYS_MS = [100, 300];
const REPEATABLE_RPC = "/rest/v1/rpc/ensure_default_account";

function canRepeat(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (["GET", "HEAD", "PATCH", "DELETE"].includes(method)) return true;
  const url = input instanceof Request ? input.url : String(input);
  return method === "POST" && new URL(url).pathname === REPEATABLE_RPC;
}

export function retryingFetch(
  base: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): typeof fetch {
  return async (input, init) => {
    if (!canRepeat(input, init)) return base(input, init);
    for (const delay of RETRY_DELAYS_MS) {
      try {
        return await base(input, init);
      } catch (error) {
        // A caller that cancelled the request meant it; only a lost connection is worth repeating.
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        await wait(delay);
      }
    }
    return base(input, init);
  };
}
