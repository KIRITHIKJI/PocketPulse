"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Copies to this device's clipboard only. If that's blocked, the text is shown to copy by hand. */
export function CopyReportText({ text }: { text: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "blocked">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("blocked");
    }
  }

  return (
    <>
      <Button variant="outline" onClick={copy}>
        {state === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {state === "copied" ? "Copied" : "Copy text summary"}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Report summary copied." : ""}
      </span>
      {state === "blocked" && (
        <textarea
          readOnly
          aria-label="Report summary"
          value={text}
          rows={10}
          className="w-full rounded-lg border bg-background p-3 text-sm"
        />
      )}
    </>
  );
}
