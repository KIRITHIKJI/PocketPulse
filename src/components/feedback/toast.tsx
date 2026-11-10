"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Award,
  CircleAlert,
  CircleCheck,
  Info,
  Sparkles,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";

import { LevelUpMoment, type LevelUp } from "@/components/feedback/level-up";
import { Button } from "@/components/ui/button";
import {
  type QueueState,
  type RewardTier,
  EMPTY_QUEUE,
  amendAction,
  cancelSource,
  dismiss as dismissItem,
  enqueueReward,
  showAction,
} from "@/lib/feedback-queue";
import { cn } from "@/lib/utils";

/**
 * The feedback ladder (doc/DESIGN_PLAN.md §3): `success` for a routine save, `progress` for XP or
 * mission progress, `milestone` for a completed mission, an achievement or a new level. Progress
 * and milestone messages come from the server's awards; the client never decides them.
 */
export type ToastTone = "success" | "error" | "info" | "progress" | "milestone";

type ActionToast = {
  tone: ToastTone;
  message: string;
  /** A short first line for milestones ("Achievement unlocked"). */
  title?: string;
  action?: { label: string; run: () => Promise<void> | void };
  /** A frequent, ordinary action (a tile save, a repeat): shown more quietly once it repeats. */
  routine?: boolean;
  /** How long it stays (and its Undo with it). Defaults to 8 s, 10 s for milestones. */
  durationMs?: number;
  quiet: boolean;
};

/** A reward waiting its turn: a toast, or (for a new level) the one full moment. */
export type RewardNotice =
  | { tone: "progress" | "milestone"; title?: string; message: string; durationMs?: number }
  | { tone: "level"; levelUp: LevelUp };

