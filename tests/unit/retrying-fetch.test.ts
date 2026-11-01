// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { retryingFetch } from "@/lib/supabase/retrying-fetch";

const REST = "https://x.supabase.co/rest/v1";
const reset = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
const ok = () => new Response("[]", { status: 200 });

function setup(...results: (Response | Error)[]) {
  const base = vi.fn(async () => {
    const next = results.shift()!;
    if (next instanceof Error) throw next;
    return next;
  });
  return { base, fetcher: retryingFetch(base as unknown as typeof fetch, async () => {}) };
}

describe("retrying dropped reads", () => {
  it("tries a read again after a dropped connection", async () => {
    const { base, fetcher } = setup(reset(), ok());
    expect((await fetcher(`${REST}/transactions`)).status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("gives up after three tries and reports the failure", async () => {
    const { base, fetcher } = setup(reset(), reset(), reset());
    await expect(fetcher(`${REST}/transactions`)).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("repeats the default-wallet RPC, which is safe to call twice", async () => {
    const { base, fetcher } = setup(reset(), ok());
    await fetcher(`${REST}/rpc/ensure_default_account`, { method: "POST", body: "{}" });
    expect(base).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["saving an entry", `${REST}/rpc/create_transaction`, "POST"],
    ["a batch", `${REST}/rpc/log_transactions_batch`, "POST"],
    ["a table insert", `${REST}/budgets`, "POST"],
    ["a table update", `${REST}/profiles`, "PATCH"],
    ["a delete", `${REST}/notifications`, "DELETE"],
  ])("never repeats a write: %s", async (_, url, method) => {
    const { base, fetcher } = setup(reset(), ok());
    await expect(fetcher(url, { method })).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("returns an HTTP error as it is: that's an answer, not a dropped connection", async () => {
    const { base, fetcher } = setup(new Response("{}", { status: 500 }), ok());
    expect((await fetcher(`${REST}/transactions`)).status).toBe(500);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("doesn't repeat a request the caller cancelled", async () => {
    const { base, fetcher } = setup(new DOMException("stopped", "AbortError"), ok());
    await expect(fetcher(`${REST}/transactions`)).rejects.toThrow("stopped");
    expect(base).toHaveBeenCalledTimes(1);
  });
});
