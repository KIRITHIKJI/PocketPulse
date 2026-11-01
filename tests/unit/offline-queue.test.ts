import "fake-indexeddb/auto";

import { type LedgerCommand, type LedgerRecord, inverseCommand } from "@/lib/ledger/commands";
import { commandKeys, commandLabel, commandAmount } from "@/lib/offline/ops";
import {
  type SendResult,
  claimNext,
  discardOp,
  enqueue,
  flushQueue,
  forgetOwner,
  listOps,
  offlineDb,
  replaceOp,
  retryDelay,
  retryOp,
} from "@/lib/offline/queue";
import { resolutionCommands, resolutionsFor } from "@/lib/offline/resolve";
import { toSendResult } from "@/lib/offline/transport";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
const WALLET = "aaaaaaaa-0000-4000-8000-0000000000c1";
const FOOD = "aaaaaaaa-0000-4000-8000-0000000000f0";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function create(n: number, amountPaise = 1500): Extract<LedgerCommand, { kind: "create" }> {
  return {
    kind: "create",
    opId: id(1000 + n),
    draft: {
      id: id(n),
      type: "expense",
      amountPaise,
      currency: "INR",
      occurredAt: "2026-11-01T10:00:00.000Z",
      accountId: WALLET,
      fromAccountId: null,
      toAccountId: null,
      refundOfId: null,
      categoryId: FOOD,
      subcategoryId: null,
      description: `Entry ${n}`,
      merchant: null,
      note: null,
      tags: [],
      source: "quick_add",
      presetId: null,
    },
  };
}

function edit(n: number, entry: number, expectedVersion = 1): LedgerCommand {
  return {
    kind: "update",
    opId: id(2000 + n),
    id: id(entry),
    expectedVersion,
    patch: { amountPaise: 2500 },
  };
}

const record = (over: Partial<LedgerRecord> = {}) =>
  ({
    ...create(1).draft,
    version: 4,
    deletedAt: null,
    ...over,
  }) as unknown as LedgerRecord;

/** A server that keeps entries by id, as the real one does, and can lose its answers. */
function fakeServer() {
  const rows = new Map<string, number>();
  const sent: string[] = [];
  return {
    rows,
    sent,
    send: async (op: { command: LedgerCommand }): Promise<SendResult> => {
      sent.push(op.command.opId);
      if (op.command.kind === "create") {
        rows.set(op.command.draft.id, op.command.draft.amountPaise);
      }
      return { kind: "synced" };
    },
  };
}

beforeEach(async () => {
  await offlineDb().ops.clear();
});

