import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "@/components/feedback/toast";
import { QuickAdd } from "@/components/transactions/quick-add";
import type { EntryKit } from "@/lib/data/entry-kit";
import type { LedgerCommand } from "@/lib/ledger/commands";
import { DOUBLE_TAP_MS, type QuickEntry, idsForTap, savesInOneTap } from "@/lib/quick-entries";
import { dropIndex, moveItem } from "@/lib/reorder";

const runLedgerCommand = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/transactions", () => ({ runLedgerCommand, saveQuickAdd: vi.fn() }));
vi.mock("@/components/offline/offline-provider", () => ({
  useOffline: () => ({ enqueue: vi.fn(), mustFollowQueue: () => false }),
}));
vi.mock("@/lib/offline/pwa", () => ({ savePagesSoon: vi.fn() }));

const CASH = "00000000-0000-4000-8000-0000000000c1";
const FOOD = "00000000-0000-4000-8000-0000000000f1";

const tile = (over: Partial<QuickEntry> = {}): QuickEntry => ({
  key: "tea",
  presetId: "00000000-0000-4000-8000-000000000071",
  groupPresetId: "00000000-0000-4000-8000-000000000071",
  title: "Tea",
  icon: null,
  color: null,
  amountPaise: 1_500,
  categoryId: FOOD,
  subcategoryId: null,
  accountId: null,
  description: "Tea",
  merchant: null,
  askDetails: false,
  ...over,
});

const kit = {
  currency: "INR",
  timeZone: "Asia/Kolkata",
  today: "2026-11-06",
  accounts: [],
  defaultAccountId: CASH,
  expenseTree: [],
  incomeTree: [],
  categories: [],
  rules: [],
  history: [],
} as unknown as EntryKit;

describe("one-tap rules", () => {
  it("only a tile with an amount and a category saves in one tap", () => {
    expect(savesInOneTap(tile())).toBe(true);
    expect(savesInOneTap(tile({ amountPaise: null }))).toBe(false);
    expect(savesInOneTap(tile({ categoryId: null, askDetails: true }))).toBe(false);
  });

  it("a tap within the double-tap window reuses the ids; a later one is a new entry", () => {
    let n = 0;
    const id = () => `id-${++n}`;
    const first = idsForTap(null, id, 1_000);
    const double = idsForTap(first, id, 1_000 + DOUBLE_TAP_MS - 1);
    expect(double).toMatchObject({ id: first.id, opId: first.opId });
    const later = idsForTap(double, id, 1_000 + 2 * DOUBLE_TAP_MS);
    expect(later.id).not.toBe(first.id);
    expect(later.opId).not.toBe(first.opId);
  });
});

describe("reordering", () => {
  it("moves an item and clamps the target", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 1, 9)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("drops a dragged row where the pointer is", () => {
    const middles = [10, 30, 50, 70];
    expect(dropIndex(middles, 0, 5)).toBe(0);
    expect(dropIndex(middles, 0, 55)).toBe(2);
    expect(dropIndex(middles, 3, 15)).toBe(1);
    expect(dropIndex(middles, 1, 100)).toBe(3);
  });
});

describe("QuickAdd tiles", () => {
  beforeEach(() => {
    runLedgerCommand.mockReset();
    runLedgerCommand.mockImplementation(async (command: LedgerCommand) => ({
      ok: true,
      status: "applied",
      id: command.kind === "create" ? command.draft.id : null,
      undo:
        command.kind === "create" ? { kind: "delete", opId: "undo", id: command.draft.id } : null,
    }));
  });

  const renderTiles = (tiles: QuickEntry[]) =>
    render(
      <ToastProvider>
        <QuickAdd kit={kit} tiles={tiles} shortcuts={[]} />
      </ToastProvider>,
    );

  it("a tile with a usual amount saves in one tap, with Undo", async () => {
    const user = userEvent.setup();
    renderTiles([tile()]);
    await user.click(screen.getByRole("button", { name: /^Tea, ₹15\. Saves in one tap/ }));
    expect(runLedgerCommand).toHaveBeenCalledOnce();
    const command = runLedgerCommand.mock.calls[0]![0] as LedgerCommand;
    expect(command).toMatchObject({
      kind: "create",
      draft: { amountPaise: 1_500, categoryId: FOOD, accountId: CASH, source: "quick_add" },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Saved ₹15 · Tea");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("a fast double tap sends the same ids, so the server can't save two", async () => {
    const user = userEvent.setup();
    renderTiles([tile()]);
    const button = screen.getByRole("button", { name: /^Tea,/ });
    await user.dblClick(button);
    const sent = runLedgerCommand.mock.calls.map((c) => c[0] as LedgerCommand);
    expect(sent.length).toBeGreaterThanOrEqual(1);
    const ids = new Set(sent.map((c) => (c.kind === "create" ? c.draft.id : null)));
    const ops = new Set(sent.map((c) => c.opId));
    expect(ids.size).toBe(1);
    expect(ops.size).toBe(1);
  });

  it("Undo for a one-tap save lasts 5 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderTiles([tile()]);
      await user.click(screen.getByRole("button", { name: /^Tea,/ }));
      await screen.findByTestId("toast");
      act(() => vi.advanceTimersByTime(4_900));
      expect(screen.getByTestId("toast")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByTestId("toast")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a tile without an amount opens the sheet and offers to save it as the usual amount", async () => {
    const user = userEvent.setup();
    renderTiles([tile({ amountPaise: null })]);
    await user.click(screen.getByRole("button", { name: "Tea. Set the amount" }));
    expect(runLedgerCommand).not.toHaveBeenCalled();
    const sheet = screen.getByRole("dialog");
    await user.type(screen.getByLabelText("Amount"), "15");
    expect(sheet).toHaveTextContent("Save ₹15 as the usual amount for Tea");
  });

  it("the pencil opens the sheet even for a one-tap tile", async () => {
    const user = userEvent.setup();
    renderTiles([tile()]);
    await user.click(screen.getByRole("button", { name: "Change the amount for Tea" }));
    expect(runLedgerCommand).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("15");
  });
});
