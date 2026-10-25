import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** True after hydration. Use to render client-only values (e.g. resolved theme) without mismatches. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
