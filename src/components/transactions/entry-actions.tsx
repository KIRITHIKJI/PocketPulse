"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, LoaderCircle, Trash2 } from "lucide-react";

import { useLedger } from "@/components/transactions/use-ledger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { newId } from "@/lib/ids";
import type { EntryDraft } from "@/lib/ledger/commands";

/** Delete (soft) after confirming; the toast offers Undo, which restores the same entry. */
export function DeleteEntryButton({
  id,
  summary,
  blockedReason,
}: {
  id: string;
  /** "−₹15 · Tea on 24 Oct" — repeated in the confirmation so the right entry is deleted. */
  summary: string;
  /** Set when the database would refuse (e.g. the expense has refunds); explains why. */
  blockedReason: string | null;
}) {
  const router = useRouter();
  const { run } = useLedger();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [opId] = React.useState(newId);

  async function confirm() {
    setPending(true);
    const result = await run({ kind: "delete", opId, id }, { success: "Entry deleted." });
    setPending(false);
    if (result?.ok) {
      setOpen(false);
      router.push("/transactions");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this entry?</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p className="font-medium text-foreground">{summary}</p>
              {blockedReason ? (
                <p>{blockedReason}</p>
              ) : (
                <p>
                  Your balance, history and category totals will no longer include it. You can undo
                  right after deleting.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          {!blockedReason && (
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {pending ? "Deleting…" : "Delete"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Records the same entry again, now (new id), with Undo. */
export function RepeatEntryButton({
  template,
  label,
}: {
  template: Omit<EntryDraft, "id" | "occurredAt" | "source">;
  label: string;
}) {
  const { run } = useLedger();
  const [ids, setIds] = React.useState<{ id: string; opId: string; at: string } | null>(null);
  const [pending, setPending] = React.useState(false);

  async function repeat() {
    // Same ids until it succeeds, so a retry can't create a second copy.
    const current = ids ?? { id: newId(), opId: newId(), at: new Date().toISOString() };
    setIds(current);
    setPending(true);
    const result = await run(
      {
        kind: "create",
        opId: current.opId,
        draft: { ...template, id: current.id, occurredAt: current.at, source: "quick_add" },
      },
      { success: `Logged again: ${label}` },
    );
    setPending(false);
    if (result?.ok) setIds(null);
  }

  return (
    <Button variant="outline" onClick={repeat} disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Copy aria-hidden="true" />
      )}
      Log again now
    </Button>
  );
}
