"use client";

import * as React from "react";

import { noteInsightExplored } from "@/lib/actions/rewards";

/** Notes once that the entries behind an insight were opened. It shows nothing. */
export function InsightExplored({ scope }: { scope: string }) {
  React.useEffect(() => {
    void noteInsightExplored(scope).catch(() => undefined);
  }, [scope]);
  return null;
}
