"use client";

import * as React from "react";

import { safeNextPath } from "@/lib/auth/routes";

/** This screen stands in for the page that was asked for, so reconnecting opens the real one. */
export function ReloadWhenOnline() {
  React.useEffect(() => {
    // The "online" event only means a network exists, not that it works. Leaving this screen on a
    // false alarm would cancel whatever the user just tapped, so ask the server first.
    const reload = async () => {
      const reached = await fetch("/manifest.webmanifest", { cache: "no-store" }).catch(() => null);
      if (!reached?.ok) return;
      const from = new URLSearchParams(window.location.search).get("from");
      window.location.replace(safeNextPath(from));
    };
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);
  return null;
}