describe("the offline queue", () => {
  it("keeps an entry with its ids until the server has answered", async () => {
    const command = create(1);
    await enqueue(ME, command);
    const [op] = await listOps(ME);
    expect(op).toMatchObject({ opId: command.opId, status: "pending", label: "Entry 1" });
    expect(op!.command).toEqual(command);
  });

  it("survives a closed tab: a new connection to the database still sees it", async () => {
    await enqueue(ME, create(1));
    offlineDb().close();
    await offlineDb().open();
    expect(await listOps(ME)).toHaveLength(1);
  });

  it("ignores a double tap: the same opId is queued once", async () => {
    await enqueue(ME, create(1));
    await enqueue(ME, create(1));
    expect(await listOps(ME)).toHaveLength(1);
  });

  it("sends in the order entries were made, once each", async () => {
    const server = fakeServer();
    await enqueue(ME, create(1));
    await enqueue(ME, create(2));
    await enqueue(ME, create(3));
    expect(await flushQueue(ME, server.send)).toEqual({ synced: 3, stopped: null });
    expect(server.sent).toEqual([id(1001), id(1002), id(1003)]);
    expect((await listOps(ME)).every((op) => op.status === "synced")).toBe(true);
    await flushQueue(ME, server.send);
    expect(server.sent).toHaveLength(3);
  });

  it("a lost answer sends the same ids again, so the server ends with one row", async () => {
    const server = fakeServer();
    await enqueue(ME, create(1));
    const lost = async (op: { command: LedgerCommand }) => {
      await server.send(op);
      throw new TypeError("Failed to fetch");
    };
    expect(await flushQueue(ME, lost)).toEqual({ synced: 0, stopped: "unreachable" });
    const [waiting] = await listOps(ME);
    expect(waiting).toMatchObject({ status: "pending", attempts: 1 });

    await flushQueue(ME, server.send, { force: true });
    expect(server.sent).toEqual([id(1001), id(1001)]);
    expect(server.rows.size).toBe(1);
  });

  it("backs off after a failed send, and doubles up to a limit", async () => {
    let now = 1_000_000;
    await enqueue(ME, create(1));
    await flushQueue(ME, async () => ({ kind: "retry" }), { now: () => now });
    expect(await claimNext(ME, now + retryDelay(1) - 1)).toBeNull();
    now += retryDelay(1);
    expect(await claimNext(ME, now)).not.toBeNull();
    expect(retryDelay(1)).toBe(5_000);
    expect(retryDelay(2)).toBe(10_000);
    expect(retryDelay(50)).toBe(300_000);
  });

  it("stops at an unreachable server and keeps everything behind it", async () => {
    await enqueue(ME, create(1));
    await enqueue(ME, create(2));
    const seen: string[] = [];
    await flushQueue(ME, async (op) => {
      seen.push(op.opId);
      return { kind: "retry" };
    });
    expect(seen).toEqual([id(1001)]);
    expect((await listOps(ME)).map((op) => op.status)).toEqual(["pending", "pending"]);
  });

  it("a lost session stops the run but costs the entry nothing", async () => {
    await enqueue(ME, create(1));
    const result = await flushQueue(ME, async () => ({ kind: "signed_out" }));
    expect(result.stopped).toBe("signed_out");
    expect(await listOps(ME)).toMatchObject([{ status: "pending", attempts: 0 }]);
    expect(await claimNext(ME)).not.toBeNull();
  });

  it("a refused entry doesn't stop the others", async () => {
    await enqueue(ME, create(1));
    await enqueue(ME, create(2));
    const server = fakeServer();
    const result = await flushQueue(ME, async (op) =>
      op.opId === id(1001) ? { kind: "failed", message: "No." } : server.send(op),
    );
    expect(result).toEqual({ synced: 1, stopped: null });
    expect((await listOps(ME)).map((op) => [op.status, op.message])).toEqual([
      ["failed", "No."],
      ["synced", null],
    ]);
  });

  it("holds back later operations on a record that's stuck, and only those", async () => {
    await enqueue(ME, create(1));
    await enqueue(ME, edit(1, 1));
    await enqueue(ME, create(2));
    const sent: string[] = [];
    await flushQueue(ME, async (op) => {
      sent.push(op.opId);
      return op.opId === id(1001)
        ? { kind: "conflict", message: "Stuck.", reason: "different_content", record: null }
        : { kind: "synced" };
    });
    expect(sent).toEqual([id(1001), id(1002)]);
    expect((await listOps(ME)).map((op) => op.status)).toEqual(["conflict", "pending", "synced"]);
  });

  it("a claim can't be taken twice, but expires if its tab died", async () => {
    await enqueue(ME, create(1));
    const now = 5_000_000;
    expect(await claimNext(ME, now)).not.toBeNull();
    expect(await claimNext(ME, now + 1)).toBeNull();
    expect(await claimNext(ME, now + 60_000)).toMatchObject({ opId: id(1001) });
  });

  it("two runs at once send an entry once", async () => {
    const server = fakeServer();
    await enqueue(ME, create(1));
    await enqueue(ME, create(2));
    await Promise.all([flushQueue(ME, server.send), flushQueue(ME, server.send)]);
    expect([...server.sent].sort()).toEqual([id(1001), id(1002)]);
  });

  it("never lists or sends another account's entries", async () => {
    const server = fakeServer();
    await enqueue(OTHER, create(1));
    expect(await listOps(ME)).toEqual([]);
    await flushQueue(ME, server.send);
    expect(server.sent).toEqual([]);
    await flushQueue(OTHER, server.send);
    expect(server.sent).toHaveLength(1);
  });

  it("keeps a short history of synced entries", async () => {
    const server = fakeServer();
    for (let n = 1; n <= 25; n++) await enqueue(ME, create(n));
    await flushQueue(ME, server.send);
    const left = await listOps(ME);
    expect(left).toHaveLength(20);
    expect(left.at(-1)!.opId).toBe(id(1025));
  });

  it("retries a failed entry with the same ids", async () => {
    await enqueue(ME, create(1));
    await flushQueue(ME, async () => ({ kind: "failed", message: "No." }));
    await retryOp(id(1001));
    const [op] = await listOps(ME);
    expect(op).toMatchObject({ status: "pending", message: null, nextAttemptAt: 0 });
    expect(op!.command).toEqual(create(1));
  });

  it("can drop an entry nothing has seen", async () => {
    await enqueue(ME, create(1));
    expect(await discardOp(id(1001))).toBe(true);
    expect(await listOps(ME)).toEqual([]);
  });

  it("won't drop one that may already be on the server", async () => {
    await enqueue(ME, create(1));
    await flushQueue(ME, async () => ({ kind: "retry" }));
    expect(await discardOp(id(1001))).toBe(false);
    await flushQueue(ME, async () => ({ kind: "synced" }), { force: true });
    expect(await discardOp(id(1001))).toBe(false);
    expect(await listOps(ME)).toHaveLength(1);
  });

  it("won't drop one that's being sent", async () => {
    await enqueue(ME, create(1));
    await claimNext(ME);
    expect(await discardOp(id(1001))).toBe(false);
  });

  it("an edit before syncing replaces the entry in its place", async () => {
    await enqueue(ME, create(1));
    await enqueue(ME, create(2));
    await replaceOp(id(1001), create(1, 9900));
    const ops = await listOps(ME);
    expect(ops.map((op) => [op.opId, op.amountPaise])).toEqual([
      [id(1001), 9900],
      [id(1002), 1500],
    ]);
  });

  it("clears only the deleted account's queue", async () => {
    await enqueue(ME, create(1));
    await enqueue(OTHER, create(2));
    await forgetOwner(ME);
    expect(await listOps(ME)).toEqual([]);
    expect(await listOps(OTHER)).toHaveLength(1);
  });
});

