"use server";

import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSession } from "@/lib/data/session";
import { readPublicSupabaseEnv } from "@/lib/env";
import { type FormState, invalid, text } from "@/lib/forms";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PHRASE = "DELETE MY ACCOUNT";

const schema = z.object({
  phrase: z
    .string()
    .trim()
    .refine((value) => value === PHRASE, `Type ${PHRASE} exactly.`),
  password: z.string().min(1, "Enter your password."),
});

/** Proves the password on a throwaway client, so the real session's cookies aren't touched. */
async function passwordIsRight(email: string, password: string) {
  const env = readPublicSupabaseEnv();
  if (!env) return false;
  const check = createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) return false;
  await check.auth.signOut({ scope: "local" });
  return true;
}

/**
 * Permanently deletes the signed-in account. The id comes only from the verified session, never
 * the form, and the password is checked again, so a stolen session alone can't do this. Deleting
 * the auth user cascades through every row the user owns. Only the fact of a failure is reported;
 * nothing about the user is logged.
 */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    phrase: text(formData, "phrase"),
    password: text(formData, "password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const { supabase, userId, email } = await requireSession();
  if (!email || !(await passwordIsRight(email, parsed.data.password))) {
    return {
      status: "error",
      message: "That password isn’t right. Nothing was deleted.",
      fieldErrors: { password: "That password isn’t right." },
    };
  }
  try {
    const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
  } catch {
    return { status: "error", message: "Couldn’t delete your account. Nothing was changed." };
  }
  // The refresh tokens died with the user; this just clears this browser's cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/welcome?deleted=1");
}
