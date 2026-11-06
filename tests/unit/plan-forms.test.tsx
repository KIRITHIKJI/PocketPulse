import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BudgetFormDialog } from "@/components/plan/budget-form";
import { BillFormDialog } from "@/components/plan/due-forms";
import { RecurringFormDialog } from "@/components/plan/recurring-form";
import { GoalFormDialog } from "@/components/plan/goal-form";
import type { EntryKit } from "@/lib/data/entry-kit";
import type { FormState } from "@/lib/forms";

// A new-record form sends a client-generated id, and the action saves with an upsert on it. These
// run the real dialogs on one open page, as a user would: a second add has to be a second record,
// or it would overwrite the first with no error at all.

const calls = vi.hoisted(() => ({
  ids: [] as string[],
  reply: { status: "success" } as FormState,
}));

const action = vi.hoisted(() => async (_prev: FormState, formData: FormData) => {
  calls.ids.push(String(formData.get("id")));
  return { ...calls.reply, savedAt: calls.ids.length };
});

vi.mock("@/lib/actions/goals", () => ({ saveGoal: action }));
vi.mock("@/lib/actions/budgets", () => ({ saveBudget: action }));
vi.mock("@/lib/actions/recurring", () => ({ saveBill: action, saveRecurring: action }));

const kit = {
  currency: "INR",
  timeZone: "Asia/Kolkata",
  today: "2026-11-10",
  accounts: [],
  defaultAccountId: "",
  expenseTree: [],
  incomeTree: [],
  categories: [],
  rules: [],
  history: [],
} as unknown as EntryKit;

const FORMS = [
  ["goal", () => <GoalFormDialog today="2026-11-10" />, "Add goal", "Add goal"],
  [
    "budget",
    () => <BudgetFormDialog categories={[]} suggestions={[]} today="2026-11-10" />,
    "Add budget",
    "Add budget",
  ],
  ["bill", () => <BillFormDialog kit={kit} />, "Add a bill", "Add bill"],
  [
    "recurring item",
    () => <RecurringFormDialog kit={kit} />,
    "Add recurring",
    "Add recurring item",
  ],
] as const;

describe.each(FORMS)("adding a %s from an open page", (_, form, open, submit) => {
  beforeEach(() => {
    calls.ids.length = 0;
    calls.reply = { status: "success" };
  });

  async function add(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: open }));
    await user.click(await screen.findByRole("button", { name: submit }));
  }

  it("uses a new id for each add, so the second can't overwrite the first", async () => {
    const user = userEvent.setup();
    render(form());

    await add(user);
    await waitFor(() => expect(calls.ids).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await add(user);
    await waitFor(() => expect(calls.ids).toHaveLength(2));
    expect(calls.ids[1]).not.toBe(calls.ids[0]);
  });

  it("keeps the id when a failed save is sent again, so a retry can't add a second", async () => {
    calls.reply = { status: "error", message: "Couldn’t save." };
    const user = userEvent.setup();
    render(form());

    await add(user);
    await waitFor(() => expect(calls.ids).toHaveLength(1));
    await user.click(await screen.findByRole("button", { name: submit }));
    await waitFor(() => expect(calls.ids).toHaveLength(2));
    expect(calls.ids[1]).toBe(calls.ids[0]);
  });
});
