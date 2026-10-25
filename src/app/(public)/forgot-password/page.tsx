import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthFrame
      title="Forgot your password?"
      description="We’ll email you a secure link to choose a new one."
      links={[{ prompt: "Remembered it?", href: "/login", label: "Back to sign in" }]}
    />
  );
}
