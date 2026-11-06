/** Moves one item to a new position; positions outside the list are clamped. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item!);
  return next;
}

/**
 * Where a dragged row belongs: the number of other rows whose middle is above the pointer.
 * `middles` are the rows' vertical centres when the drag started, in list order.
 */
export function dropIndex(middles: readonly number[], from: number, pointerY: number): number {
  let index = 0;
  middles.forEach((middle, i) => {
    if (i !== from && pointerY > middle) index += 1;
  });
  return index;
}
