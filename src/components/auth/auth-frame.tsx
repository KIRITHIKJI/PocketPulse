import Link from "next/link";
import type { Route } from "next";
import { KeyRound } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { isSupabaseConfigured } from "@/lib/env";

type AuthFrameProps = {
  title: string;
  description: string;
  links?: readonly { prompt: string; href: Route; label: string }[];
};

/**
 * Frame for auth screens. Reports the real configuration state instead of rendering a form
 * that cannot submit; the Supabase-backed forms replace the panel in the auth build stage.
 */
export function AuthFrame({ title, description, links = [] }: AuthFrameProps) {
  const configured = isSupabaseConfigured();
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <StatePanel
        variant="denied"
        icon={KeyRound}
        title={
          configured
            ? "Account forms aren’t connected in this build"
            : "Accounts need a Supabase project"
        }
        description={
          configured
            ? "Supabase credentials were found, but this build doesn’t include the sign-in forms yet. See PROGRESS.md for status."
            : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see README) to enable registration, sign-in and password recovery."
        }
      />
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
