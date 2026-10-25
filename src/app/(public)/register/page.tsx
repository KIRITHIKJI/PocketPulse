import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth/auth-frame";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthFrame
      title="Create your account"
      description="One account keeps your phone and laptop in sync. Your records stay private to you."
      links={[{ prompt: "Already have an account?", href: "/login", label: "Sign in" }]}
    >
      <RegisterForm />
    </AuthFrame>
  );
}
