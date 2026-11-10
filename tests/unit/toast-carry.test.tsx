import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = { current: "/settings/sync" };
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { ToastProvider, carryToast } from "@/components/feedback/toast";

const KEY = "pocketpulse:toast-on-arrival";
const MESSAGE = "Change saved on this device. It’ll sync when you’re back online.";

afterEach(() => {
  window.sessionStorage.clear();
  pathname.current = "/settings/sync";
});

describe("a confirmation carried across a reload", () => {
  it("shows once on the page it was meant for, after a full page load", () => {
    carryToast("/settings/sync", MESSAGE);
    render(<ToastProvider>page</ToastProvider>);
    expect(screen.getByTestId("toast")).toHaveTextContent(MESSAGE);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("isn't shown twice when the navigation was soft and the toast is still up", () => {
    pathname.current = "/transactions/1/edit";
    const view = render(<ToastProvider>page</ToastProvider>);
    carryToast("/settings/sync", MESSAGE);
    pathname.current = "/settings/sync";
    view.rerender(<ToastProvider>page</ToastProvider>);
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("waits on another page, and is dropped once it's stale", () => {
    carryToast("/settings/sync", MESSAGE);
    pathname.current = "/home";
    const first = render(<ToastProvider>page</ToastProvider>);
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).not.toBeNull();
    first.unmount();

    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ path: "/settings/sync", message: MESSAGE, at: Date.now() - 60_000 }),
    );
    pathname.current = "/settings/sync";
    render(<ToastProvider>page</ToastProvider>);
    expect(screen.queryByTestId("toast")).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});
