"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";

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
      <MotionProvider>{children}</MotionProvider>
    </ThemeProvider>
  );
}
