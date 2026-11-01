"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { syncReminders } from "@/lib/actions/reminders";

/** Checks when the app opens and every half hour while it stays open. It shows nothing itself. */
const CHECK_EVERY_MS = 30 * 60 * 1000;
export const BROWSER_NOTIFICATIONS_KEY = "pp-browser-notifications";

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

export function ReminderSync() {
  const router = useRouter();
  React.useEffect(() => {
    let active = true;
    const check = async () => {
      if (!navigator.onLine) return;
      const created = await syncReminders().catch(() => []);
      if (!active || created.length === 0) return;
      router.refresh();
      if (!browserNotificationsOn()) return;
      for (const reminder of created) {
        const shown = new Notification(reminder.title, { body: reminder.body });
        shown.onclick = () => window.location.assign(reminder.linkPath);
      }
    };
    void check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [router]);
  return null;
}
