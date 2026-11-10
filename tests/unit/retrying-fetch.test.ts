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
    ["a table update", `${REST}/savings_goals?id=eq.1`, "PATCH"],
    ["a delete", `${REST}/category_rules?id=eq.1`, "DELETE"],
  ])("repeats %s, which sets an absolute state and is safe twice", async (_, url, method) => {
    const { base, fetcher } = setup(reset(), ok());
    expect((await fetcher(url, { method, body: "{}" })).status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("gives up on an update after three tries and reports the failure", async () => {
    const { base, fetcher } = setup(reset(), reset(), reset());
    await expect(fetcher(`${REST}/profiles`, { method: "PATCH" })).rejects.toThrow("fetch failed");
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("returns an update's HTTP error as it is", async () => {
    const { base, fetcher } = setup(new Response("{}", { status: 503 }), ok());
    expect((await fetcher(`${REST}/profiles`, { method: "PATCH" })).status).toBe(503);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["saving an entry", `${REST}/rpc/create_transaction`, "POST"],
    ["a batch", `${REST}/rpc/log_transactions_batch`, "POST"],
    ["a table insert", `${REST}/budgets`, "POST"],
    ["an upsert", `${REST}/commitments?on_conflict=id`, "POST"],
  ])("never repeats an insert or RPC: %s", async (_, url, method) => {
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
