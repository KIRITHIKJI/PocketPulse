/**
 * Shared form plumbing for server actions: the result shape every form renders, FormData
 * readers, and Zod field types for money and dates. Money fields parse what people type
 * ("₹1,250.50", "40/-") into integer paise with the domain parser — never parseFloat.
 */
import { z } from "zod";

import { isLocalDate, parseAmountInput, parseSignedAmountInput } from "@/domain";

export type FieldErrors = Partial<Record<string, string>>;

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Increments on every successful submit, so a client can react once (close a dialog). */
  savedAt?: number;
};

export const IDLE: FormState = { status: "idle" };

/** First message per field, keyed by the dotted path ("extras.0.name"). */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    out[key] ??= issue.message;
  }
  return out;
}

export function invalid(error: z.ZodError, message = "Check the highlighted fields."): FormState {
  return { status: "error", message, fieldErrors: fieldErrors(error) };
}

export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Checkbox / switch: present and not "off". */
export function flag(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value !== null && value !== "off" && value !== "false";
}

/**
 * Collects indexed fields (`extras.0.name`, `extras.0.kind`, `extras.1.name`…) into an array of
 * objects, in index order. Unknown or missing keys simply stay absent.
 */
export function indexedRows(formData: FormData, prefix: string): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  const pattern = new RegExp(`^${prefix}\\.(\\d{1,2})\\.([a-zA-Z]+)$`);
  for (const [key, value] of formData.entries()) {
    const match = pattern.exec(key);
    if (!match || typeof value !== "string") continue;
    const index = Number(match[1]);
    const row = rows.get(index) ?? {};
    row[match[2]!] = value;
    rows.set(index, row);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

// --- Field types ------------------------------------------------------------------------------

/** A positive amount in paise. */
export const amountField = z.string().transform((value, ctx) => {
  const result = parseAmountInput(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  }
  return result.paise;
});

/** A positive amount in paise, or null when left blank. */
export const optionalAmountField = z.string().transform((value, ctx) => {
  if (value.trim() === "") return null;
  const result = parseAmountInput(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  }
  return result.paise;
});

/** A balance in paise: zero or negative allowed; blank means ₹0. */
export const balanceField = z.string().transform((value, ctx) => {
  if (value.trim() === "") return 0;
  const result = parseSignedAmountInput(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.message });
    return z.NEVER;
  }
  return result.paise;
});

export const dateField = z
  .string()
  .trim()
  .refine((value) => isLocalDate(value), "Choose a valid date.");

export const optionalDateField = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || isLocalDate(value), "Choose a valid date.");

/** Trimmed text; blank becomes null. */
export const optionalTextField = (max: number, label = "This") =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .transform((value) => (value === "" ? null : value));
