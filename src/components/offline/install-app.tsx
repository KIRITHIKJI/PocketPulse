"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function installedAlready() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

/** Chrome offers a real install button. iPhones and others only have the browser's own menu. */
export function InstallApp() {
  const [prompt, setPrompt] = React.useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    // Only the browser knows this, so it can only be read once the page is running here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(installedAlready());
    const offer = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  if (installed === null || installed) return null;

  async function install() {
    await prompt?.prompt();
    setPrompt(null);
  }

  return (
    <Card className="flex-row flex-wrap items-center justify-between gap-3" data-testid="install">
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="font-semibold">Install PocketPulse</h2>
        <p className="text-sm text-muted-foreground">
          {prompt
            ? "Adds it to your home screen, so it opens like an app, even with no connection."
            : "On Android Chrome: menu, then Add to Home screen. On iPhone Safari: Share, then Add to Home Screen."}
        </p>
      </div>
      {prompt && (
        <Button onClick={install}>
          <Download aria-hidden="true" />
          Install
        </Button>
      )}
    </Card>
  );
}
