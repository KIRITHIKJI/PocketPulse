import "server-only";

import { cache } from "react";

import { type LocalDate, daysBetween, totalXp } from "@/domain";
import { DataLoadError } from "@/lib/data/errors";
import { getProfile } from "@/lib/data/queries";
import { requestNow, requestToday, requireSession } from "@/lib/data/session";
import { type PlayerStatus, playerStatus } from "@/lib/rewards/feedback";

export type { PlayerStatus };

/**
 * The compact status for Home: stored XP (revoked awards excluded) and the stored streak. Read
 * only, with the user's own client; the server's reward sync is what keeps them current.
 */
export const getPlayerStatus = cache(async (): Promise<PlayerStatus> => {
  const { supabase } = await requireSession();
  const [events, streak, profile] = await Promise.all([
    supabase.from("xp_events").select("xp, revoked_at"),
    supabase.from("streak_state").select("current_daily, last_logged_date").maybeSingle(),
    getProfile(),
  ]);
  const error = events.error ?? streak.error;
  if (error) throw new DataLoadError("your progress", error.code);

  const xp = totalXp(
    (events.data ?? []).map((e) => ({
      xp: Number(e.xp),
      revokedAt: (e.revoked_at as string | null) ?? null,
    })),
  );
  const last = (streak.data?.last_logged_date as LocalDate | null | undefined) ?? null;
  const today = requestToday(profile.timeZone);
  const current = last !== null && daysBetween(last, today) <= 1;
  return playerStatus(xp, current ? Number(streak.data?.current_daily ?? 0) : 0, requestNow());
});
