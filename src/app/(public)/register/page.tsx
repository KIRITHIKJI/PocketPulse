import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthFrame
      title="Create your account"
      description="One account keeps your phone and laptop in sync."
      links={[{ prompt: "Already have an account?", href: "/login", label: "Sign in" }]}
    />
  );
}
