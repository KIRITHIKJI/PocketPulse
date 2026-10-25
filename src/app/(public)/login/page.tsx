import type { Metadata } from "next";

import { AuthFrame, LinkErrorNotice } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/auth-forms";
import { safeNextPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? safeNextPath(next) : undefined;
  return (
    <AuthFrame
      title="Welcome back"
      description="Sign in to see your money on any device."
      notice={error === "link_invalid" ? <LinkErrorNotice /> : undefined}
      links={[
        { prompt: "New here?", href: "/register", label: "Create an account" },
        { prompt: "Can’t sign in?", href: "/forgot-password", label: "Reset your password" },
      ]}
    >
      <LoginForm next={nextPath} />
    </AuthFrame>
  );
}
