import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthFrame
      title="Choose a new password"
      description="Open this page from the link in your recovery email."
      links={[{ prompt: "Link expired?", href: "/forgot-password", label: "Send a new one" }]}
    />
  );
}
