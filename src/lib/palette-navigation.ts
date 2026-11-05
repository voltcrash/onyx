export function nextEnabledIndex(
  items: ReadonlyArray<{ disabled?: boolean }>,
  current: number,
  delta: number,
): number {
  if (!items.length || !delta) return -1;
  const step = Math.sign(delta);
  let index = (((current + delta) % items.length) + items.length) % items.length;
  for (let checked = 0; checked < items.length; checked += 1) {
    if (!items[index].disabled) return index;
    index = (index + step + items.length) % items.length;
  }
  return -1;
}
