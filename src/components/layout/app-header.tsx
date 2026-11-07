import Link from "next/link";
import { Bell } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { AccountMenu } from "@/components/layout/account-menu";
import { ThemeSwitcher } from "@/components/preferences/theme-switcher";
import { Button } from "@/components/ui/button";
import { getUnreadCount } from "@/lib/data/queries";
import { optionalSession } from "@/lib/data/session";

/** Top bar: brand on mobile (the bottom bar holds navigation), the bell, theme and account. Add lives in the sidebar on desktop and the bottom bar on phones. */
export async function AppHeader() {
  const [user, unread] = await Promise.all([optionalSession(), getUnreadCount()]);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/75 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6 lg:px-8">
      <Link href="/home" className="rounded-lg lg:hidden" aria-label="PocketPulse home">
        <Logo />
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {user && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="relative"
            data-testid="notification-bell"
          >
            <Link
              href="/reminders"
              aria-label={unread > 0 ? `Reminders, ${unread} unread` : "Reminders"}
            >
              <Bell aria-hidden="true" />
              {unread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary"
                />
              )}
            </Link>
          </Button>
        )}
        <ThemeSwitcher />
        {user && <AccountMenu email={user.email} />}
      </div>
    </header>
  );
}
