import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BottomNav } from "@/components/layout/bottom-nav";
import { AppearanceSettings } from "@/components/preferences/appearance-settings";
import { AppProviders } from "@/components/providers/app-providers";
import { StatePanel } from "@/components/states/state-panel";
import { MOTION_STORAGE_KEY } from "@/lib/motion-preference";

const pathname = vi.hoisted(() => ({ current: "/home" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("StatePanel", () => {
  it("announces errors and permission problems, but not plain empty states", () => {
    const { rerender } = render(<StatePanel variant="error" title="Failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed");

    rerender(<StatePanel variant="denied" title="No access" />);
    expect(screen.getByRole("alert")).toHaveTextContent("No access");

    rerender(<StatePanel variant="offline" title="Offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline");

    rerender(<StatePanel title="Nothing yet" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: "Nothing yet" })).toBeInTheDocument();
  });
});

describe("BottomNav", () => {
  it("has Home, Activity, a docked Add, Insights, Plan and You, and marks the current tab", () => {
    pathname.current = "/goals";
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const names = within(nav)
      .getAllByRole("listitem")
      .map((item) => {
        const control = item.querySelector("a, button")!;
        return control.getAttribute("aria-label") ?? control.textContent;
      });
    expect(names).toEqual(["Home", "Activity", "Add expense", "Insights", "Plan", "You"]);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute("href", "/add");
  });

  it("keeps Add in place on add screens, marked as current", () => {
    pathname.current = "/add/text";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("You opens a sheet with Reports, so Reports is two taps away", async () => {
    pathname.current = "/reports";
    const user = userEvent.setup();
    render(<BottomNav />);
    await user.click(screen.getByRole("button", { name: "You" }));
    const you = screen.getByRole("navigation", { name: "You" });
    expect(within(you).getByRole("link", { name: "Parent report" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(within(you).getByRole("link", { name: "Player status" })).toHaveAttribute(
      "href",
      "/rewards",
    );
    expect(screen.getByRole("navigation", { name: "All sections" })).toBeInTheDocument();
  });
});

describe("AppearanceSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.motion;
  });

  it("persists the motion preference and applies it to the document", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <AppearanceSettings />
      </AppProviders>,
    );
    const motion = screen.getByRole("radiogroup", { name: "Motion" });
    const reduced = within(motion).getByRole("radio", { name: "Reduced" });

    await user.click(reduced);
    expect(reduced).toBeChecked();
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");

    await user.click(within(motion).getByRole("radio", { name: "Match device" }));
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it("switches theme between midnight and light", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <AppearanceSettings />
      </AppProviders>,
    );
    const theme = screen.getByRole("radiogroup", { name: "Theme" });
    expect(theme.querySelector('[data-state="checked"]')).toHaveTextContent("Midnight");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement).toHaveClass("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });
});
