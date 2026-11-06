"use client";

import Link from "next/link";
import { RotateCcw, Zap } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Home couldn't load. Logging is the one thing that must still work, so both forms offer Quick
 * add, which saves on this device when there's no connection.
 */
export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const online = useOnlineStatus();
  const add = (
    <Button variant={online ? "outline" : "default"} asChild>
      <Link href="/add">
        <Zap aria-hidden="true" />
        Quick add
      </Link>
    </Button>
  );
  if (!online) {
    return (
      <StatePanel
        variant="offline"
        title="Home needs a connection to load"
        description="You’re offline and this screen wasn’t saved on this device yet. You can still log what you spend; it syncs when you’re back."
        actions={add}
      />
    );
  }
  return (
    <StatePanel
      variant="error"
      title="Home couldn’t load"
      description={
        <>
          Nothing was changed. Try again, or log an expense while this sorts itself out.
          {error.digest ? (
            <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>
          ) : null}
        </>
      }
      actions={
        <>
          <Button onClick={reset}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
          {add}
        </>
      }
    />
  );
}
