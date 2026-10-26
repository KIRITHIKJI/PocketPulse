"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { usePersistPreferences } from "@/components/providers/preference-sync";
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
import type { ThemePreference } from "@/lib/validation/settings";

export const THEME_OPTIONS = [
  { value: "dark", label: "Midnight", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Match device", icon: Monitor },
] as const;

/**
 * Compact header control; the Settings page offers the same choice as a segmented control.
 * Signed in, the choice is also saved to the profile so other devices follow it.
 */
export function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const persist = usePersistPreferences();
  const hydrated = useHydrated();
  const choose = (value: string) => {
    setTheme(value);
    persist?.({ theme: value as ThemePreference });
  };
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
          onValueChange={choose}
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
