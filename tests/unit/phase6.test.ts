import { type Category, categorySchema, parseEntries } from "@/domain";
import {
  AMOUNT_ISSUES,
  buildDrafts,
  clearIssues,
  commandFromDrafts,
  dateWordNote,
  draftOccurredAt,
  draftProblems,
  refreshSuggestion,
} from "@/lib/drafts";
import { formatLocalDate } from "@/lib/format";
import { inverseCommand, ledgerCommandSchema, toRpcCall } from "@/lib/ledger/commands";

import { BUS, CASH, FOOD, OWNER, SNACKS, TEA, TRANSPORT, id } from "./domain/fixtures";

const TODAY = "2026-11-04";
const TZ = "Asia/Kolkata";
const money = (paise: number) => `₹${paise / 100}`;

const category = (categoryId: string, name: string, parentId: string | null = null): Category =>
  categorySchema.parse({ id: categoryId, ownerId: OWNER, name, parentId, kind: "expense" });

const context = {
  categories: [
    category(FOOD, "Food & Drinks"),
    category(TEA, "Tea", FOOD),
    category(SNACKS, "Snacks", FOOD),
    category(TRANSPORT, "Transport"),
    category(BUS, "Bus", TRANSPORT),
  ],
  rules: [],
  history: [],
};

let n = 0;
const nextId = () => id(6000 + ++n);
const draftsFor = (text: string) => buildDrafts(parseEntries(text, TODAY), context, nextId);

