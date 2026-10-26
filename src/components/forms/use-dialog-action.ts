"use client";

import * as React from "react";

import { type FormState, IDLE } from "@/lib/forms";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * A server-action form inside a dialog: the dialog closes after a successful save (each success
 * carries a new `savedAt`), and reopening it doesn't show the previous result again.
 * `lastResult` is the latest result for a status line outside the dialog.
 */
export function useDialogAction(action: Action) {
  const [open, setOpenState] = React.useState(false);
  const [state, formAction, pending] = React.useActionState(action, IDLE);
  const [handledAt, setHandledAt] = React.useState<number | undefined>(undefined);
  const [stateAtOpen, setStateAtOpen] = React.useState<FormState | null>(null);
  const [openCount, setOpenCount] = React.useState(0);

  // Close once per successful save (adjusting state during render, not in an effect).
  if (state.status === "success" && state.savedAt !== handledAt) {
    setHandledAt(state.savedAt);
    setOpenState(false);
  }

  const setOpen = (next: boolean) => {
    if (next) {
      setStateAtOpen(state);
      setOpenCount((n) => n + 1);
    }
    setOpenState(next);
  };

  return {
    open,
    setOpen,
    state: state === stateAtOpen ? IDLE : state,
    lastResult: state,
    formAction,
    pending,
    /** Changes on every opening, so the form inside remounts with fresh defaults. */
    formKey: openCount,
  };
}
