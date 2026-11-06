import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the design tokens in globals.css, so `text-caption` is a size (not a colour)
// and a later `text-sm` replaces a `type-*` role instead of both applying.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "body", "heading"],
      spacing: ["gutter", "surface", "stack", "section"],
    },
    classGroups: {
      "font-size": [{ type: ["caption", "body", "heading", "title", "display"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
