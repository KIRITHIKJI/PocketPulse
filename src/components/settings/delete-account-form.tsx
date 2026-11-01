"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";

import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { DELETING_OWNER_KEY } from "@/components/offline/forget-device";
import { deleteAccount } from "@/lib/actions/account";
import { type FormState, IDLE } from "@/lib/forms";

/** The last step. The server checks the phrase and the password again; this only asks for them. */
export function DeleteAccountForm({ ownerId }: { ownerId: string }) {
  const [state, formAction, pending] = React.useActionState(
    (previous: FormState, formData: FormData) => {
      try {
        window.sessionStorage.setItem(DELETING_OWNER_KEY, ownerId);
      } catch {
        // Then an unsynced queue stays on this device; the server would refuse it anyway.
      }
      return deleteAccount(previous, formData);
    },
    IDLE,
  );
  const err = state.fieldErrors ?? {};
  return (
    <ActionForm action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <Field
        id="delete-phrase"
        name="phrase"
        label="Type DELETE MY ACCOUNT"
        autoComplete="off"
        error={err.phrase}
      />
      <Field
        id="delete-password"
        name="password"
        label="Your password"
        type="password"
        autoComplete="current-password"
        error={err.password}
      />
      <SubmitButton
        pending={pending}
        pendingLabel="Deleting…"
        size="default"
        variant="destructive"
        className="self-start"
      >
        <TriangleAlert aria-hidden="true" />
        Delete my account permanently
      </SubmitButton>
    </ActionForm>
  );
}
