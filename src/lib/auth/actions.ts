"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authErrorMessage } from "@/lib/auth/errors";
import { HOME_PATH, safeNextPath } from "@/lib/auth/routes";
import {
  type FieldErrors,
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Echoed back so the email field isn't cleared after an error (never the password). */
  email?: string;
};

const NOT_CONFIGURED: AuthFormState = {
  status: "error",
  message: "Accounts aren’t available: this deployment has no Supabase project configured.",
};

/** Absolute base URL for links in auth emails. Must be listed in Supabase Auth → URL Configuration. */
async function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const text = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email");
  const parsed = signInSchema.safeParse({ email, password: text(formData, "password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), email };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: "error", message: authErrorMessage(error), email };
  redirect(safeNextPath(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email");
  const parsed = signUpSchema.safeParse({
    displayName: text(formData, "displayName") || undefined,
    email,
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), email };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: parsed.data.displayName ? { display_name: parsed.data.displayName } : {},
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=/onboarding`,
    },
  });
  if (error) return { status: "error", message: authErrorMessage(error), email };
  // With email confirmation off, Supabase signs the user in immediately.
  if (data.session) redirect("/onboarding");
  return {
    status: "success",
    email,
    message: `Check ${parsed.data.email} for a confirmation link. It signs you in and opens setup.`,
  };
}

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = text(formData, "email");
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), email };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });
  // Only rate limits are surfaced; anything else gets the same answer so the form can't be used
  // to discover which addresses have accounts.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { status: "error", message: authErrorMessage(error), email };
  }
  return {
    status: "success",
    email,
    message: `If ${parsed.data.email} has a PocketPulse account, a reset link is on its way. It expires in about an hour.`,
  };
}

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    return { status: "error", message: authErrorMessage({ code: "session_not_found" }) };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };
  redirect(HOME_PATH);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
