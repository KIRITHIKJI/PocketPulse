import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/rewards", () => ({
  changeQuest: vi.fn(),
  markWeekReviewed: vi.fn(),
}));

import { MissionRow } from "@/components/rewards/progress-parts";
import type { MissionView } from "@/lib/rewards/view";

const sort: MissionView = {
  code: "categorise_week",
  title: "Clear Uncategorized",
  description: "Give every expense this week a category.",
  cadence: "weekly",
  xp: 20,
  target: 1,
  progress: 1,
  complete: true,
  skipped: false,
  toSort: 0,
};

describe("a completed mission", () => {
  it("keeps saying Completed, with no hint when nothing new needs sorting", () => {
    render(<MissionRow mission={sort} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByTestId("mission-to-sort")).toBeNull();
  });

  it("shows entries logged since as a separate hint, not as lost progress", () => {
    render(<MissionRow mission={{ ...sort, toSort: 2 }} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    const hint = screen.getByTestId("mission-to-sort");
    expect(hint).toHaveTextContent("2 new entries to sort");
    expect(hint).toHaveAttribute("href", "/categories?tab=uncategorized");
    expect(screen.queryByRole("button", { name: /Skip/ })).toBeNull();
  });

  it("says entry for one", () => {
    render(<MissionRow mission={{ ...sort, toSort: 1 }} />);
    expect(screen.getByTestId("mission-to-sort")).toHaveTextContent("1 new entry to sort");
  });
});