describe("what a command touches", () => {
  it("links a refund to the expense it depends on", () => {
    const refund = create(5);
    const command: LedgerCommand = {
      ...refund,
      draft: { ...refund.draft, type: "refund", refundOfId: id(1) },
    };
    expect(commandKeys(command)).toEqual([id(5), id(1)]);
  });

  it("keeps goal money in order on its goal", () => {
    const move: LedgerCommand = {
      kind: "goal_move",
      opId: id(1),
      id: id(2),
      goalId: id(3),
      moveType: "allocation",
      amountPaise: 100,
      occurredAt: "2026-11-01T10:00:00.000Z",
      note: null,
    };
    expect(commandKeys(move)).toContain(id(3));
  });

  it("describes batches and edits", () => {
    const batch: LedgerCommand = {
      kind: "batch",
      opId: id(1),
      drafts: [create(1).draft, create(2, 500).draft],
    };
    expect(commandLabel(batch)).toBe("2 entries");
    expect(commandAmount(batch)).toEqual({ amountPaise: 2000, currency: "INR" });
    expect(commandLabel(edit(1, 1))).toBe("Change to an entry");
  });
});

describe("the server's answer", () => {
  it.each([
    [{ ok: true, status: "applied", id: null, undo: null }, "synced"],
    [{ ok: true, status: "duplicate", id: null, undo: null }, "synced"],
    [{ ok: false, status: "conflict", message: "x" }, "conflict"],
    [{ ok: false, status: "not_found", message: "x" }, "conflict"],
    [{ ok: false, status: "rejected", message: "x" }, "failed"],
    [{ ok: false, status: "invalid", message: "x" }, "failed"],
    [{ ok: false, status: "rejected", message: "x", retryable: true }, "retry"],
  ] as const)("%o is %s", (response, kind) => {
    expect(toSendResult(response).kind).toBe(kind);
  });
});

