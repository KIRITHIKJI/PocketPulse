import type { Metadata } from "next";
import { CalendarCheck, CircleCheck, Flame, Lock, Trophy } from "lucide-react";

import { InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { Meter, PlanNote } from "@/components/plan/parts";
import { AchievementCelebration } from "@/components/rewards/achievement-celebration";
import { SaveEarnedRewards } from "@/components/rewards/save-earned-rewards";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DETECTIVE_INSIGHTS, levelFor, totalXp } from "@/domain";
import { changeQuest, completeWeeklyReview } from "@/lib/actions/rewards";
import { factsFrom } from "@/lib/rewards/engine";
import { previewRewards, rewardCatalog } from "@/lib/rewards/sync";

export const metadata: Metadata = { title: "Rewards" };

const CADENCE = { daily: "Today", weekly: "This week", once: "Once" } as const;

async function loadRewards() {
  try {
    return await previewRewards();
  } catch {
    return null;
  }
}

export default async function RewardsPage() {
  const [catalog, outcome] = await Promise.all([rewardCatalog(), loadRewards()]);
  const header = (
    <PageHeader
      title="Rewards"
      description="XP, levels, streaks and achievements for logging consistently and reviewing your money, never for spending less."
    />
  );
  if (!outcome) {
    return (
      <>
        {header}
        <StatePanel
          variant="error"
          title="Rewards aren’t available right now"
          description="Your entries are safe. Rewards will catch up on their own the next time this works."
        />
      </>
    );
  }

  const { state, result, streaks } = outcome;
  const xp = totalXp(state.events);
  const level = levelFor(xp);
  const unlocked = new Set(state.achievements.map((a) => a.code));
  const facts = factsFrom(state);
  const fresh = catalog.achievements
    .filter((a) => unlocked.has(a.code))
    .map((a) => ({ code: a.code, title: a.title }));
  const progressByCode = new Map(result.quests.map((q) => [q.code, q]));
  const hiddenQuests = catalog.quests.filter((q) => facts.optedOutQuests.includes(q.code));
  const shownQuests = catalog.quests.filter((q) => !facts.optedOutQuests.includes(q.code));
  const reviewed = progressByCode.get("weekly_review")?.complete ?? false;

  return (
    <>
      {header}
      <AchievementCelebration unlocked={fresh} />
      {outcome.changed && <SaveEarnedRewards />}

      {xp === 0 && (
        <StatePanel
          icon={Trophy}
          title="Your first achievement is one entry away"
          description="Achievements like First 10 Transactions and 7-Day Logging Streak unlock from your own activity."
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="gap-2">
          <h2 className="text-sm text-muted-foreground">Level</h2>
          <p className="tabular text-4xl font-semibold tracking-tight" data-testid="reward-level">
            {level.level}
          </p>
          <Meter bp={level.progressBp} tone="positive" />
          <p className="tabular text-xs text-muted-foreground" data-testid="reward-xp">
            {xp} XP · next level at {level.nextLevelXp}
          </p>
        </Card>
        <Card className="gap-2">
          <h2 className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flame className="size-4" aria-hidden="true" />
            Daily streak
          </h2>
          <p className="tabular text-4xl font-semibold tracking-tight" data-testid="streak-daily">
            {streaks.currentDaily}
          </p>
          <p className="text-xs text-muted-foreground">
            {streaks.currentDaily === 1 ? "day" : "days"} logging · longest {streaks.longestDaily}
          </p>
        </Card>
        <Card className="gap-2">
          <h2 className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarCheck className="size-4" aria-hidden="true" />
            Weekly streak
          </h2>
          <p className="tabular text-4xl font-semibold tracking-tight" data-testid="streak-weekly">
            {streaks.currentWeekly}
          </p>
          <p className="text-xs text-muted-foreground">
            {streaks.currentWeekly === 1 ? "week" : "weeks"} logging · longest{" "}
            {streaks.longestWeekly}
          </p>
        </Card>
      </div>

      <section aria-labelledby="quests-heading" className="flex flex-col gap-3">
        <h2 id="quests-heading" className="font-semibold">
          Quests
        </h2>
        <p className="text-sm text-muted-foreground">
          All optional. Skipping one costs nothing, and you can bring it back.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {shownQuests.map((quest) => {
            const done = progressByCode.get(quest.code)?.complete ?? false;
            return (
              <li key={quest.code} className="min-w-0">
                <Card className="h-full gap-2" data-testid="quest-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{quest.title}</h3>
                      <p className="text-sm text-muted-foreground">{quest.description}</p>
                    </div>
                    {done ? (
                      <Badge variant="positive">
                        <CircleCheck aria-hidden="true" />
                        Done
                      </Badge>
                    ) : (
                      <Badge variant="outline">{quest.xp} XP</Badge>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
                    <span className="mr-auto">{CADENCE[quest.cadence]}</span>
                    {quest.code === "weekly_review" && !reviewed && (
                      <InlineAction
                        action={completeWeeklyReview}
                        fields={{}}
                        pendingLabel="Saving…"
                        variant="outline"
                      >
                        I’ve reviewed this week
                      </InlineAction>
                    )}
                    <InlineAction
                      action={changeQuest}
                      fields={{ code: quest.code, optOut: "true" }}
                      pendingLabel="Saving…"
                      aria-label={`Skip the ${quest.title} quest`}
                    >
                      Skip
                    </InlineAction>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        {hiddenQuests.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {hiddenQuests.map((quest) => (
              <li key={quest.code}>
                <InlineAction
                  action={changeQuest}
                  fields={{ code: quest.code, optOut: "false" }}
                  pendingLabel="Saving…"
                  variant="outline"
                >
                  Bring back {quest.title}
                </InlineAction>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="achievements-heading" className="flex flex-col gap-3">
        <h2 id="achievements-heading" className="font-semibold">
          Achievements · {unlocked.size} of {catalog.achievements.length}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {catalog.achievements.map((achievement) => {
            const earned = unlocked.has(achievement.code);
            return (
              <li key={achievement.code} className="min-w-0">
                <Card
                  className="h-full flex-row items-start gap-3"
                  data-testid="achievement"
                  data-earned={earned}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${earned ? "bg-positive-soft text-positive" : "bg-muted text-muted-foreground"}`}
                  >
                    {earned ? <Trophy className="size-5" /> : <Lock className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{achievement.title}</h3>
                    <p className="text-sm text-muted-foreground">{achievement.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {earned ? "Unlocked" : `${achievement.xp} XP`}
                      {achievement.code === "spending_detective" && !earned
                        ? ` · ${facts.insightsExplored} of ${DETECTIVE_INSIGHTS} so far`
                        : ""}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <PlanNote>
        XP comes from logging, categorising, reviewing and saving. Spending never costs you XP, and
        editing or deleting an entry doesn’t change what you’ve earned. A streak is only a count:
        taking a break is fine, and your longest streak stays.
      </PlanNote>
    </>
  );
}
