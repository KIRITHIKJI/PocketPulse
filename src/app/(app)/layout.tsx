import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { RewardFeedbackProvider } from "@/components/feedback/reward-feedback";
import { ToastProvider } from "@/components/feedback/toast";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { OfflineProvider } from "@/components/offline/offline-provider";
import { ReminderSync } from "@/components/reminders/reminder-sync";
import { PreferenceSync } from "@/components/providers/preference-sync";
import { type Profile, getProfile, getUnreadCount } from "@/lib/data/queries";
import { optionalSession } from "@/lib/data/session";

async function loadProfile(): Promise<Profile | null> {
  const session = await optionalSession();
  if (!session) return null;
  try {
    return await getProfile();
  } catch {
    // The page itself reports a load failure; the shell still renders.
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Started now, alongside the profile, so the header's count doesn't wait for it.
  void getUnreadCount();
  const [profile, session] = await Promise.all([loadProfile(), optionalSession()]);
  const showProgress = profile?.showProgress ?? true;
  const shell = (
    <ToastProvider>
      <RewardFeedbackProvider enabled={Boolean(profile) && showProgress}>
        <OfflineProvider ownerId={session?.userId ?? null}>
          <div className="flex min-h-dvh">
            <a
              href="#main"
              className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              Skip to content
            </a>
            <AppSidebar showProgress={showProgress} />
            <div className="flex min-w-0 flex-1 flex-col">
              <AppHeader />
              <OfflineBanner />
              <main
                id="main"
                tabIndex={-1}
                className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:px-8 lg:pb-12"
              >
                {children}
              </main>
            </div>
            <BottomNav showProgress={showProgress} />
            {profile && session && <ReminderSync ownerId={session.userId} />}
          </div>
        </OfflineProvider>
      </RewardFeedbackProvider>
    </ToastProvider>
  );
  if (!profile) return shell;
  return (
    <PreferenceSync theme={profile.theme} motion={profile.motion}>
      {shell}
    </PreferenceSync>
  );
}
