"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Toast = {
  id: number;
  tone: "success" | "error";
  message: string;
  action?: { label: string; run: () => Promise<void> | void };
};

type ToastContextValue = {
  show: (toast: Omit<Toast, "id">) => void;
  dismiss: () => void;
  /** The entry recorded most recently in this session, for a brief highlight in lists. */
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 8_000;

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

  const dismiss = React.useCallback(() => setToast(null), []);
  const show = React.useCallback((next: Omit<Toast, "id">) => {
    nextId.current += 1;
    setRunning(false);
    setToast({ ...next, id: nextId.current });
  }, []);

  React.useEffect(() => {
    if (!toast || paused || running) return;
    const timer = window.setTimeout(() => setToast(null), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [toast, paused, running]);

  const value = React.useMemo(
    () => ({ show, dismiss, highlightId, setHighlightId }),
    [show, dismiss, highlightId],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:justify-end"
      >
        {toast && (
          <div
            key={toast.id}
            data-testid="toast"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className={cn(
              "pointer-events-auto flex w-full max-w-md animate-in items-center gap-3 rounded-2xl border bg-popover py-2.5 pr-2 pl-4 text-sm text-popover-foreground shadow-2xl duration-200 fade-in-0 slide-in-from-bottom-2",
              toast.tone === "error" && "border-destructive/40",
            )}
          >
            {toast.tone === "error" ? (
              <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-4 shrink-0 text-positive" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1">{toast.message}</p>
            {toast.action && (
              <Button
                size="sm"
                variant="ghost"
                className="text-primary"
                disabled={running}
                onClick={async () => {
                  setRunning(true);
                  try {
                    await toast.action!.run();
                  } finally {
                    setRunning(false);
                  }
                }}
              >
                {running ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Undo2 aria-hidden="true" />
                )}
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
