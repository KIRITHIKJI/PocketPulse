"use client";

import * as React from "react";

import { clearSavedPages } from "@/lib/offline/pwa";
import { loadQueue } from "@/lib/offline/load-queue";

/** Set just before an account deletion is requested. It only acts once that has really happened. */
export const DELETING_OWNER_KEY = "pp-deleting-owner";

/**
 * On a signed-out screen, saved pages can only belong to someone who has left. A queue stays
 * (it syncs on the next sign-in), unless the account itself is gone.
 */
export function ForgetDevice({ accountDeleted = false }: { accountDeleted?: boolean }) {
  React.useEffect(() => {
    void clearSavedPages();
    if (!accountDeleted) return;
    try {
      const ownerId = window.sessionStorage.getItem(DELETING_OWNER_KEY);
      if (ownerId) {
        void loadQueue()
          .then(({ forgetOwner }) => forgetOwner(ownerId))
          .catch(() => undefined);
      }
      window.sessionStorage.removeItem(DELETING_OWNER_KEY);
    } catch {
      // Blocked storage has no queue to clear either.
    }
  }, [accountDeleted]);
  return null;
}
