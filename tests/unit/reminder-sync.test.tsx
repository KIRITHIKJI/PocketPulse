import { act, render } from "@testing-library/react";

import {
  CHECK_EVERY_MS,
  CheckRemindersAgain,
  LAST_CHECK_KEY,
  ReminderSync,
} from "@/components/reminders/reminder-sync";

const syncReminders = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/lib/actions/reminders", () => ({ syncReminders }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const OWNER = "owner-a";
const flush = () => act(async () => {});

describe("ReminderSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    syncReminders.mockClear();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("checks on the first opening, then not again on reloads within half an hour", async () => {
    const first = render(<ReminderSync ownerId={OWNER} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(syncReminders).toHaveBeenCalledTimes(1);
    first.unmount();

    // A reload or a second tab ten minutes later.
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    render(<ReminderSync ownerId={OWNER} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(syncReminders).toHaveBeenCalledTimes(1);

    // Due again once half an hour has passed since the last check.
    await act(() => vi.advanceTimersByTimeAsync(20 * 60_000));
    expect(syncReminders).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(syncReminders).toHaveBeenCalledTimes(3);
  });

  it("checks straight away for a different account on the same device", async () => {
    window.localStorage.setItem(LAST_CHECK_KEY, JSON.stringify({ ownerId: OWNER, at: Date.now() }));
    render(<ReminderSync ownerId="owner-b" />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(syncReminders).toHaveBeenCalledTimes(1);
  });

  it("refreshes the screen only when a reminder was created", async () => {
    syncReminders.mockResolvedValueOnce([{ title: "Log today", body: "", linkPath: "/add" }]);
    render(<ReminderSync ownerId={OWNER} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    await flush();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("still checks every half hour when storage is blocked", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      render(<ReminderSync ownerId={OWNER} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(syncReminders).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
      expect(syncReminders).toHaveBeenCalledTimes(2);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("skips while offline and tries again after a full interval", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      render(<ReminderSync ownerId={OWNER} />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(syncReminders).not.toHaveBeenCalled();
      online.mockReturnValue(true);
      await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
      expect(syncReminders).toHaveBeenCalledTimes(1);
    } finally {
      online.mockRestore();
    }
  });

  it("checks again on the next opening after reminder settings are saved", async () => {
    const first = render(<ReminderSync ownerId={OWNER} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    first.unmount();
    expect(syncReminders).toHaveBeenCalledTimes(1);

    const form = render(<CheckRemindersAgain savedAt={undefined} />);
    form.rerender(<CheckRemindersAgain savedAt={Date.now()} />);
    render(<ReminderSync ownerId={OWNER} />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(syncReminders).toHaveBeenCalledTimes(2);
  });
});
