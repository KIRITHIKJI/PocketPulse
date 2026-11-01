/**
 * Draws the app icons in public/icons from the PocketPulse mark, using the Playwright browser.
 * The PNGs are committed, so this only needs running again if the mark changes:
 *   node scripts/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const SIZES = [
  { file: "public/icons/icon-192.png", size: 192, maskable: false },
  { file: "public/icons/icon-512.png", size: 512, maskable: false },
  { file: "public/icons/icon-maskable-512.png", size: 512, maskable: true },
  { file: "src/app/apple-icon.png", size: 180, maskable: true },
];

/** A maskable icon fills its square and keeps the mark inside the middle 80 %. */
function mark(maskable) {
  const inner = `
    <path d="M6 17h5l2.5-6 4 11 2.5-5H26" fill="none" stroke="white" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="25.5" cy="8.5" r="2.5" fill="oklch(0.88 0.19 128)" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="oklch(0.72 0.19 293)" />
      <stop offset="1" stop-color="oklch(0.52 0.23 285)" />
    </linearGradient></defs>
    <rect width="32" height="32" rx="${maskable ? 0 : 9}" fill="url(#g)" />
    ${maskable ? `<g transform="translate(3.2 3.2) scale(0.8)">${inner}</g>` : inner}
  </svg>`;
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("src/app/icon.svg", mark(false));
const browser = await chromium.launch();
for (const { file, size, maskable } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<!doctype html><style>*{margin:0}svg{display:block;width:100vw;height:100vh}</style>${mark(maskable)}`,
  );
  await page.screenshot({ path: file, omitBackground: true });
  await page.close();
}
await browser.close();
