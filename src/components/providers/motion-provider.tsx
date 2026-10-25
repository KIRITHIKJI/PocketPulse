"use client";

import * as React from "react";
import { MotionConfig } from "motion/react";

import {
  MOTION_STORAGE_KEY,
  parseMotionPreference,
  toReducedMotionConfig,
  type MotionPreference,
} from "@/lib/motion-preference";

type MotionContextValue = {
  preference: MotionPreference;
  setPreference: (preference: MotionPreference) => void;
};

const MotionPreferenceContext = React.createContext<MotionContextValue | null>(null);

const listeners = new Set<() => void>();

function readPreference(): MotionPreference {
  try {
    return parseMotionPreference(window.localStorage.getItem(MOTION_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === MOTION_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writePreference(preference: MotionPreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(MOTION_STORAGE_KEY);
    else window.localStorage.setItem(MOTION_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the preference then lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const preference = React.useSyncExternalStore(subscribe, readPreference, () => "system" as const);

  React.useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") delete root.dataset.motion;
    else root.dataset.motion = preference;
  }, [preference]);

  const value = React.useMemo(() => ({ preference, setPreference: writePreference }), [preference]);

  return (
    <MotionPreferenceContext.Provider value={value}>
      <MotionConfig reducedMotion={toReducedMotionConfig(preference)}>{children}</MotionConfig>
    </MotionPreferenceContext.Provider>
  );
}

export function useMotionPreference(): MotionContextValue {
  const context = React.useContext(MotionPreferenceContext);
  if (!context) throw new Error("useMotionPreference must be used inside <MotionProvider>");
  return context;
}
