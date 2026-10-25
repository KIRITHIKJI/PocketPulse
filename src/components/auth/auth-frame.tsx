import Link from "next/link";
import type { Route } from "next";
import { KeyRound } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { isSupabaseConfigured } from "@/lib/env";

type AuthFrameProps = {
  title: string;
  description: string;
  links?: readonly { prompt: string; href: Route; label: string }[];
  /** Shown above the form, e.g. why the user landed here. */
  notice?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Frame for auth screens. Without a configured Supabase project it says so instead of showing a
 * form that cannot work.
 */
export function AuthFrame({ title, description, links = [], notice, children }: AuthFrameProps) {
  const configured = isSupabaseConfigured();
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {configured ? (
        <div className="flex flex-col gap-4 rounded-2xl border bg-card/70 p-5 shadow-sm sm:p-6">
          {notice}
          {children}
        </div>
      ) : (
        <StatePanel
          variant="denied"
          icon={KeyRound}
          title="Accounts need a Supabase project"
          description="Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see README › Setup) to enable registration, sign-in and password recovery."
        />
      )}
      {links.map((link) => (
        <p key={link.href} className="text-center text-sm text-muted-foreground">
          {link.prompt}{" "}
          <Link href={link.href} className="font-medium text-primary hover:underline">
            {link.label}
          </Link>
        </p>
      ))}
    </div>
  );
}

/** Notice for a failed email link (`?error=link_invalid`). */
export function LinkErrorNotice() {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      That link is invalid or has expired. Links work once and expire after about an hour.
    </p>
  );
}
