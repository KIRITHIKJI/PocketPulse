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
  it("marks the tab covering the current screen and links to quick add", () => {
    pathname.current = "/goals";
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Add expense" })).toHaveAttribute("href", "/add");
  });

  it("hides the add button while already on an add screen", () => {
    pathname.current = "/add/text";
    render(<BottomNav />);
    expect(screen.queryByRole("link", { name: "Add expense" })).toBeNull();
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
