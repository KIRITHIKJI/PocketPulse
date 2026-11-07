import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RewardFeedbackProvider, useRewardFeedback } from "@/components/feedback/reward-feedback";
import { ToastProvider, useToast } from "@/components/feedback/toast";
import {
  type QueueState,
  type RewardTier,
  EMPTY_QUEUE,
  amendAction,
  cancelSource,
  dismiss,
  enqueueReward,
  showAction,
} from "@/lib/feedback-queue";
import type { RewardFeedback } from "@/lib/rewards/feedback";

const syncRewardFeedback = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/rewards", () => ({ syncRewardFeedback }));

type S = QueueState<string, string>;
let nextId = 0;
const action = (payload: string, sourceId: string | null = null) => ({
  kind: "action" as const,
  id: ++nextId,
  sourceId,
  note: null,
  payload,
});
const reward = (tier: RewardTier, payload: string, sourceId: string | null = null) => ({
  kind: "reward" as const,
  id: ++nextId,
  sourceId,
  tier,
  payload,
});
const visible = (s: S) => (s.current ? [s.current.payload] : []);

describe("the pop-up queue", () => {
  it("rewards wait for the confirmation, then come one at a time in ladder order", () => {
    let s: S = EMPTY_QUEUE;
    s = showAction(s, action("Saved", "op1"));
    s = enqueueReward(s, reward("level", "Level 2", "op1"));
    s = enqueueReward(s, reward("achievement", "First 10", "op1"));
    s = enqueueReward(s, reward("mission", "Log today", "op1"));
    const seen: string[] = [];
    while (s.current) {
      seen.push(s.current.payload);
      expect(visible(s)).toHaveLength(1);
      s = dismiss(s);
    }
    expect(seen).toEqual(["Saved", "Log today", "First 10", "Level 2"]);
  });

  it("a new confirmation takes the screen, and the reward it covered comes back in its place", () => {
    let s: S = EMPTY_QUEUE;
    s = enqueueReward(s, reward("mission", "Log today"));
    s = enqueueReward(s, reward("achievement", "First 10"));
    expect(s.current?.payload).toBe("Log today");
    s = showAction(s, action("Saved"));
    expect(visible(s)).toEqual(["Saved"]);
    s = dismiss(s);
    expect(s.current?.payload).toBe("Log today");
    s = dismiss(s);
    expect(s.current?.payload).toBe("First 10");
    // A level that was showing never jumps ahead of a mission that arrived meanwhile.
    let t: S = enqueueReward(EMPTY_QUEUE, reward("level", "Level 2"));
    t = showAction(t, action("Saved"));
    t = enqueueReward(t, reward("mission", "Log today"));
    expect(t.waiting.map((w) => w.payload)).toEqual(["Log today", "Level 2"]);
  });

  it("the XP line joins its own save's confirmation, or waits as its own notice", () => {
    let s: S = showAction(EMPTY_QUEUE, action("Saved", "op1"));
    const joined = amendAction(s, "op1", "+10 XP");
    expect(joined?.current).toMatchObject({ kind: "action", note: "+10 XP" });
    expect(amendAction(s, "op2", "+10 XP")).toBeNull();
    s = dismiss(s);
    expect(amendAction(s, "op1", "+10 XP")).toBeNull();
  });

  it("an Undo drops what its save earned that hasn't shown, and nothing else", () => {
    let s: S = showAction(EMPTY_QUEUE, action("Saved", "op1"));
    s = enqueueReward(s, reward("mission", "Log today", "op1"));
    s = enqueueReward(s, reward("achievement", "Other", "op2"));
    s = cancelSource(s, "op1");
    expect(s.waiting.map((w) => w.payload)).toEqual(["Other"]);
    // A cancelled reward that's on screen goes, and the next one shows.
    let t: S = enqueueReward(EMPTY_QUEUE, reward("mission", "Log today", "op1"));
    t = enqueueReward(t, reward("level", "Level 2", "op3"));
    t = cancelSource(t, "op1");
    expect(t.current?.payload).toBe("Level 2");
  });

  it("dismissing by id ignores an item that already left", () => {
    const s: S = showAction(EMPTY_QUEUE, action("Saved"));
    expect(dismiss(s, 999)).toBe(s);
  });

  it("never holds more than one visible item, whatever happens in whatever order", () => {
    // A seeded walk through every operation: the state can't even express two at once, and
    // every item that went in is either shown, waiting, dismissed or cancelled; none is lost.
    let seed = 7;
    const rand = (n: number) => (((seed = (seed * 48_271) % 2_147_483_647) % n) + n) % n;
    const tiers: RewardTier[] = ["progress", "mission", "achievement", "level"];
    let s: S = EMPTY_QUEUE;
    for (let step = 0; step < 2_000; step += 1) {
      const source = `op${rand(4)}`;
      switch (rand(5)) {
        case 0:
          s = showAction(s, action(`a${step}`, source));
          break;
        case 1:
          s = enqueueReward(s, reward(tiers[rand(4)]!, `r${step}`, source));
          break;
        case 2:
          s = amendAction(s, source, "+10 XP") ?? s;
          break;
        case 3:
          s = cancelSource(s, source);
          break;
        default:
          s = dismiss(s);
      }
      expect(visible(s).length).toBeLessThanOrEqual(1);
      expect(s.waiting.every((w) => w.kind === "reward")).toBe(true);
      // Waiting rewards are always in ladder order, including one a confirmation pushed back.
      const rank = s.waiting.map((w) => tiers.indexOf(w.tier));
      expect(rank).toEqual([...rank].sort((a, b) => a - b));
    }
  });
});

