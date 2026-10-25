import type { Metadata } from "next";

import { AuthFrame } from "@/components/auth/auth-frame";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFrame
      title="Welcome back"
      description="Sign in to see your money on any device."
      links={[
        { prompt: "New here?", href: "/register", label: "Create an account" },
        { prompt: "Can’t sign in?", href: "/forgot-password", label: "Reset your password" },
      ]}
    />
  );
}
