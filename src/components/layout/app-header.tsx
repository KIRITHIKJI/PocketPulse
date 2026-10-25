import Link from "next/link";
import { Plus } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { MobileMoreSheet } from "@/components/layout/mobile-more-sheet";
import { ThemeSwitcher } from "@/components/preferences/theme-switcher";
import { Button } from "@/components/ui/button";

/** Top bar: brand + section menu on mobile; quick actions on desktop (sidebar holds navigation). */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/75 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6 lg:px-8">
      <Link href="/home" className="rounded-lg lg:hidden" aria-label="PocketPulse home">
        <Logo />
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Button asChild size="sm" className="hidden lg:inline-flex">
          <Link href="/add">
            <Plus aria-hidden="true" />
            Add expense
          </Link>
        </Button>
        <ThemeSwitcher />
        <div className="lg:hidden">
          <MobileMoreSheet />
        </div>
      </div>
    </header>
  );
}
