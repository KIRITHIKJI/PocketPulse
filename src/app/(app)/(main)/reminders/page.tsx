import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { BellRing, X } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { BrowserNotifications, ReminderScheduleForm } from "@/components/reminders/reminder-forms";
import { RemindersForm } from "@/components/settings/preference-forms";
import { StatePanel } from "@/components/states/state-panel";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/reminders";
import { getNotifications, getProfile, getReminderSettings } from "@/lib/data/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REMINDERS_OPEN_NOTE } from "@/lib/validation/settings";

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
        description="Optional, quiet nudges. All off by default, apart from budget alerts."
      />

      <div data-testid="reminders-open-note">
        <Notice tone="warning">{REMINDERS_OPEN_NOTE}</Notice>
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Surface asChild>
          <section aria-labelledby="inbox-heading" className="min-w-0 lg:col-span-7">
            <SurfaceHeader
              action={
                unread > 0 ? (
                  <InlineAction
                    action={markAllNotificationsRead}
                    fields={{}}
                    pendingLabel="Saving…"
                  >
                    Mark all read
                  </InlineAction>
                ) : undefined
              }
            >
              <h2 id="inbox-heading" className="type-heading">
                Notifications{unread > 0 ? ` · ${unread} new` : ""}
              </h2>
              <p className="type-caption text-text-secondary">
                Newest first. Open one to go where it points.
              </p>
            </SurfaceHeader>
            {notifications.length === 0 ? (
              <StatePanel
                size="section"
                icon={BellRing}
                title="You’re up to date."
                description="Reminders you turn on appear here the next time PocketPulse is open."
              />
            ) : (
              <ul className="-my-1 flex flex-col divide-y" data-testid="notification-list">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className="flex min-h-14 flex-wrap items-start gap-x-3 gap-y-1 py-3"
                    data-testid="notification"
                    data-read={n.read}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-2 size-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
                      <p
                        className={cn("type-body", n.read ? "text-text-secondary" : "font-medium")}
                      >
                        {!n.read && <span className="sr-only">New: </span>}
                        {n.linkPath ? (
                          <Link
                            href={n.linkPath as Route}
                            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                          >
                            {n.title}
                          </Link>
                        ) : (
                          n.title
                        )}
                      </p>
                      {n.body && <p className="type-body text-muted-foreground">{n.body}</p>}
                      <p className="type-caption text-text-tertiary">
                        {formatDateTime(n.scheduledFor, profile.timeZone)}
                      </p>
                    </div>
                    <div className="-mr-2 ml-auto flex shrink-0 items-center gap-1">
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
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Surface>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-5 lg:gap-6">
          <Surface data-testid="reminder-switches">
            <SurfaceHeader title="What to remind you about" />
            <RemindersForm prefs={prefs} />
          </Surface>
          <Surface>
            <SurfaceHeader title="How often" />
            <ReminderScheduleForm prefs={prefs} />
          </Surface>
          <Surface>
            <SurfaceHeader title="Browser notifications" />
            <BrowserNotifications />
          </Surface>
        </div>
      </div>
    </>
  );
}
