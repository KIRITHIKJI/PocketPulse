"use client";

import * as React from "react";
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

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The feedback ladder (doc/DESIGN_PLAN.md §3): `success` for a routine save, `progress` for XP or
 * mission progress, `milestone` for a completed mission, an achievement or a new level. Progress
 * and milestone messages come from the server's awards; the client never decides them.
 */
export type ToastTone = "success" | "error" | "info" | "progress" | "milestone";

type Toast = {
  id: number;
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

type ToastContextValue = {
  show: (toast: Omit<Toast, "id" | "quiet">) => void;
  dismiss: () => void;
  /** The entry recorded most recently in this session, for a brief highlight in lists. */
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 8_000;
const MILESTONE_VISIBLE_MS = 10_000;
/** From the third routine toast within this window, routine toasts go quiet. */
const ROUTINE_WINDOW_MS = 2 * 60_000;
const ROUTINE_QUIET_AFTER = 2;

const TONES: Record<ToastTone, { icon: LucideIcon; iconClass: string; edge?: string }> = {
  success: { icon: CircleCheck, iconClass: "text-feedback-success" },
  error: { icon: CircleAlert, iconClass: "text-feedback-error", edge: "border-feedback-error/40" },
  info: { icon: Info, iconClass: "text-feedback-info" },
  progress: { icon: Sparkles, iconClass: "text-progress-xp", edge: "border-progress-xp/35" },
  milestone: { icon: Award, iconClass: "text-progress-xp", edge: "border-progress-xp/60" },
};

/**
 * One toast at a time, announced politely to screen readers, above the mobile bottom bar. It
 * lives in the app layout, so an Undo offered on one screen survives navigating to another.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [running, setRunning] = React.useState(false);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);
  const nextId = React.useRef(0);
  const routineTimes = React.useRef<number[]>([]);

  const dismiss = React.useCallback(() => setToast(null), []);
  const show = React.useCallback((next: Omit<Toast, "id" | "quiet">) => {
    let quiet = false;
    if (next.routine) {
      const now = Date.now();
      const recent = routineTimes.current.filter((time) => now - time < ROUTINE_WINDOW_MS);
      quiet = recent.length >= ROUTINE_QUIET_AFTER;
      routineTimes.current = [...recent, now];
    }
    nextId.current += 1;
    setRunning(false);
    setToast({ ...next, id: nextId.current, quiet });
  }, []);

  React.useEffect(() => {
    if (!toast || paused || running) return;
    const visible =
      toast.durationMs ?? (toast.tone === "milestone" ? MILESTONE_VISIBLE_MS : VISIBLE_MS);
    const timer = window.setTimeout(() => setToast(null), visible);
    return () => window.clearTimeout(timer);
  }, [toast, paused, running]);

  const value = React.useMemo(
    () => ({ show, dismiss, highlightId, setHighlightId }),
    [show, dismiss, highlightId],
  );

  const tone = toast ? TONES[toast.tone] : null;
  const Icon = tone?.icon;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:justify-end"
      >
        {toast && tone && Icon && (
          <div
            key={toast.id}
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
            <Icon className={cn("size-4 shrink-0", tone.iconClass)} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {toast.title ? <p className="font-medium">{toast.title}</p> : null}
              <p className={cn(toast.title && "text-muted-foreground")}>{toast.message}</p>
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
