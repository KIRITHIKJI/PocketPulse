/** Wallet/account form schemas. Opening balances may be zero or negative (overdrawn). */
import { z } from "zod";

import { ACCOUNT_KINDS } from "@/domain";
import { balanceField, dateField } from "@/lib/forms";

export const ACCOUNT_KIND_LABELS: Record<(typeof ACCOUNT_KINDS)[number], string> = {
  cash: "Cash",
  bank: "Bank account",
  upi_wallet: "UPI / wallet",
  card: "Card",
  other: "Other",
};

export const accountNameField = z
  .string()
  .trim()
  .min(1, "Give the wallet a name.")
  .max(60, "Use at most 60 characters.");

export const accountFormSchema = z.object({
  name: accountNameField,
  kind: z.enum(ACCOUNT_KINDS, "Choose a type."),
  openingBalance: balanceField,
  openingDate: dateField,
});
export type AccountForm = z.output<typeof accountFormSchema>;

export const accountIdSchema = z.uuid("That wallet doesn’t exist.");