describe("review drafts", () => {
  it("suggests a category with its reason, and marks unknown items unassigned", () => {
    const [tea, odd] = draftsFor("tea 15, xyzzy 40");
    expect(tea).toMatchObject({
      description: "Tea",
      amountText: "15",
      category: { categoryId: FOOD, subcategoryId: TEA },
      suggestionReason: "Matched the word “tea”",
      categoryPicked: false,
    });
    expect(odd).toMatchObject({ description: "Xyzzy", category: null, suggestionReason: null });
    // Uncategorized isn't a problem: it's saved and waits in the queue.
    expect(draftProblems(odd!, TODAY, money)).toEqual([]);
  });

  it("gives every draft its own id", () => {
    const ids = draftsFor("tea 15, bus 20, snacks 35").map((d) => d.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("re-suggests when the words change, but never overrides the user's own pick", () => {
    const [draft] = draftsFor("xyzzy 40");
    const renamed = refreshSuggestion({ ...draft!, description: "bus to college" }, context);
    expect(renamed.category).toEqual({ categoryId: TRANSPORT, subcategoryId: BUS });

    const picked = { ...draft!, category: { categoryId: FOOD, subcategoryId: null } };
    const kept = refreshSuggestion(
      { ...picked, categoryPicked: true, description: "bus to college" },
      context,
    );
    expect(kept.category).toEqual({ categoryId: FOOD, subcategoryId: null });
  });

  it("blocks saving until doubts are answered, and shows what to answer", () => {
    const problem = (text: string) => draftProblems(draftsFor(text)[0]!, TODAY, money);
    expect(problem("tea")[0]!.message).toBe("Enter the amount.");
    expect(problem("tea 15.555")[0]!.message).toBe("Enter the amount.");
    expect(problem("2 samosa 30")[0]).toMatchObject({
      message: "There are several numbers here. Is ₹30 the price?",
      confirm: { clears: "ambiguous_amount" },
    });
    expect(problem("tea $5")[0]!.confirm?.clears).toBe("other_currency");
    expect(problem("tea 15 tomorrow")[0]!.message).toMatch(/future/);
    expect(problem("refund 50 for shoes")[0]!.confirm?.clears).toBe("needs_full_form");
  });

  it("asks about an item with no amount of its own, and offers the one-tap answer", () => {
    const [draft] = draftsFor("tea 15 bus");
    const problems = draftProblems(draft!, TODAY, money);
    expect(problems[0]).toMatchObject({
      message:
        "Is ₹15 for all of “Tea bus”? If these are separate, go back and give each one its own amount.",
      confirm: { label: "Yes, ₹15", clears: "unclear_item" },
    });
    expect(draftProblems(clearIssues(draft!, ["unclear_item"]), TODAY, money)).toEqual([]);
    expect(draftProblems(clearIssues(draft!, AMOUNT_ISSUES), TODAY, money)).toEqual([]);
  });

  it("clears a doubt once the user answers it", () => {
    const [draft] = draftsFor("2 samosa 30");
    expect(draftProblems(clearIssues(draft!, ["ambiguous_amount"]), TODAY, money)).toEqual([]);
    const [foreign] = draftsFor("tea $5");
    const edited = clearIssues({ ...foreign!, amountText: "400" }, AMOUNT_ISSUES);
    expect(draftProblems(edited, TODAY, money)).toEqual([]);
  });

  it("still refuses an invalid amount or date typed during review", () => {
    const [draft] = draftsFor("tea 15");
    expect(draftProblems({ ...draft!, amountText: "abc" }, TODAY, money)).toHaveLength(1);
    expect(draftProblems({ ...draft!, date: "2026-11-05" }, TODAY, money)[0]!.message).toMatch(
      /future/,
    );
    expect(draftProblems({ ...draft!, date: "" }, TODAY, money)[0]!.message).toBe(
      "Choose a valid date.",
    );
  });

  it("shows the day kal and parso were read as, without blocking the save", () => {
    const note = (text: string) => {
      const draft = draftsFor(text)[0]!;
      expect(draftProblems(draft, TODAY, money)).toEqual([]);
      return dateWordNote(draft, formatLocalDate);
    };
    expect(note("kal tea 15")).toBe(
      "“kal” is read as yesterday, 3 Nov 2026. Change the date if you meant another day.",
    );
    expect(note("parso tea 15")).toBe(
      "“parso” is read as the day before yesterday, 2 Nov 2026. Change the date if you meant another day.",
    );
    expect(note("aaj tea 15")).toBeNull();
    expect(note("tea 15 yesterday")).toBeNull();
  });

  it("names the real day, on today's date as well as the fixture's", () => {
    const draft = buildDrafts(parseEntries("kal tea 15", "2026-11-01"), context, nextId)[0]!;
    expect(dateWordNote(draft, formatLocalDate)).toBe(
      "“kal” is read as yesterday, 31 Oct 2026. Change the date if you meant another day.",
    );
  });

  it("drops the note once the user sets the date themselves", () => {
    const [draft] = draftsFor("kal tea 15");
    expect(
      dateWordNote({ ...draft!, date: "2026-11-01", dateWord: null }, formatLocalDate),
    ).toBeNull();
  });

  it("dates today's entries now and earlier ones at midday in the user's timezone", () => {
    const now = "2026-11-04T10:00:00.000Z";
    expect(draftOccurredAt(TODAY, TODAY, now, TZ)).toBe(now);
    expect(draftOccurredAt("2026-11-03", TODAY, now, TZ)).toBe("2026-11-03T06:30:00.000Z");
  });
});

describe("batch command", () => {
  const build = (text: string, source: "parsed_text" | "voice" = "parsed_text") =>
    ledgerCommandSchema.parse(
      commandFromDrafts({
        drafts: draftsFor(text),
        opId: id(6500),
        accountId: CASH,
        currency: "INR",
        source,
        today: TODAY,
        confirmedAt: "2026-11-04T10:00:00.000Z",
        timeZone: TZ,
      }),
    );

  it("maps to the atomic RPC with the opId as batch id and exact paise", () => {
    const call = toRpcCall(build("tea 15.50, bus 20", "voice"));
    expect(call.fn).toBe("log_transactions_batch");
    expect(call.args.p_batch_id).toBe(id(6500));
    const items = call.args.p_items as Record<string, unknown>[];
    expect(items.map((i) => [i.amount_paise, i.type, i.source])).toEqual([
      [1550, "expense", "voice"],
      [2000, "expense", "voice"],
    ]);
    for (const item of items) {
      expect(item.idempotency_key).toBe(item.id);
      expect(item).not.toHaveProperty("owner_id");
    }
  });

  it("is undone by one command that names the batch", () => {
    const command = build("tea 15, bus 20");
    const undo = inverseCommand(command, null, null, id(6501));
    expect(undo).toEqual({ kind: "undo_batch", opId: id(6501), batchId: id(6500) });
    // One RPC, carrying the undo's own op id so that a retry is recognised.
    expect(toRpcCall(undo!)).toEqual({
      fn: "undo_transactions_batch",
      args: { p_op_id: id(6501), p_batch_id: id(6500) },
    });
    expect(inverseCommand(undo!, null, null, id(6502))).toBeNull();
  });

  it("rejects transfers, repeated ids, empty and oversized batches", () => {
    const command = build("tea 15, bus 20");
    if (command.kind !== "batch") throw new Error("expected a batch");
    const [first, second] = command.drafts;
    const accepts = (drafts: unknown[]) =>
      ledgerCommandSchema.safeParse({ ...command, drafts }).success;
    expect(accepts([first, second])).toBe(true);
    expect(accepts([])).toBe(false);
    expect(accepts([first, first])).toBe(false);
    expect(accepts(Array.from({ length: 51 }, (_, i) => ({ ...first, id: id(7000 + i) })))).toBe(
      false,
    );
    expect(accepts([{ ...first, type: "refund", refundOfId: id(1) }])).toBe(false);
  });
});

describe("the date note for a spoken call", () => {
  it("says what was heard, which day it became, and that it can change", () => {
    const [draft] = buildDrafts(
      parseEntries("call chai 15", "2026-11-04", { spoken: true }),
      { categories: [], rules: [], history: [] },
      () => "00000000-0000-4000-8000-000000000001",
    );
    expect(draft!.date).toBe("2026-11-03");
    expect(dateWordNote(draft!, (date) => date)).toBe(
      "We heard “call” and read it as “kal”, yesterday, 2026-11-03. Change the date if you meant another day.",
    );
  });
});
