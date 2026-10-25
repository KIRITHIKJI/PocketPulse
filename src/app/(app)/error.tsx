"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
