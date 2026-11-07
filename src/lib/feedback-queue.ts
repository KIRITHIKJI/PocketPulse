/**
 * The one-at-a-time rule for pop-ups (doc/DESIGN_PLAN.md §3). There is never more than one
 * `current` item; everything else waits in `waiting`, in the order of the feedback ladder.
 *
 * - An action's confirmation (a save, an Undo, an error) shows at once. It replaces an older
 *   confirmation, and puts a reward that was showing back in line, in its place on the ladder.
 * - Rewards wait their turn: missions, then achievements, then a new level (the one peak).
 * - The quiet XP line joins the confirmation of the save that earned it, when that's still up.
 * - Undoing a save cancels what it earned that hasn't shown yet.
 */

export type RewardTier = "progress" | "mission" | "achievement" | "level";

/** Ladder order: smaller shows first. */
const TIER_ORDER: Record<RewardTier, number> = {
  progress: 0,
  mission: 1,
  achievement: 2,
  level: 3,
};

export interface ActionItem<T> {
  kind: "action";
  id: number;
  /** The save this confirms (its op id), so its XP line can join it and an Undo can cancel. */
  sourceId: string | null;
  note: string | null;
  payload: T;
}

export interface RewardItem<R> {
  kind: "reward";
  id: number;
  sourceId: string | null;
  tier: RewardTier;
  payload: R;
}

export type QueueItem<T, R> = ActionItem<T> | RewardItem<R>;

export interface QueueState<T, R> {
  current: QueueItem<T, R> | null;
  waiting: RewardItem<R>[];
}

export const EMPTY_QUEUE: QueueState<never, never> = { current: null, waiting: [] };

function insert<R>(waiting: RewardItem<R>[], item: RewardItem<R>): RewardItem<R>[] {
  const at = waiting.findIndex((w) => TIER_ORDER[w.tier] > TIER_ORDER[item.tier]);
  return at === -1 ? [...waiting, item] : [...waiting.slice(0, at), item, ...waiting.slice(at)];
}

/** Like `insert`, but ahead of others of the same tier: it was already showing. */
function insertFirst<R>(waiting: RewardItem<R>[], item: RewardItem<R>): RewardItem<R>[] {
  const at = waiting.findIndex((w) => TIER_ORDER[w.tier] >= TIER_ORDER[item.tier]);
  return at === -1 ? [...waiting, item] : [...waiting.slice(0, at), item, ...waiting.slice(at)];
}

export function showAction<T, R>(state: QueueState<T, R>, item: ActionItem<T>): QueueState<T, R> {
  const { current } = state;
  // A reward that was on screen isn't lost: it goes back in line, ahead of any of its own tier.
  const waiting = current?.kind === "reward" ? insertFirst(state.waiting, current) : state.waiting;
  return { current: item, waiting };
}

export function enqueueReward<T, R>(
  state: QueueState<T, R>,
  item: RewardItem<R>,
): QueueState<T, R> {
  if (state.current === null) return { current: item, waiting: state.waiting };
  return { current: state.current, waiting: insert(state.waiting, item) };
}

/**
 * Adds the quiet XP line to the confirmation of the save that earned it. Returns null when that
 * confirmation is no longer showing, so the caller can queue the line as its own small notice.
 */
export function amendAction<T, R>(
  state: QueueState<T, R>,
  sourceId: string,
  note: string,
): QueueState<T, R> | null {
  const { current } = state;
  if (current?.kind !== "action" || current.sourceId !== sourceId) return null;
  return { ...state, current: { ...current, note } };
}

/** The current item goes; the next in line (if any) shows. */
export function dismiss<T, R>(state: QueueState<T, R>, id?: number): QueueState<T, R> {
  if (state.current === null || (id !== undefined && state.current.id !== id)) return state;
  const [next = null, ...rest] = state.waiting;
  return { current: next, waiting: rest };
}

/** An Undo of `sourceId`: whatever that save earned and hasn't shown yet never shows. */
export function cancelSource<T, R>(state: QueueState<T, R>, sourceId: string): QueueState<T, R> {
  const waiting = state.waiting.filter((w) => w.sourceId !== sourceId);
  const { current } = state;
  if (current?.kind === "reward" && current.sourceId === sourceId) {
    const [next = null, ...rest] = waiting;
    return { current: next, waiting: rest };
  }
  return { current, waiting };
}
