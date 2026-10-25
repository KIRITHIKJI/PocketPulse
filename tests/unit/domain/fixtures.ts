import {
  type Account,
  type Commitment,
  type SavingsGoal,
  type Transaction,
  type TransactionInput,
  accountSchema,
  commitmentSchema,
  savingsGoalSchema,
  transactionSchema,
} from "@/domain";

/** Deterministic valid v4 UUIDs: id(1) → 00000000-0000-4000-8000-000000000001. */
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const OWNER = id(9000);
export const OTHER_OWNER = id(9001);
export const CASH = id(100);
export const BANK = id(101);
export const UPI = id(102);
export const FOOD = id(200);
export const TEA = id(201);
export const SNACKS = id(202);
export const TRANSPORT = id(210);
export const BUS = id(211);
export const LAPTOP_GOAL = id(300);
export const TRIP_GOAL = id(301);

/** An IST wall-clock time as an ISO string, e.g. ist("2026-10-05", "09:30"). */
export const ist = (date: string, time = "12:00") => `${date}T${time}:00+05:30`;
/** The same instant as epoch ms. */
export const istMs = (date: string, time = "12:00") => Date.parse(ist(date, time));

const STAMP = "2026-10-01T00:00:00+05:30";
let seq = 1;

type Common = Partial<
  Pick<
    TransactionInput,
    | "id"
    | "occurredAt"
    | "description"
    | "merchant"
    | "note"
    | "tags"
    | "source"
    | "deletedAt"
    | "voidedAt"
  >
>;

function build(fields: Record<string, unknown>): Transaction {
  return transactionSchema.parse({
    id: id(seq++),
    ownerId: OWNER,
    currency: "INR",
    occurredAt: ist("2026-10-05"),
    createdAt: STAMP,
    updatedAt: STAMP,
    ...fields,
  });
}

interface Categorised extends Common {
  accountId?: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
}

export const income = (amountPaise: number, o: Categorised = {}) =>
  build({ type: "income", amountPaise, accountId: CASH, ...o });

export const expense = (amountPaise: number, o: Categorised = {}) =>
  build({ type: "expense", amountPaise, accountId: CASH, categoryId: FOOD, ...o });

export const refund = (amountPaise: number, refundOfId: string, o: Categorised = {}) =>
  build({ type: "refund", amountPaise, accountId: CASH, refundOfId, ...o });

export const transfer = (
  amountPaise: number,
  fromAccountId: string,
  toAccountId: string,
  o: Common = {},
) => build({ type: "transfer", amountPaise, fromAccountId, toAccountId, ...o });

export const allocate = (amountPaise: number, goalId = LAPTOP_GOAL, o: Common = {}) =>
  build({ type: "allocation", amountPaise, goalId, ...o });

export const release = (amountPaise: number, goalId = LAPTOP_GOAL, o: Common = {}) =>
  build({ type: "allocation_release", amountPaise, goalId, ...o });

export const account = (
  accountId: string,
  openingBalancePaise: number,
  openingBalanceDate = "2026-10-01",
  name = "Wallet",
): Account =>
  accountSchema.parse({
    id: accountId,
    ownerId: OWNER,
    name,
    openingBalancePaise,
    openingBalanceDate,
  });

export const goal = (
  goalId: string,
  targetPaise: number,
  targetDate: string | null = null,
): SavingsGoal =>
  savingsGoalSchema.parse({ id: goalId, ownerId: OWNER, title: "Laptop", targetPaise, targetDate });

export const commitment = (
  amountPaise: number,
  dueDate: string,
  o: Partial<Pick<Commitment, "id" | "paidTransactionId" | "cancelledAt">> = {},
): Commitment =>
  commitmentSchema.parse({
    id: id(seq++),
    ownerId: OWNER,
    title: "Bill",
    amountPaise,
    dueDate,
    ...o,
  });
