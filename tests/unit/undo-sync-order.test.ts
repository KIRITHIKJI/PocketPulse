import { runLedgerCommand } from "@/lib/actions/transactions";

// Design 3: an Undo (a delete) syncs rewards after its delete finishes and before it answers, so
// the screen it re-renders never shows XP that was just taken back. A save answers at once.

const events = vi.hoisted(() => [] as string[]);
const executeLedgerCommand = vi.hoisted(() => vi.fn());
const syncRewards = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn(() => events.push("re-render")));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/data/session", () => ({
  requireSession: async () => ({ supabase: {}, userId: "u1" }),
  requestNow: () => 0,
}));
vi.mock("@/lib/data/queries", () => ({ getProfile: vi.fn() }));
vi.mock("@/lib/ledger/execute", () => ({ executeLedgerCommand }));
vi.mock("@/lib/rewards/sync", () => ({ syncRewards }));

const ENTRY = "00000000-0000-4000-8000-000000000001";
const OP = "00000000-0000-4000-8000-000000000002";
const del = { kind: "delete", opId: OP, id: ENTRY };
const create = {
  kind: "create",
  opId: OP,
  draft: {
    id: ENTRY,
    type: "expense",
    amountPaise: 1_500,
    currency: "INR",
    occurredAt: "2026-11-06T10:00:00.000Z",
    accountId: "00000000-0000-4000-8000-0000000000c1",
    categoryId: "00000000-0000-4000-8000-0000000000f1",
    description: "Tea",
  },
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

beforeEach(() => {
  events.length = 0;
  executeLedgerCommand.mockReset().mockImplementation(async () => {
    await tick();
    events.push("deleted");
    return { ok: true, status: "applied", undo: null };
  });
  syncRewards.mockReset().mockImplementation(async () => {
    events.push("sync started");
    await tick();
    events.push("sync done");
    return {
      state: {
        events: [{ xp: 10, revokedAt: "2026-11-06T10:01:00.000Z" }],
        achievements: [],
        quests: [],
      },
      streaks: { currentDaily: 0 },
    };
  });
});

describe("Undo and the reward sync", () => {
  it("the sync starts after the delete finishes and ends before the answer", async () => {
    const result = await runLedgerCommand(del);
    events.push("answered");
    expect(events).toEqual(["deleted", "sync started", "sync done", "re-render", "answered"]);
    // The answer carries the status with the revoked XP already gone.
    expect(result).toMatchObject({ ok: true, rewards: { xp: 0, level: 1 } });
  });

  it("a failed delete runs no sync", async () => {
    executeLedgerCommand.mockResolvedValue({ ok: false, status: "conflict", message: "Changed" });
    const result = await runLedgerCommand(del);
    expect(result.ok).toBe(false);
    expect(syncRewards).not.toHaveBeenCalled();
  });

  it("a failed sync still answers that the delete worked", async () => {
    syncRewards.mockRejectedValue(new Error("network"));
    const result = await runLedgerCommand(del);
    expect(result).toMatchObject({ ok: true, status: "applied" });
    expect(result.ok && result.rewards).toBeUndefined();
  });

  it("a save never waits for rewards: the client asks for its feedback afterwards", async () => {
    executeLedgerCommand.mockResolvedValue({ ok: true, status: "applied", undo: null });
    const result = await runLedgerCommand(create);
    expect(result).toMatchObject({ ok: true, status: "applied" });
    expect(syncRewards).not.toHaveBeenCalled();
  });
});
