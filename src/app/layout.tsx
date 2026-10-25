import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppProviders } from "@/components/providers/app-providers";
import { MOTION_BOOT_SCRIPT } from "@/lib/motion-preference";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PocketPulse", template: "%s · PocketPulse" },
  description: "Track. Understand. Save. Fast expense logging, honest insights and savings goals.",
  applicationName: "PocketPulse",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14131f" },
    { media: "(prefers-color-scheme: light)", color: "#f9f9fc" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
