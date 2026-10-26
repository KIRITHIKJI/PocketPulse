"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { useMotionPreference } from "@/components/providers/motion-provider";
import { saveAppearance } from "@/lib/actions/settings";
import type { MotionPreference } from "@/lib/motion-preference";
import type { ThemePreference } from "@/lib/validation/settings";

type Appearance = { theme?: ThemePreference; motion?: MotionPreference };
type Persist = (patch: Appearance) => void;

const PersistContext = React.createContext<Persist | null>(null);

/** The profile values this device last applied or saved (to tell remote changes from local). */
const SYNCED_KEY = "pp-synced-appearance";

function readSynced(): Appearance {
  try {
    return JSON.parse(window.localStorage.getItem(SYNCED_KEY) ?? "{}") as Appearance;
  } catch {
    return {};
  }
}

function writeSynced(value: Appearance) {
  try {
    window.localStorage.setItem(SYNCED_KEY, JSON.stringify({ ...readSynced(), ...value }));
  } catch {
    // Storage blocked: the profile is still applied on every load, which is the safe default.
  }
}

/**
 * Signed-in users' theme and motion live in their profile, so a choice made on the laptop shows
 * up on the phone. A profile value is applied here only when it changed since this device last
 * synced — so a choice made on this device is never reverted by a save still in flight. The
 * theme/motion controls save back through `usePersistPreferences`. Outside the signed-in shell
 * there is no provider and the controls stay device-local.
 */
export function PreferenceSync({
  theme,
  motion,
  children,
}: {
  theme: ThemePreference;
  motion: MotionPreference;
  children: React.ReactNode;
}) {
  const { setTheme } = useTheme();
  const { setPreference } = useMotionPreference();

  React.useEffect(() => {
    const synced = readSynced();
    if (synced.theme !== theme) setTheme(theme);
    if (synced.motion !== motion) setPreference(motion);
    writeSynced({ theme, motion });
  }, [theme, motion, setTheme, setPreference]);

  const persist = React.useCallback<Persist>((patch) => {
    // Applied locally first; a failed save only means other devices don't pick it up yet.
    void saveAppearance(patch).then((result) => {
      if (result.ok) writeSynced(patch);
    });
  }, []);

  return <PersistContext.Provider value={persist}>{children}</PersistContext.Provider>;
}

export function usePersistPreferences(): Persist | null {
  return React.useContext(PersistContext);
}
