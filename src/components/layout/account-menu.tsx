"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, LogOut, Settings, UserRound } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { useOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import { clearSavedPages } from "@/lib/offline/pwa";

/** Signed-in user's menu: who is signed in, settings, and sign out. */
export function AccountMenu({ email }: { email: string | null }) {
  const [pending, startTransition] = useTransition();
  const { waiting } = useOffline();
  const { show } = useToast();
  const [confirming, setConfirming] = useState(false);

  function leave() {
    setConfirming(false);
    if (!navigator.onLine) {
      show({
        tone: "error",
        message: "Signing out needs a connection. Try again when you’re back.",
      });
      return;
    }
    startTransition(async () => {
      // Saved screens hold this account's figures, so they go before anyone else can sign in.
      await clearSavedPages();
      await signOut();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Account" data-testid="account-menu">
            {pending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <UserRound className="size-[1.15rem]" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-72">
          <DropdownMenuLabel className="truncate">{email ?? "Signed in"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={() => (waiting.length > 0 ? setConfirming(true) : leave())}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {waiting.length === 1
                ? "1 entry hasn’t synced"
                : `${waiting.length} entries haven’t synced`}
            </DialogTitle>
            <DialogDescription>
              They stay on this device and sync when you sign in here again. They won’t appear on
              your other devices until then.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Stay signed in
              </Button>
            </DialogClose>
            <Button onClick={leave}>Sign out</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
