"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";

export const THEME_OPTIONS = [
  { value: "dark", label: "Midnight", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Match device", icon: Monitor },
] as const;

/** Compact header control; the Settings page offers the same choice as a segmented control. */
export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const Icon = hydrated && resolvedTheme === "light" ? Sun : Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme" data-testid="theme-switcher">
          <Icon className="size-[1.15rem]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={hydrated ? (theme ?? "dark") : "dark"}
          onValueChange={setTheme}
        >
          {THEME_OPTIONS.map(({ value, label, icon: OptionIcon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <OptionIcon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
