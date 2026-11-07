"use client";

import * as React from "react";

import { useToast } from "@/components/feedback/toast";
import { syncRewardFeedback } from "@/lib/actions/rewards";
import { type PlayerStatus, type RewardFeedback, hasFeedback } from "@/lib/rewards/feedback";

/** Achievements this device has greeted (shared with the rewards pages). */
export const SEEN_ACHIEVEMENTS_KEY = "pp-seen-achievements";
/** From the third XP line within this window, the line drops its reasons: "+10 XP". */
const XP_QUIET_WINDOW_MS = 30 * 60_000;
const XP_QUIET_AFTER = 2;

export function markAchievementsSeen(codes: readonly string[]) {
  try {
    const seen = new Set<string>(
      JSON.parse(window.localStorage.getItem(SEEN_ACHIEVEMENTS_KEY) ?? "[]") as string[],
    );
    for (const code of codes) seen.add(code);
    window.localStorage.setItem(SEEN_ACHIEVEMENTS_KEY, JSON.stringify([...seen]));
  } catch {
    // Blocked storage only means an achievement may be greeted again on the rewards pages.
  }
}

type RewardFeedbackValue = {
  /** Progress features are on (Settings). When off, rewards still sync but nothing pops up. */
  enabled: boolean;
  /** The newest player status this session has seen, for chips already on screen. */
  status: PlayerStatus | null;
  /** After a save was answered: sync its rewards and show what it earned. */
  afterSave: (sourceId: string) => void;
  /** After a delete or an Undo of `sourceId`: drop what it earned, take the server's status. */
  afterRemoval: (sourceId: string, status: PlayerStatus | undefined) => void;
  /** Feedback another action already brought back (a review, a mission button). */
  present: (feedback: RewardFeedback | null, sourceId?: string | null) => void;
};

const RewardFeedbackContext = React.createContext<RewardFeedbackValue | null>(null);

/**
 * Turns the server's account of a sync into the feedback ladder: a quiet XP line on the save's
 * confirmation (quieter still when it keeps happening), then a mission, an achievement and a
 * level, each in its own turn. Syncs run one after another, so two quick saves can't both report
 * the same award.
 */
export function RewardFeedbackProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { note, reward, cancel } = useToast();
  const [status, setStatus] = React.useState<PlayerStatus | null>(null);
  const chain = React.useRef<Promise<void>>(Promise.resolve());
  const cancelled = React.useRef(new Set<string>());
  const xpTimes = React.useRef<number[]>([]);

  const newer = React.useCallback((next: PlayerStatus | undefined) => {
    if (next) setStatus((now) => (now && now.asOf > next.asOf ? now : next));
  }, []);

  const present = React.useCallback(
    (feedback: RewardFeedback | null, sourceId: string | null = null) => {
      if (!feedback) return;
      newer(feedback.status);
      if (!enabled || !hasFeedback(feedback)) return;

      const parts: string[] = [];
      if (feedback.routineXp > 0) {
        const at = Date.now();
        const recent = xpTimes.current.filter((t) => at - t < XP_QUIET_WINDOW_MS);
        xpTimes.current = [...recent, at];
        const quiet = recent.length >= XP_QUIET_AFTER;
        parts.push(`+${feedback.routineXp} XP`);
        if (!quiet) parts.push(...feedback.routineReasons);
      }
      const step = feedback.progress[0];
      if (step) parts.push(`${step.title} ${step.progress} of ${step.target}`);
      if (parts.length > 0) {
        const text = parts.join(" · ");
        if (sourceId) note(sourceId, text);
        else reward("progress", { tone: "progress", message: text });
      }

      const missions = feedback.missionsCompleted;
      if (missions.length > 0) {
        const xp = missions.reduce((sum, m) => sum + m.xp, 0);
        reward(
          "mission",
          {
            tone: "milestone",
            title:
              missions.length === 1 ? "Mission complete" : `${missions.length} missions complete`,
            message: `${missions.map((m) => m.title).join(", ")} · +${xp} XP`,
          },
          sourceId,
        );
      }
      const unlocked = feedback.achievements;
      if (unlocked.length > 0) {
        markAchievementsSeen(unlocked.map((a) => a.code));
        const xp = unlocked.reduce((sum, a) => sum + a.xp, 0);
        reward(
          "achievement",
          {
            tone: "milestone",
            title:
              unlocked.length === 1
                ? "Achievement unlocked"
                : `${unlocked.length} achievements unlocked`,
            message:
              unlocked.length === 1
                ? `${unlocked[0]!.title}: ${unlocked[0]!.description} · +${xp} XP`
                : `${unlocked.map((a) => a.title).join(", ")} · +${xp} XP`,
          },
          sourceId,
        );
      }
      if (feedback.levelUp) {
        const { levelXp, levelSpan, progressBp } = feedback.status;
        reward(
          "level",
          { tone: "level", levelUp: { ...feedback.levelUp, levelXp, levelSpan, progressBp } },
          sourceId,
        );
      }
    },
    [enabled, newer, note, reward],
  );

  const afterSave = React.useCallback(
    (sourceId: string) => {
      chain.current = chain.current.then(async () => {
        if (cancelled.current.has(sourceId)) return;
        let feedback: RewardFeedback | null;
        try {
          feedback = await syncRewardFeedback();
        } catch {
          return; // Offline or a dropped answer: the next sync catches up.
        }
        // Undone while the sync ran: its own sync already said what's true now.
        if (cancelled.current.has(sourceId)) return;
        present(feedback, sourceId);
      });
    },
    [present],
  );

  const afterRemoval = React.useCallback(
    (sourceId: string, next: PlayerStatus | undefined) => {
      cancelled.current.add(sourceId);
      cancel(sourceId);
      newer(next);
    },
    [cancel, newer],
  );

  const value = React.useMemo(
    () => ({ enabled, status, afterSave, afterRemoval, present }),
    [enabled, status, afterSave, afterRemoval, present],
  );
  return <RewardFeedbackContext.Provider value={value}>{children}</RewardFeedbackContext.Provider>;
}

/** Outside the provider (tests, public screens) rewards are simply quiet. */
const QUIET: RewardFeedbackValue = {
  enabled: false,
  status: null,
  afterSave: () => {},
  afterRemoval: () => {},
  present: () => {},
};

export function useRewardFeedback(): RewardFeedbackValue {
  return React.useContext(RewardFeedbackContext) ?? QUIET;
}

/** The newer of the server-rendered status and the one the last save brought back. */
export function useLiveStatus(initial: PlayerStatus): PlayerStatus {
  const { status } = useRewardFeedback();
  return status && status.asOf > initial.asOf ? status : initial;
}
