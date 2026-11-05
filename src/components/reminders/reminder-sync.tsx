"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { syncReminders } from "@/lib/actions/reminders";

/**
 * Checks for due reminders at most once per half hour per account, however many pages are opened
 * or reloaded and however many tabs are open: the time of the last check is kept on the device.
 * It shows nothing itself.
 */
export const CHECK_EVERY_MS = 30 * 60 * 1000;
export const BROWSER_NOTIFICATIONS_KEY = "pp-browser-notifications";
export const LAST_CHECK_KEY = "pp-reminders-checked";

function browserNotificationsOn() {
  try {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      window.localStorage.getItem(BROWSER_NOTIFICATIONS_KEY) === "on"
    );
  } catch {
    return false;
  }
}

/** When this account was last checked on this device; 0 if never, or if storage is blocked. */
function lastCheck(ownerId: string): number {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAST_CHECK_KEY) ?? "null") as {
      ownerId?: string;
      at?: number;
    } | null;
    return saved?.ownerId === ownerId ? Number(saved.at) || 0 : 0;
  } catch {
    return 0;
  }
}

function markChecked(ownerId: string, at: number) {
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, JSON.stringify({ ownerId, at }));
  } catch {
    // Without storage every page opening checks, as before.
  }
}

export function ReminderSync({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dueIn = () => lastCheck(ownerId) + CHECK_EVERY_MS - Date.now();

    const check = async () => {
      if (!navigator.onLine) return;
      // Marked first, so a second tab opening now doesn't check as well.
      markChecked(ownerId, Date.now());
      const created = await syncReminders().catch(() => []);
      if (!active || created.length === 0) return;
      router.refresh();
      if (!browserNotificationsOn()) return;
      for (const reminder of created) {
        const shown = new Notification(reminder.title, { body: reminder.body });
        shown.onclick = () => window.location.assign(reminder.linkPath);
      }
    };

    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        // Another tab may have checked while this one waited.
        if (dueIn() <= 0) await check();
        if (!active) return;
        // Offline, nothing was checked: try again after a full interval, as before.
        const next = dueIn();
        schedule(next > 0 ? next : CHECK_EVERY_MS);
      }, delay);
    };
    schedule(Math.max(0, dueIn()));
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ownerId, router]);
  return null;
}

/**
 * Placed in a reminder settings form: after each successful save (a new `savedAt`), the next page
 * opening checks straight away, so a reminder just switched on doesn't wait for the half hour.
 */
export function CheckRemindersAgain({ savedAt }: { savedAt: number | undefined }) {
  React.useEffect(() => {
    if (savedAt === undefined) return;
    try {
      window.localStorage.removeItem(LAST_CHECK_KEY);
    } catch {
      // Without storage every opening checks anyway.
    }
  }, [savedAt]);
  return null;
}
