"use client";

import * as React from "react";
import { PartyPopper, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const SEEN_KEY = "pp-seen-achievements";
const COLORS = ["#8b5cf6", "#a3e635", "#f472b6", "#38bdf8", "#facc15", "#c4b5fd"];

function readSeen(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/**
 * Greets an achievement once per device, on this page only. It covers nothing, and the burst isn't
 * drawn under reduced motion. Every achievement a device hasn't seen yet shows together, so a long
 * list can't queue up a string of celebrations.
 */
export function AchievementCelebration({
  unlocked,
}: {
  unlocked: { code: string; title: string }[];
}) {
  const [fresh, setFresh] = React.useState<{ code: string; title: string }[]>([]);

  React.useEffect(() => {
    const seen = new Set(readSeen());
    const unseen = unlocked.filter((a) => !seen.has(a.code));
    try {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(unlocked.map((a) => a.code)));
    } catch {
      // Blocked storage only means this may greet the same achievement again.
    }
    // Only this browser knows what it has seen, so this can't be decided during the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (unseen.length > 0) setFresh(unseen);
  }, [unlocked]);

  if (fresh.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="achievement-celebration"
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-positive/40 bg-positive-soft p-4"
    >
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * 2 * Math.PI;
        const style = {
          "--pp-x": `${Math.round(Math.cos(angle) * 170)}px`,
          "--pp-y": `${Math.round(Math.sin(angle) * 56)}px`,
          backgroundColor: COLORS[i % COLORS.length],
          animationDelay: `${(i % 4) * 40}ms`,
        } as React.CSSProperties;
        return <span key={i} aria-hidden="true" className="pp-celebrate-piece" style={style} />;
      })}
      <span className="pp-celebrate-pop flex size-11 shrink-0 items-center justify-center rounded-full bg-positive text-background">
        <PartyPopper className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {fresh.length === 1 ? "New achievement" : `${fresh.length} new achievements`}
        </p>
        <p className="text-sm text-muted-foreground">{fresh.map((a) => a.title).join(", ")}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setFresh([])}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
