import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // The worker must never be served stale, or a fix to it couldn't reach installed apps.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  // Loaded at runtime, so the deployed report route has to be told to keep them.
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
  outputFileTracingIncludes: {
    "/reports/export": [
      "./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
      "./node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf",
    ],
  },
};

export default nextConfig;
