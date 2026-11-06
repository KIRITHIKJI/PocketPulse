import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { ToastProvider, useToast } from "@/components/feedback/toast";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

describe("cn with design tokens", () => {
  it("treats token sizes as sizes, so a colour doesn't remove them", () => {
    expect(cn("text-caption", "text-muted-foreground")).toBe("text-caption text-muted-foreground");
    expect(cn("type-heading", "text-sm")).toBe("text-sm");
    expect(cn("p-surface", "p-2")).toBe("p-2");
  });
});

describe("Button", () => {
  it("blocks clicks and keeps its label while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        <Plus aria-hidden="true" />
        Save entry
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save entry" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    // The spinner replaces the leading icon instead of adding one, so the width doesn't jump.
    expect(button.querySelectorAll("svg")).toHaveLength(1);
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is clickable and not busy by default", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save entry</Button>);
    const button = screen.getByRole("button", { name: "Save entry" });
    expect(button).not.toHaveAttribute("aria-busy");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("asks for 44 px on touch screens at every size that's smaller", () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
        <Button size="icon" aria-label="Icon" />
        <Button size="icon-sm" aria-label="Small icon" />
      </>,
    );
    for (const name of ["Default", "Small"]) {
      expect(screen.getByRole("button", { name }).className).toContain("pointer-coarse:h-11");
    }
    for (const name of ["Icon", "Small icon"]) {
      expect(screen.getByRole("button", { name }).className).toContain("pointer-coarse:size-11");
    }
  });
});

describe("Progress", () => {
  it("reports basis points as a percentage", () => {
    render(<Progress bp={4_250} label="Budget used" />);
    const bar = screen.getByRole("progressbar", { name: "Budget used" });
    expect(bar).toHaveAttribute("aria-valuenow", "43");
    expect(bar).toHaveAttribute("aria-valuetext", "43%");
    expect(bar.parentElement).toHaveAttribute("data-state", "partial");
  });

  it("draws over 100 % as full with a marker, and keeps the real value in the text", () => {
    render(<Progress bp={12_500} aria-label="Budget used" />);
    const bar = screen.getByRole("progressbar", { name: "Budget used" });
    expect(bar).toHaveAttribute("aria-valuetext", "125%");
    expect(bar.parentElement).toHaveAttribute("data-state", "over");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
  });

  it("names empty, complete and loading states", () => {
    const { rerender } = render(<Progress bp={0} aria-label="Goal" />);
    expect(screen.getByRole("progressbar").parentElement).toHaveAttribute("data-state", "empty");
    rerender(<Progress bp={10_000} aria-label="Goal" />);
    expect(screen.getByRole("progressbar").parentElement).toHaveAttribute("data-state", "complete");
    rerender(<Progress indeterminate aria-label="Goal" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("aria-valuetext", "Loading");
  });

  it("counts steps as segments", () => {
    render(<Progress steps={7} value={4} tone="neutral" label="Days logged" />);
    const bar = screen.getByRole("progressbar", { name: "Days logged" });
    expect(bar).toHaveAttribute("aria-valuemax", "7");
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuetext", "4 of 7");
    expect(bar.children).toHaveLength(7);
  });

  it("never draws a negative width", () => {
    render(<Progress bp={-300} aria-label="Refund-heavy" />);
    const bar = screen.getByRole("progressbar");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("0%");
  });
});

describe("Surface", () => {
  it("keeps its box and marks itself busy while loading", () => {
    render(
      <Surface loading data-testid="surface">
        <p>Balance</p>
      </Surface>,
    );
    const surface = screen.getByTestId("surface");
    expect(surface).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Balance")).toBeNull();
  });

  it("renders as a link when interactive", () => {
    render(
      <Surface variant="interactive" asChild>
        <a href="/rewards">
          <SurfaceHeader title="Level 3" meta="120 XP to level 4" />
        </a>
      </Surface>,
    );
    const link = screen.getByRole("link", { name: /Level 3/ });
    expect(link).toHaveAttribute("data-variant", "interactive");
    expect(screen.getByRole("heading", { name: "Level 3" })).toBeInTheDocument();
  });
});

describe("StatePanel sizes", () => {
  it("keeps the action inside the panel at both sizes", () => {
    const { rerender } = render(
      <StatePanel title="No budgets yet" actions={<button>Set a monthly budget</button>} />,
    );
    const panel = screen.getByRole("heading", { name: "No budgets yet" }).closest("section")!;
    expect(panel).toHaveAttribute("data-size", "page");
    expect(panel).toContainElement(screen.getByRole("button", { name: "Set a monthly budget" }));

    rerender(
      <StatePanel
        size="section"
        title="No budgets yet"
        actions={<button>Set a monthly budget</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "No budgets yet" }).closest("section"),
    ).toHaveAttribute("data-size", "section");
  });
});

describe("Notice", () => {
  it("announces errors as alerts and the rest politely, and can be dismissed", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Notice tone="error">Couldn’t load budgets.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load budgets.");

    rerender(
      <Notice tone="offline" onDismiss={onDismiss}>
        You’re offline.
      </Notice>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("You’re offline.");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("Toast feedback ladder", () => {
  function Trigger({ routine, tone }: { routine?: boolean; tone?: "progress" | "milestone" }) {
    const { show } = useToast();
    return (
      <button
        onClick={() =>
          show({
            tone: tone ?? "success",
            message: "Tea ₹10 saved",
            title: tone === "milestone" ? "Achievement unlocked" : undefined,
            routine,
          })
        }
      >
        Save
      </button>
    );
  }

  it("goes quiet from the third routine save in two minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <ToastProvider>
          <Trigger routine />
        </ToastProvider>,
      );
      const save = screen.getByRole("button", { name: "Save" });
      await user.click(save);
      expect(screen.getByTestId("toast")).not.toHaveAttribute("data-quiet");
      await user.click(save);
      expect(screen.getByTestId("toast")).not.toHaveAttribute("data-quiet");
      await user.click(save);
      expect(screen.getByTestId("toast")).toHaveAttribute("data-quiet", "true");

      // After a quiet spell it's a normal toast again.
      act(() => vi.advanceTimersByTime(2 * 60_000 + 1));
      await user.click(save);
      expect(screen.getByTestId("toast")).not.toHaveAttribute("data-quiet");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never quiets a toast that isn't routine, and gives milestones a title", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger tone="milestone" />
      </ToastProvider>,
    );
    const save = screen.getByRole("button", { name: "Save" });
    for (let i = 0; i < 4; i += 1) await user.click(save);
    const toast = screen.getByTestId("toast");
    expect(toast).not.toHaveAttribute("data-quiet");
    expect(toast).toHaveAttribute("data-tone", "milestone");
    expect(toast).toHaveTextContent("Achievement unlocked");
  });
});
