"use client";

import * as React from "react";

import {
  ActionForm,
  Field,
  FormMessage,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import {
  BROWSER_NOTIFICATIONS_KEY,
  CheckRemindersAgain,
} from "@/components/reminders/reminder-sync";
import { Button } from "@/components/ui/button";
import type { ReminderSettings } from "@/domain";
import { saveBrowserNotifications, saveReminderSchedule } from "@/lib/actions/reminders";
import { IDLE } from "@/lib/forms";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** How often each reminder comes. Whether it's on at all is the switch list above this. */
export function ReminderScheduleForm({ prefs }: { prefs: ReminderSettings }) {
  const [state, formAction, pending] = React.useActionState(saveReminderSchedule, IDLE);
  const err = state.fieldErrors ?? {};
  return (
    <ActionForm action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <CheckRemindersAgain savedAt={state.status === "success" ? state.savedAt : undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="schedule-time"
          name="missedLoggingTime"
          label="“Forgot to log” time"
          type="time"
          defaultValue={prefs.missedLoggingTime}
          error={err.missedLoggingTime}
        />
        <SelectField
          id="schedule-days"
          name="missedLoggingDays"
          label="“Forgot to log” days"
          defaultValue={prefs.missedLoggingDays}
          error={err.missedLoggingDays}
        >
          <option value="daily">Every day</option>
          <option value="weekdays">Weekdays only</option>
        </SelectField>
        <SelectField
          id="schedule-review"
          name="weeklyReviewDay"
          label="Weekly review day"
          defaultValue={prefs.weeklyReviewDay}
          error={err.weeklyReviewDay}
        >
          {DAYS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="schedule-savings"
          name="savingsReviewFrequency"
          label="Savings check-in"
          defaultValue={prefs.savingsReviewFrequency}
          error={err.savingsReviewFrequency}
        >
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
        </SelectField>
        <Field
          id="schedule-income"
          name="upcomingIncomeDays"
          label="Days before allowance"
          inputMode="numeric"
          defaultValue={String(prefs.upcomingIncomeDays)}
          error={err.upcomingIncomeDays}
        />
        <Field
          id="schedule-bills"
          name="upcomingCommitmentDays"
          label="Days before a bill"
          inputMode="numeric"
          defaultValue={String(prefs.upcomingCommitmentDays)}
          error={err.upcomingCommitmentDays}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…" size="default" className="self-start">
        Save schedule
      </SubmitButton>
    </ActionForm>
  );
}

type Permission = "unsupported" | NotificationPermission;

/** Browser notifications are asked for only from this button, and only ever with permission. */
export function BrowserNotifications() {
  const [permission, setPermission] = React.useState<Permission | null>(null);
  const [on, setOn] = React.useState(false);

  React.useEffect(() => {
    let isOn = false;
    try {
      isOn = window.localStorage.getItem(BROWSER_NOTIFICATIONS_KEY) === "on";
    } catch {
      // Blocked storage reads as off.
    }
    // Browser-only values, so they can only be read once the page is running here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(isOn);
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  function remember(next: boolean) {
    try {
      window.localStorage.setItem(BROWSER_NOTIFICATIONS_KEY, next ? "on" : "off");
    } catch {
      // Then it lasts for this page only.
    }
    setOn(next);
    void saveBrowserNotifications(next).catch(() => undefined);
  }

  async function enable() {
    const answer = await Notification.requestPermission();
    setPermission(answer);
    if (answer === "granted") remember(true);
  }

  if (permission === null) return null;
  if (permission === "unsupported") {
    return (
      <p className="type-body text-muted-foreground">
        This browser doesn’t support notifications. Reminders still appear here.
      </p>
    );
  }
  if (permission === "denied") {
    return (
      <p className="type-body text-muted-foreground" data-testid="browser-notifications">
        Notifications are blocked for this site in your browser settings. Reminders still appear
        here.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="browser-notifications">
      <p className="min-w-0 flex-1 basis-64 type-body text-muted-foreground">
        {on
          ? "On for this browser. They only show while PocketPulse is open, not when it’s closed."
          : "Optional. Shows reminders outside this tab, but only while PocketPulse is open."}
      </p>
      {on ? (
        <Button variant="outline" onClick={() => remember(false)}>
          Turn off
        </Button>
      ) : permission === "granted" ? (
        <Button variant="outline" onClick={() => remember(true)}>
          Turn on
        </Button>
      ) : (
        <Button variant="outline" onClick={enable}>
          Allow browser notifications
        </Button>
      )}
    </div>
  );
}