type ToastContextValue = {
  /** An action's confirmation: shows now. `sourceId` (the save's op id) lets rewards join it. */
  show: (toast: Omit<ActionToast, "quiet"> & { sourceId?: string | null }) => void;
  /** A reward: waits until nothing else is showing, in ladder order. */
  reward: (tier: RewardTier, notice: RewardNotice, sourceId?: string | null) => void;
  /** The quiet XP line: joins the save's confirmation if it's still up, else queues on its own. */
  note: (sourceId: string, text: string) => void;
  /** An Undo of `sourceId`: drops what it earned that hasn't shown yet. */
  cancel: (sourceId: string) => void;
  dismiss: () => void;
  /** The entry recorded most recently in this session, for a brief highlight in lists. */
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 8_000;
const MILESTONE_VISIBLE_MS = 10_000;
const PROGRESS_VISIBLE_MS = 4_000;
/** From the third routine toast within this window, routine toasts go quiet. */
const ROUTINE_WINDOW_MS = 2 * 60_000;
const ROUTINE_QUIET_AFTER = 2;

const TONES: Record<ToastTone, { icon: LucideIcon; iconClass: string; edge?: string }> = {
  success: { icon: CircleCheck, iconClass: "text-feedback-success" },
  error: { icon: CircleAlert, iconClass: "text-feedback-error", edge: "border-feedback-error/40" },
  info: { icon: Info, iconClass: "text-feedback-info" },
  progress: { icon: Sparkles, iconClass: "text-progress-xp", edge: "border-progress-xp/35" },
  milestone: { icon: Award, iconClass: "text-rank", edge: "border-progress-xp/60" },
};

type State = QueueState<ActionToast, RewardNotice>;

const CARRY_KEY = "pocketpulse:toast-on-arrival";
/** A carried message older than this is from a navigation that never happened; it's dropped. */
const CARRY_MS = 30_000;

/**
 * Keeps a confirmation for the screen at `path` even if getting there reloads the page. Offline,
 * a screen whose data can't be fetched opens as a full page load of its saved copy, which wipes a
 * toast held in memory. Shown once on arrival after a reload; a soft navigation keeps the toast
 * that's already showing and only clears this.
 */
export function carryToast(path: string, message: string) {
  try {
    window.sessionStorage.setItem(CARRY_KEY, JSON.stringify({ path, message, at: Date.now() }));
  } catch {
    // Without storage, a soft navigation still keeps the toast; only a reload loses it.
  }
}

function takeCarried(path: string): string | null {
  try {
    const carried = JSON.parse(window.sessionStorage.getItem(CARRY_KEY) ?? "null") as {
      path?: string;
      message?: string;
      at?: number;
    } | null;
    if (!carried) return null;
    const stale = Date.now() - Number(carried.at) > CARRY_MS;
    if (carried.path !== path && !stale) return null;
    window.sessionStorage.removeItem(CARRY_KEY);
    return carried.path === path && !stale ? (carried.message ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * One pop-up at a time (`lib/feedback-queue.ts`), announced politely to screen readers, above
 * the mobile bottom bar. It lives in the app layout, so an Undo offered on one screen survives
 * navigating to another.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(EMPTY_QUEUE);
  const [running, setRunning] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const nextId = React.useRef(0);
  const routineTimes = React.useRef<number[]>([]);
  const id = () => (nextId.current += 1);
  const pathname = usePathname();
  const loaded = React.useRef(false);

  const dismiss = React.useCallback(() => setState((s) => dismissItem(s)), []);
  const show = React.useCallback<ToastContextValue["show"]>(({ sourceId = null, ...next }) => {
    let quiet = false;
    if (next.routine) {
      const now = Date.now();
      const recent = routineTimes.current.filter((time) => now - time < ROUTINE_WINDOW_MS);
      quiet = recent.length >= ROUTINE_QUIET_AFTER;
      routineTimes.current = [...recent, now];
    }
    setRunning(false);
    setState((s) =>
      showAction(s, {
        kind: "action",
        id: id(),
        sourceId,
        note: null,
        payload: { ...next, quiet },
      }),
    );
  }, []);
  const reward = React.useCallback<ToastContextValue["reward"]>(
    (tier, notice, sourceId = null) =>
      setState((s) =>
        enqueueReward(s, { kind: "reward", id: id(), sourceId, tier, payload: notice }),
      ),
    [],
  );
  const note = React.useCallback<ToastContextValue["note"]>(
    (sourceId, text) =>
      setState(
        (s) =>
          amendAction(s, sourceId, text) ??
          enqueueReward(s, {
            kind: "reward",
            id: id(),
            sourceId,
            tier: "progress",
            payload: { tone: "progress", message: text },
          }),
      ),
    [],
  );
  const cancel = React.useCallback(
    (sourceId: string) => setState((s) => cancelSource(s, sourceId)),
    [],
  );

  // A confirmation carried across a reload shows on the page it was meant for, once.
  React.useEffect(() => {
    if (!pathname) return;
    const message = takeCarried(pathname);
    const fresh = !loaded.current;
    loaded.current = true;
    if (message && fresh) show({ tone: "success", message });
  }, [pathname, show]);

  const current = state.current;
  React.useEffect(() => {
    if (!current || paused || running) return;
    const payload = current.payload;
    if (current.kind === "reward" && payload.tone === "level") return; // Dismissed by the person.
    const visible =
      ("durationMs" in payload ? payload.durationMs : undefined) ??
      (payload.tone === "milestone"
        ? MILESTONE_VISIBLE_MS
        : payload.tone === "progress"
          ? PROGRESS_VISIBLE_MS
          : VISIBLE_MS);
    const timer = window.setTimeout(() => setState((s) => dismissItem(s, current.id)), visible);
    return () => window.clearTimeout(timer);
  }, [current, paused, running]);

  const value = React.useMemo(
    () => ({ show, reward, note, cancel, dismiss, highlightId, setHighlightId }),
    [show, reward, note, cancel, dismiss, highlightId],
  );

  const level =
    current?.kind === "reward" && current.payload.tone === "level" ? current.payload.levelUp : null;
  const toast =
    current && !level
      ? {
          ...(current.payload as Exclude<RewardNotice, { tone: "level" }> & Partial<ActionToast>),
          note: current.kind === "action" ? current.note : null,
        }
      : null;
  const tone = toast ? TONES[toast.tone] : null;
  const Icon = tone?.icon;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {level && current && (
        <LevelUpMoment
          key={current.id}
          levelUp={level}
          onDismiss={() => setState((s) => dismissItem(s, current.id))}
        />
      )}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:justify-end"
      >
        {toast && tone && Icon && current && (
          <div
            key={current.id}
            data-testid="toast"
            data-tone={toast.tone}
            data-quiet={toast.quiet || undefined}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-(--toast-bg) pr-2 text-sm text-popover-foreground shadow-(--surface-overlay-shadow)",
              toast.quiet
                ? "max-w-sm py-1.5 pl-3"
                : "animate-in py-2.5 pl-4 duration-200 fade-in-0 slide-in-from-bottom-2",
              tone.edge,
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                tone.iconClass,
                toast.tone === "milestone" && "pp-milestone-ring rounded-full",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              {toast.title ? <p className="font-medium">{toast.title}</p> : null}
              <p className={cn(toast.title && "text-muted-foreground")}>{toast.message}</p>
              {toast.note ? (
                <p className="type-caption text-progress-xp" data-testid="toast-xp">
                  {toast.note}
                </p>
              ) : null}
            </div>
            {toast.action && (
              <Button
                size="sm"
                variant="ghost"
                className="text-primary"
                loading={running}
                onClick={async () => {
                  setRunning(true);
                  try {
                    await toast.action!.run();
                  } finally {
                    setRunning(false);
                  }
                }}
              >
                <Undo2 aria-hidden="true" />
                {toast.action.label}
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={dismiss}>
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
