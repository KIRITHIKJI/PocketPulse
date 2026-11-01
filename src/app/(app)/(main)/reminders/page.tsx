import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Bell, X } from "lucide-react";

import { InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { BrowserNotifications, ReminderScheduleForm } from "@/components/reminders/reminder-forms";
import { RemindersForm } from "@/components/settings/settings-forms";
import { StatePanel } from "@/components/states/state-panel";
import { Card } from "@/components/ui/card";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/reminders";
import { getNotifications, getProfile, getReminderSettings } from "@/lib/data/queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const [notifications, prefs, profile] = await Promise.all([
    getNotifications(),
    getReminderSettings(),
    getProfile(),
  ]);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Optional, quiet nudges for logging, weekly reviews, allowance day and upcoming bills. All off by default, apart from budget alerts."
      />

      <section aria-labelledby="inbox-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inbox-heading" className="font-semibold">
            Notifications{unread > 0 ? ` · ${unread} new` : ""}
          </h2>
          {unread > 0 && (
            <InlineAction action={markAllNotificationsRead} fields={{}} pendingLabel="Saving…">
              Mark all read
            </InlineAction>
          )}
        </div>
        {notifications.length === 0 ? (
          <StatePanel
            icon={Bell}
            title="Nothing here"
            description="Reminders you turn on appear here when PocketPulse is open. Nothing is emailed."
          />
        ) : (
          <ul className="flex flex-col gap-2" data-testid="notification-list">
            {notifications.map((n) => (
              <li key={n.id}>
                <Card
                  className="flex-row flex-wrap items-center gap-2 p-3"
                  data-testid="notification"
                  data-read={n.read}
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex items-center gap-2 font-medium">
                      {!n.read && (
                        <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                      )}
                      {n.linkPath ? (
                        <Link
                          href={n.linkPath as Route}
                          className="underline-offset-4 hover:underline"
                        >
                          {n.title}
                        </Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(n.scheduledFor, profile.timeZone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!n.read && (
                      <InlineAction
                        action={markNotificationRead}
                        fields={{ id: n.id }}
                        pendingLabel="Saving…"
                        aria-label={`Mark read: ${n.title}`}
                      >
                        Mark read
                      </InlineAction>
                    )}
                    <InlineAction
                      action={dismissNotification}
                      fields={{ id: n.id }}
                      pendingLabel="Removing…"
                      aria-label={`Dismiss: ${n.title}`}
                    >
                      <X aria-hidden="true" />
                      Dismiss
                    </InlineAction>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-3" data-testid="reminder-switches">
          <h2 className="font-semibold">What to remind you about</h2>
          <RemindersForm prefs={prefs} />
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-3">
            <h2 className="font-semibold">How often</h2>
            <ReminderScheduleForm prefs={prefs} />
          </Card>
          <Card className="gap-3">
            <h2 className="font-semibold">Browser notifications</h2>
            <BrowserNotifications />
          </Card>
        </div>
      </div>
    </>
  );
}
