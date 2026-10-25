import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { AuthFrame } from "@/components/auth/auth-frame";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The recovery link signs the user in for this one purpose; without it there's nothing to reset.
  const user = await getCurrentUser();
  return (
    <AuthFrame
      title="Choose a new password"
      description={
        user?.email
          ? `For ${user.email}. You’ll stay signed in afterwards.`
          : "Open this page from the link in your recovery email."
      }
      links={[{ prompt: "Link expired?", href: "/forgot-password", label: "Send a new one" }]}
    >
      {user ? (
        <ResetPasswordForm />
      ) : (
        <StatePanel
          variant="denied"
          icon={KeyRound}
          title="No active reset link"
          description="Reset links work once and expire after about an hour. Request a new one to continue."
          className="border-0 bg-transparent py-6"
          actions={
            <Button asChild>
              <Link href="/forgot-password">Send a new link</Link>
            </Button>
          }
        />
      )}
    </AuthFrame>
  );
}
