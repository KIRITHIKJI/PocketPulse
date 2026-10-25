"use client";

import { Monitor, Sparkles, Turtle } from "lucide-react";
import { useTheme } from "next-themes";

import { THEME_OPTIONS } from "@/components/preferences/theme-switcher";
import { useMotionPreference } from "@/components/providers/motion-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useHydrated } from "@/hooks/use-hydrated";
import type { MotionPreference } from "@/lib/motion-preference";

const MOTION_OPTIONS = [
  { value: "system", label: "Match device", icon: Monitor },
  { value: "reduce", label: "Reduced", icon: Turtle },
  { value: "full", label: "Full", icon: Sparkles },
] as const satisfies readonly { value: MotionPreference; label: string; icon: typeof Monitor }[];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { preference, setPreference } = useMotionPreference();
  const hydrated = useHydrated();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 id="theme-label" className="text-sm font-medium">
          Theme
        </h3>
        <SegmentedControl
          aria-label="Theme"
          value={hydrated ? ((theme ?? "dark") as (typeof THEME_OPTIONS)[number]["value"]) : "dark"}
          onValueChange={setTheme}
          options={THEME_OPTIONS}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Motion</h3>
        <SegmentedControl
          aria-label="Motion"
          value={hydrated ? preference : "system"}
          onValueChange={setPreference}
          options={MOTION_OPTIONS}
        />
        <p className="text-sm text-muted-foreground">
          “Match device” follows your system’s reduce-motion setting. Reduced turns off
          non-essential animation such as number roll-ups and celebrations.
        </p>
      </div>
    </div>
  );
}
