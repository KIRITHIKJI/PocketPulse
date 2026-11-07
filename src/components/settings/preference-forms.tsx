"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { CheckRemindersAgain } from "@/components/reminders/reminder-sync";
import { SwitchRow } from "@/components/ui/switch";
import { savePrivacy, saveProgressFeatures, saveReminders } from "@/lib/actions/settings";
import {
  REMINDERS_OPEN_NOTE,
  type ReminderKey,
  type ReminderPreferences,
} from "@/lib/validation/settings";
import { type StepProps, SettingsForm } from "@/components/settings/settings-forms";

const REMINDER_LABELS: Record<ReminderKey, { label: string; description: string }> = {
  missedLogging: {
    label: "Forgot to log today",
    description: "An evening nudge on days with no entries.",
  },
  weeklyReview: { label: "Weekly review", description: "A look back at your week." },
  upcomingIncome: {
    label: "Allowance coming up",
    description: "Before your next expected income date.",
  },
  budgetAlerts: {
    label: "Budget thresholds",
    description: "When a budget reaches one of its alert levels.",
  },
  upcomingCommitments: {
    label: "Bills and planned expenses",
    description: "Before something you planned is due.",
  },
  savingsReview: { label: "Savings check-in", description: "Progress on your goals." },
};

export function RemindersFields({ prefs }: { prefs: ReminderPreferences }) {
  const [allDisabled, setAllDisabled] = React.useState(prefs.allDisabled);
  return (
    <div className="flex flex-col">
      <SwitchRow
        id="reminder-allDisabled"
        name="allDisabled"
        label="Turn off all reminders"
        description={`Nothing shows while this is on. ${REMINDERS_OPEN_NOTE}`}
        checked={allDisabled}
        onCheckedChange={setAllDisabled}
      />
      {/* Kept editable while everything is off, so individual choices survive turning it back on. */}
      <div
        className={
          allDisabled
            ? "flex flex-col divide-y border-t opacity-60"
            : "flex flex-col divide-y border-t"
        }
      >
        {(Object.keys(REMINDER_LABELS) as ReminderKey[]).map((key) => (
          <SwitchRow
            key={key}
            id={`reminder-${key}`}
            name={key}
            label={REMINDER_LABELS[key].label}
            description={
              allDisabled
                ? `${REMINDER_LABELS[key].description} Paused while all reminders are off.`
                : REMINDER_LABELS[key].description
            }
            defaultChecked={prefs[key]}
          />
        ))}
      </div>
    </div>
  );
}

export function RemindersForm({ prefs, ...step }: { prefs: ReminderPreferences } & StepProps) {
  return (
    <SettingsForm action={saveReminders} {...step}>
      {(state) => (
        <>
          <RemindersFields prefs={prefs} />
          <CheckRemindersAgain savedAt={state.status === "success" ? state.savedAt : undefined} />
        </>
      )}
    </SettingsForm>
  );
}

export function PrivacyFields({
  includeNotesInReports,
  summary = true,
}: {
  includeNotesInReports: boolean;
  /** The three-line privacy summary; off where the full statements are already on screen. */
  summary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        id="privacy-notes"
        name="includeNotesInReports"
        label="Include notes in parent reports by default"
        description="You still review every report before exporting it, and can change this per report."
        defaultChecked={includeNotesInReports}
      />
      {summary && (
        <ul className="flex flex-col gap-2 rounded-xl bg-surface-inset p-3 type-body text-muted-foreground">
          {[
            "Your entries are private to your account. Nothing is shared with parents or anyone else unless you export it yourself.",
            "Expense details are never sent to an AI service. Suggestions and text parsing run inside PocketPulse.",
            "Balances are what you enter. PocketPulse isn’t connected to any bank and doesn’t verify them.",
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PrivacyForm({
  includeNotesInReports,
  summary,
  ...step
}: { includeNotesInReports: boolean; summary?: boolean } & StepProps) {
  return (
    <SettingsForm action={savePrivacy} {...step}>
      {() => <PrivacyFields includeNotesInReports={includeNotesInReports} summary={summary} />}
    </SettingsForm>
  );
}

/** Progress features on or off. Off hides XP, levels and missions; nothing else changes. */
export function ProgressForm({ showProgress }: { showProgress: boolean }) {
  return (
    <SettingsForm action={saveProgressFeatures}>
      {() => (
        <SwitchRow
          id="settings-show-progress"
          name="showProgress"
          label="Show progress features"
          description="XP, levels, missions and achievements on Home, in navigation and after you save. Turning this off changes nothing else, and your progress is kept."
          defaultChecked={showProgress}
        />
      )}
    </SettingsForm>
  );
}