const feedback = (over: Partial<RewardFeedback> = {}): RewardFeedback => ({
  routineXp: 10,
  routineReasons: ["Logged today"],
  progress: [],
  missionsCompleted: [{ code: "log_today", title: "Log today", xp: 5 }],
  achievements: [
    { code: "first_10_transactions", title: "First 10", description: "Ten entries.", xp: 50 },
  ],
  levelUp: { from: 1, to: 2, rank: "Starter", rankChanged: false },
  status: {
    xp: 115,
    level: 2,
    rank: "Starter",
    levelXp: 15,
    levelSpan: 200,
    progressBp: 750,
    streakDays: 1,
    asOf: 1,
  },
  ...over,
});

function Harness() {
  const { show } = useToast();
  const { afterSave, afterRemoval } = useRewardFeedback();
  return (
    <>
      <button
        onClick={() => {
          show({ tone: "success", message: "Saved Tea", sourceId: "op1", durationMs: 60_000 });
          afterSave("op1");
        }}
      >
        save
      </button>
      <button onClick={() => afterRemoval("op1", undefined)}>undo</button>
    </>
  );
}

/** Everything that counts as a pop-up on screen right now. */
const popUps = () => [...screen.queryAllByTestId("toast"), ...screen.queryAllByTestId("level-up")];

describe("the feedback ladder on screen", () => {
  beforeEach(() => syncRewardFeedback.mockReset());

  function mount(enabled = true) {
    return render(
      <ToastProvider>
        <RewardFeedbackProvider enabled={enabled}>
          <Harness />
        </RewardFeedbackProvider>
      </ToastProvider>,
    );
  }

  it("save → XP line → mission → achievement → level-up, never two at once", async () => {
    syncRewardFeedback.mockResolvedValue(feedback());
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "save" }));
    await act(async () => {});

    // The confirmation carries the quiet XP line; nothing else is up.
    expect(popUps()).toHaveLength(1);
    expect(screen.getByTestId("toast")).toHaveTextContent("Saved Tea");
    expect(screen.getByTestId("toast-xp")).toHaveTextContent("+10 XP · Logged today");

    const order: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(popUps()).toHaveLength(1);
      order.push(screen.getByTestId("toast").textContent ?? "");
    }
    expect(order[0]).toContain("Mission complete");
    expect(order[0]).toContain("Log today · +5 XP");
    expect(order[1]).toContain("Achievement unlocked");
    expect(order[1]).toContain("First 10");

    // The peak moment comes last, alone on screen, and waits for the person.
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(screen.getByTestId("level-up")).toHaveTextContent("Level 2");
    expect(popUps()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(popUps()).toHaveLength(0);
  });

  it("the XP line gets quieter with repetition", async () => {
    syncRewardFeedback.mockResolvedValue(
      feedback({ missionsCompleted: [], achievements: [], levelUp: null }),
    );
    const user = userEvent.setup();
    mount();
    const lines: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "save" }));
      await act(async () => {});
      lines.push(screen.getByTestId("toast-xp").textContent ?? "");
    }
    expect(lines.slice(0, 2)).toEqual(["+10 XP · Logged today", "+10 XP · Logged today"]);
    expect(lines.slice(2)).toEqual(["+10 XP", "+10 XP"]);
  });

  it("an Undo before the answer arrives means nothing it earned ever shows", async () => {
    let answer!: (f: RewardFeedback) => void;
    syncRewardFeedback.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "save" }));
    await user.click(screen.getByRole("button", { name: "undo" }));
    await act(async () => answer(feedback()));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(popUps()).toHaveLength(0);
  });

  it("with progress features off, rewards still sync but nothing pops up", async () => {
    syncRewardFeedback.mockResolvedValue(feedback());
    const user = userEvent.setup();
    mount(false);
    await user.click(screen.getByRole("button", { name: "save" }));
    await act(async () => {});
    expect(syncRewardFeedback).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("toast-xp")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(popUps()).toHaveLength(0);
  });

  it("a sync that answers nothing new shows nothing", async () => {
    syncRewardFeedback.mockResolvedValue(
      feedback({
        routineXp: 0,
        routineReasons: [],
        missionsCompleted: [],
        achievements: [],
        levelUp: null,
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "save" }));
    await act(async () => {});
    expect(screen.queryByTestId("toast-xp")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(popUps()).toHaveLength(0);
  });
});
