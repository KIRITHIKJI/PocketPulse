"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";

import { ServiceWorker } from "@/components/offline/service-worker";
import { MotionProvider } from "@/components/providers/motion-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      enableSystem
      disableTransitionOnChange
    >
      <ServiceWorker />
      <MotionProvider>{children}</MotionProvider>
    </ThemeProvider>
  );
}
