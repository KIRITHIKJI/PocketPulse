"use client";

import * as React from "react";

import { ActionForm, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { useDialogAction } from "@/components/forms/use-dialog-action";
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
import { type FormState, IDLE } from "@/lib/forms";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type ButtonProps = Pick<
  React.ComponentProps<typeof Button>,
  "variant" | "size" | "className" | "aria-label"
>;

function Hidden({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

/** One-click action (a tiny form with hidden fields) with its result announced next to it. */
export function InlineAction({
  action,
  fields,
  children,
  pendingLabel,
  ...button
}: {
  action: Action;
  fields: Record<string, string>;
  children: React.ReactNode;
  pendingLabel: string;
} & ButtonProps) {
  const [state, formAction, pending] = React.useActionState(action, IDLE);
  return (
    <ActionForm action={formAction} className="contents">
      <Hidden fields={fields} />
      <SubmitButton
        pending={pending}
        pendingLabel={pendingLabel}
        size="sm"
        variant="ghost"
        {...button}
      >
        {children}
      </SubmitButton>
      {state.status === "error" && <FormMessage state={state} className="basis-full" />}
    </ActionForm>
  );
}

/** An action that needs a confirmation step, explaining its consequences first. */
export function ConfirmAction({
  action,
  fields,
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive,
  children,
}: {
  action: Action;
  fields: Record<string, string>;
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  /** Extra form fields (e.g. a target picker). */
  children?: React.ReactNode;
}) {
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(action);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          <Hidden fields={fields} />
          <FormMessage state={state} />
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <SubmitButton
              pending={pending}
              pendingLabel={pendingLabel}
              size="default"
              variant={destructive ? "destructive" : "default"}
            >
              {confirmLabel}
            </SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
