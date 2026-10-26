"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { AuthFormState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type FieldProps = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  error?: string | undefined;
  hint?: React.ReactNode;
  /** Shown inside the input on the left, e.g. "₹". */
  prefix?: string;
};

function describedBy(inputId: string, hint: unknown, error: unknown) {
  return (
    [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

function FieldMessages({
  inputId,
  hint,
  error,
}: {
  inputId: string;
  hint?: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <>
      {hint && (
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

/** Labelled input with an associated hint and error message for screen readers. */
export function Field({ name, label, error, hint, id, prefix, className, ...props }: FieldProps) {
  const inputId = id ?? `field-${name}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
          >
            {prefix}
          </span>
        )}
        <Input
          id={inputId}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn(prefix && "pl-7")}
          {...props}
        />
      </div>
      <FieldMessages inputId={inputId} hint={hint} error={error} />
    </div>
  );
}

/** Amount input: decimal keyboard on phones, currency symbol prefix, parsed to paise on the server. */
export function MoneyField(props: Omit<FieldProps, "type" | "inputMode">) {
  return (
    <Field
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="next"
      placeholder="0"
      prefix="₹"
      {...props}
    />
  );
}

type SelectFieldProps = React.ComponentProps<typeof NativeSelect> & {
  name: string;
  label: string;
  error?: string | undefined;
  hint?: React.ReactNode;
};

export function SelectField({
  name,
  label,
  error,
  hint,
  id,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const inputId = id ?? `field-${name}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <NativeSelect
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        {...props}
      >
        {children}
      </NativeSelect>
      <FieldMessages inputId={inputId} hint={hint} error={error} />
    </div>
  );
}

/** Form-level result: errors are announced assertively, confirmations politely. */
export function FormMessage({
  state,
  className,
}: {
  state: Pick<AuthFormState, "status" | "message">;
  className?: string;
}) {
  if (!state.message || state.status === "idle") return null;
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
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{state.message}</p>
    </div>
  );
}

/**
 * A form that runs a `useActionState` action without React's automatic form reset, so what the
 * user typed stays put when the server reports a validation error. The `action` attribute is
 * kept so the form still submits before hydration.
 */
export function ActionForm({
  action,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
}) {
  const [, startTransition] = React.useTransition();
  return (
    <form
      noValidate
      {...props}
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const formData = new FormData(event.currentTarget, submitter);
        startTransition(() => action(formData));
      }}
    >
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingProp,
  size = "lg",
  variant,
  className,
  ...props
}: {
  children: React.ReactNode;
  pendingLabel: string;
  /** Pass `useActionState`'s pending flag when the form is an `ActionForm`. */
  pending?: boolean;
} & Omit<React.ComponentProps<typeof Button>, "type" | "children">) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button
      type="submit"
      size={size}
      variant={variant}
      disabled={pending}
      aria-disabled={pending}
      className={className}
      {...props}
    >
      {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}

export const INITIAL_STATE: AuthFormState = { status: "idle" };
