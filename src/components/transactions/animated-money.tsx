"use client";

import * as React from "react";

import { type CurrencyCode, formatMoney } from "@/domain";

const DURATION_MS = 600;

function reducedMotion(): boolean {
  const pref = document.documentElement.dataset.motion;
  if (pref === "reduce") return true;
  if (pref === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A money figure that counts to its new value when it changes (e.g. the balance after an
 * entry). Frames show whole paise; the last frame is always the exact amount. The first render
 * and reduced-motion users get the exact amount immediately.
 */
export function AnimatedMoney({
  paise,
  currency,
  className,
  ...props
}: {
  paise: number;
  currency: CurrencyCode;
  className?: string;
  "data-testid"?: string;
}) {
  const [shown, setShown] = React.useState(paise);
  const shownRef = React.useRef(paise);

  React.useEffect(() => {
    const from = shownRef.current;
    if (from === paise) return;
    const set = (value: number) => {
      shownRef.current = value;
      setShown(value);
    };
    if (reducedMotion()) {
      set(paise);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      set(progress === 1 ? paise : from + Math.round((paise - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      set(paise);
    };
  }, [paise]);

  return (
    <span className={className} data-paise={paise} {...props}>
      <span aria-hidden="true">{formatMoney(shown, { currency })}</span>
      <span className="sr-only">{formatMoney(paise, { currency })}</span>
    </span>
  );
}
