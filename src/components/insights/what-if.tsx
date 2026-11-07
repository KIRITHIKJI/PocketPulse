"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import {
  type CurrencyCode,
  type PurchaseGroup,
  moneyFormatter,
  whatIf,
  whatIfText,
} from "@/domain";

/** An optional estimate. Starts at one fewer and never suggests the purchase was a mistake. */
export function WhatIf({
  group,
  name,
  span,
  currency,
}: {
  group: PurchaseGroup;
  name: string;
  span: string;
  currency: CurrencyCode;
}) {
  const [fewer, setFewer] = React.useState(1);
  const result = whatIf(group, fewer);
  const money = moneyFormatter(currency);
  return (
    <Surface
      variant="inset"
      className="flex-row flex-wrap items-center gap-x-3 gap-y-2 p-2 type-body"
    >
      <span className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="One fewer"
          disabled={result.fewer <= 1}
          onClick={() => setFewer(result.fewer - 1)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <span className="w-7 text-center font-semibold money">{result.fewer}</span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="One more"
          disabled={result.fewer >= group.count}
          onClick={() => setFewer(result.fewer + 1)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </span>
      <p
        className="min-w-0 flex-1 basis-48 text-text-secondary money"
        aria-live="polite"
        data-testid="what-if"
      >
        {whatIfText(name, result, money, span)}
      </p>
    </Surface>
  );
}
