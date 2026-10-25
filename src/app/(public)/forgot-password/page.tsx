import type { Metadata } from "next";

import { AuthFrame, LinkErrorNotice } from "@/components/auth/auth-frame";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthFrame
      title="Forgot your password?"
      description="We’ll email you a secure link to choose a new one."
      notice={error === "link_invalid" ? <LinkErrorNotice /> : undefined}
      links={[{ prompt: "Remembered it?", href: "/login", label: "Back to sign in" }]}
    >
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
