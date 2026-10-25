"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthFormState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type FieldProps = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  error?: string | undefined;
  hint?: string;
};

/** Labelled input with an associated hint and error message for screen readers. */
export function Field({ name, label, error, hint, id, ...props }: FieldProps) {
  const inputId = id ?? `field-${name}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Form-level result: errors are announced assertively, confirmations politely. */
export function FormMessage({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  const isError = state.status === "error";
  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        isError
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-positive/40 bg-positive-soft text-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{state.message}</p>
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export const INITIAL_STATE: AuthFormState = { status: "idle" };
