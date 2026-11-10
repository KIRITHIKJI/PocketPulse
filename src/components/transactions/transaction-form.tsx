"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { carryToast, useToast } from "@/components/feedback/toast";
import { useRewardFeedback } from "@/components/feedback/reward-feedback";
import { useLedger, withSaveTimeout } from "@/components/transactions/use-ledger";
import { type EntryFormState, saveEntryForm } from "@/lib/actions/transactions";
import type { EntryKit } from "@/lib/data/entry-kit";
import { IDLE, invalid } from "@/lib/forms";
import { newId } from "@/lib/ids";
import { commandFromForm, entryFormSchema, entryFormValues } from "@/lib/validation/transactions";
import {
  type EntryInitial,
  type RefundableExpense,
  EntryFields,
} from "@/components/transactions/entry-fields";

const EDIT_QUEUED = "Change saved on this device. It’ll sync when you’re back online.";

/**
 * Full entry form. Only the amount and (for spending/income) the category are needed; the
 * default wallet, today and the current time are prefilled. Edits quote the row version.
 */
export function TransactionForm({
  kit,
  mode,
  initial,
  opId: initialOpId,
  refundable,
}: {
  kit: EntryKit;
  mode: "create" | "edit";
  initial: EntryInitial;
  /** Generated on the server for the first render, so hydration matches. */
  opId: string;
  refundable: RefundableExpense[];
}) {
  const router = useRouter();
  const { show, setHighlightId } = useToast();
  const { undo, queue } = useLedger();
  const { afterSave } = useRewardFeedback();
  const [ids, setIds] = React.useState({ id: initial.id, opId: initialOpId });
  const [formKey, setFormKey] = React.useState(0);

  /** The same checks and the same command as the server, for when the server can't be reached. */
  async function saveOnDevice(formData: FormData): Promise<EntryFormState> {
    const parsed = entryFormSchema({ timeZone: kit.timeZone, now: Date.now() }).safeParse(
      entryFormValues(formData),
    );
    if (!parsed.success) return invalid(parsed.error);
    const result = await queue(
      commandFromForm(parsed.data, kit.currency),
      mode === "edit" ? { message: EDIT_QUEUED } : {},
    );
    if (!result.ok) return { status: "error", message: result.message, result };
    return { status: "success", savedAt: Date.now(), result };
  }

  const [state, formAction, pending] = React.useActionState<EntryFormState, FormData>(
    async (previous, formData) => {
      let next: EntryFormState;
      try {
        if (!navigator.onLine) throw new Error("offline");
        next = await withSaveTimeout(saveEntryForm(previous, formData));
      } catch {
        next = await saveOnDevice(formData);
      }
      if (next.status !== "success" || !next.result?.ok) return next;
      const { status, undo: reverse } = next.result;
      const sourceId = String(formData.get("opId"));
      if (status === "queued") {
        if (mode === "create") {
          setIds({ id: newId(), opId: newId() });
          setFormKey((k) => k + 1);
        } else {
          // The entry's own page may not be saved offline. This one is, and shows the change.
          // Offline, getting there can be a full page load, so the confirmation is carried.
          carryToast("/settings/sync", EDIT_QUEUED);
          router.push("/settings/sync");
        }
        return next;
      }
      const action = reverse ? { label: "Undo", run: () => undo(reverse, sourceId) } : undefined;
      if (status === "applied") afterSave(sourceId);
      if (mode === "create") {
        setHighlightId(String(formData.get("id")));
        show({
          tone: "success",
          message:
            status === "duplicate"
              ? "Already saved — no duplicate was added."
              : "Saved. Add another?",
          action,
          sourceId,
        });
        // Fresh ids for the next entry; the saved one can only be replayed, never duplicated.
        setIds({ id: newId(), opId: newId() });
        setFormKey((k) => k + 1);
      } else {
        show({
          tone: "success",
          message: status === "duplicate" ? "Nothing changed." : "Changes saved.",
          action,
          sourceId,
        });
        router.push(`/transactions/${initial.id}`);
      }
      return next;
    },
    IDLE,
  );

  return (
    <ActionForm
      action={formAction}
      className="flex flex-col gap-5"
      aria-label="Transaction"
      worksOffline
    >
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="id" value={ids.id} />
      <input type="hidden" name="opId" value={ids.opId} />
      <input type="hidden" name="version" value={initial.version ?? ""} />
      {state.status === "error" && <FormMessage state={state} />}
      <EntryFields
        key={formKey}
        kit={kit}
        mode={mode}
        initial={mode === "create" && formKey > 0 ? { ...initial, amountPaise: null } : initial}
        refundable={refundable}
        errors={state.status === "error" ? (state.fieldErrors ?? {}) : {}}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {mode === "edit" ? "Save changes" : "Save entry"}
      </SubmitButton>
    </ActionForm>
  );
}
