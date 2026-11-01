"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const online = useOnlineStatus();
  if (!online) {
    return (
      <StatePanel
        variant="offline"
        title="This needs a connection"
        description="You’re offline, so this screen couldn’t load. Nothing was changed. You can still record what you spend."
        actions={
          <Button asChild>
            <a href="/add">Add an entry</a>
          </Button>
        }
      />
    );
  }
  return (
    <StatePanel
      variant="error"
      title="Something went wrong on this screen"
      description={
        <>
          Nothing was saved or changed by this error. Try again, or head back home.
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
          <Button variant="outline" asChild>
            <Link href="/home">Go home</Link>
          </Button>
        </>
      }
    />
  );
}
