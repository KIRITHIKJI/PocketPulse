"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useOffline } from "@/components/offline/offline-provider";
import { StatusBadge, opAmount } from "@/components/offline/sync-center";
import { Card } from "@/components/ui/card";
import { type CurrencyCode, formatMoney, sumPaise } from "@/domain";

const SHOWN = 3;

/**
 * Entries still on this device. The figures around this list come from the server, so they don't
 * include these yet, and the card says so rather than letting the numbers look wrong.
 */
export function WaitingEntries({ currency }: { currency: CurrencyCode }) {
  const { waiting } = useOffline();
  if (waiting.length === 0) return null;
  const total = sumPaise(
    waiting.flatMap((op) =>
      op.amountPaise !== null && ["create", "batch"].includes(op.command.kind)
        ? [op.amountPaise]
        : [],
    ),
  );
  return (
    <Card className="gap-3 p-4" data-testid="waiting-entries">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">On this device</h2>
        <Link
          href="/settings/sync"
          className="inline-flex min-h-6 items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          Sync status
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {waiting.slice(0, SHOWN).map((op) => (
          <li key={op.seq} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1 basis-32 truncate">{op.label}</span>
            <span className="tabular font-medium">{opAmount(op, currency)}</span>
            <StatusBadge status={op.status} />
          </li>
        ))}
      </ul>
      {waiting.length > SHOWN && (
        <p className="text-sm text-muted-foreground">And {waiting.length - SHOWN} more.</p>
      )}
      <p className="text-sm text-muted-foreground">
        {total > 0
          ? `${formatMoney(total, { currency })} recorded here isn’t in the figures on this screen yet. They’ll update once it syncs.`
          : "These changes aren’t in the figures on this screen yet. They’ll update once they sync."}
      </p>
    </Card>
  );
}
