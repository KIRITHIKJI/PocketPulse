import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { ThemeSwitcher } from "@/components/preferences/theme-switcher";

/** Shell for signed-out screens: welcome, auth and onboarding. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link href="/welcome" className="rounded-lg" aria-label="PocketPulse welcome">
          <Logo />
        </Link>
        <div className="ml-auto">
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 sm:px-6">
        {children}
      </main>
    </div>
  );
}