describe("resolving a conflict", () => {
  const stuck = async (command: LedgerCommand, serverRecord: LedgerRecord | null) => {
    const op = await enqueue(ME, command);
    await flushQueue(ME, async () => ({
      kind: "conflict",
      message: "Changed elsewhere.",
      reason: "stale_version",
      record: serverRecord,
    }));
    return (await listOps(ME)).find((o) => o.opId === op.opId)!;
  };
  const keys = (op: Parameters<typeof resolutionsFor>[0]) =>
    resolutionsFor(op).map((resolution) => resolution.key);

  it("my edit over a newer one quotes the newest version, only if I choose it", async () => {
    const op = await stuck(edit(1, 1), record({ version: 7 }));
    expect(keys(op)).toEqual(["keep_mine", "discard"]);
    const { command, then } = resolutionCommands(op, "keep_mine")!;
    expect(command).toMatchObject({
      kind: "update",
      expectedVersion: 7,
      patch: { amountPaise: 2500 },
    });
    expect(command.opId).not.toBe(op.opId);
    expect(then).toEqual([]);
  });

  it("an edit of an entry deleted elsewhere can bring it back, in that order", async () => {
    const op = await stuck(
      edit(1, 1),
      record({ version: 3, deletedAt: "2026-11-01T11:00:00.000Z" }),
    );
    expect(keys(op)).toEqual(["restore_with_mine", "discard"]);
    const { command, then } = resolutionCommands(op, "restore_with_mine")!;
    expect(command).toMatchObject({ kind: "restore", id: id(1) });
    expect(then).toMatchObject([{ kind: "update", expectedVersion: 4 }]);
    await replaceOp(op.opId, command, {}, then);
    expect((await listOps(ME)).map((o) => o.command.kind)).toEqual(["restore", "update"]);
  });

  it("a delete of an entry changed elsewhere asks before it goes", async () => {
    const op = await stuck(
      { kind: "delete", opId: id(30), id: id(1), expectedVersion: 1 },
      record({ version: 2 }),
    );
    expect(keys(op)).toEqual(["delete_anyway", "discard"]);
    expect(resolutionCommands(op, "delete_anyway")!.command).toMatchObject({
      kind: "delete",
      expectedVersion: 2,
    });
  });

  it("a bill paid elsewhere can still be kept as a separate entry, with new ids", async () => {
    const paid: LedgerCommand = {
      kind: "pay_commitment",
      opId: id(40),
      commitmentId: id(41),
      draft: create(1).draft,
    };
    const op = await stuck(paid, null);
    expect(keys(op)).toEqual(["save_separately", "discard"]);
    const { command } = resolutionCommands(op, "save_separately")!;
    expect(command).toMatchObject({ kind: "create", draft: { amountPaise: 1500 } });
    if (command.kind !== "create") throw new Error("expected a create");
    expect(command.draft.id).not.toBe(id(1));
  });

  it("a batch saved separately becomes one entry each", async () => {
    const batch: LedgerCommand = {
      kind: "batch",
      opId: id(50),
      drafts: [create(1).draft, create(2).draft],
    };
    const op = await stuck(batch, null);
    const { command, then } = resolutionCommands(op, "save_separately")!;
    expect([command, ...then].map((c) => c.kind)).toEqual(["create", "create"]);
  });

  it("an entry that's gone can only be discarded, and only by choice", async () => {
    const op = await stuck(edit(1, 1), null);
    expect(keys(op)).toEqual(["discard"]);
    expect(await listOps(ME)).toHaveLength(1);
  });
});

describe("undo of a queued operation", () => {
  it("is the normal inverse when it has already gone", () => {
    expect(inverseCommand(create(1), null, null, id(9))).toEqual({
      kind: "delete",
      opId: id(9),
      id: id(1),
    });
  });
});
